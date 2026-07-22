import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { blockPendingPasswordChange, requireAuth, requireRole } from "../middleware/auth";
import { logAudit } from "../utils/auditLog";

// Superadmin-only bulk data entry: lets a Superadmin load many Companies'
// worth of a quarter's Revenue/Collections/Expenses actuals AND Disbursements
// in one CSV/Excel upload, instead of one Company/Quarter at a time via the
// Financials Data Entry page (client/src/pages/IntegratorPortal.tsx) — the
// same two figures the single-entry form's "Save All Figures" button saves
// together (one PUT /actuals + one PUT /disbursements), just for many rows
// at once.
//
// Kept as its own router — not bolted onto actuals.ts or disbursements.ts —
// since it spans both the QuarterActual and DisbursementActual models, and
// because its access rule is deliberately different from every other write
// route in the app: it is NOT gated by the Custom Role permission system
// (see utils/permissions.ts) at all, and does not check assertBusinessUnitAccess
// or any per-category grant. Only a real Superadmin (req.user.role ===
// "SUPERADMIN") may use it, full stop — this is intentionally a narrower,
// simpler gate than everywhere else, not an extension of the Custom Role
// model, since a bulk facility that can silently overwrite many Companies'
// figures at once is high-blast-radius enough to keep off the normal
// role/permission surface entirely.
const router = Router();
router.use(requireAuth);
router.use(blockPendingPasswordChange);
router.use(requireRole("SUPERADMIN"));

// Same 9 figure fields + 8 remarks fields as QuarterActual (see actuals.ts),
// plus Disbursements' amount + remarks riding along in the same row since
// they're entered together on the single-entry Data Entry page.
const ACTUAL_FIGURE_KEYS = [
  "revenueInternal",
  "revenueExternal",
  "collectionsInternalEarned",
  "collectionsInternalUnearned",
  "collectionsInternalOthers",
  "collectionsExternalEarned",
  "collectionsExternalUnearned",
  "collectionsExternalOthers",
  "expenses",
] as const;

const ACTUAL_REMARKS_KEYS = [
  "revenueRemarks",
  "collectionsInternalEarnedRemarks",
  "collectionsInternalUnearnedRemarks",
  "collectionsInternalOthersRemarks",
  "collectionsExternalEarnedRemarks",
  "collectionsExternalUnearnedRemarks",
  "collectionsExternalOthersRemarks",
  "expensesRemarks",
] as const;

const bulkRowSchema = z.object({
  // Echoed back in the response's `row` field when present, same rationale
  // as targets.ts's bulk-upload row schema: lets the frontend report errors
  // against the original spreadsheet line number even if it filtered out
  // some rows (e.g. blank lines) before submitting.
  sourceRow: z.number().int().min(1).optional(),
  businessUnitName: z.string().trim().optional(),
  companyName: z.string().trim().min(1, "Company is required"),
  quarter: z.number().int().min(1).max(4),
  revenueInternal: z.number().min(0).optional(),
  revenueExternal: z.number().min(0).optional(),
  collectionsInternalEarned: z.number().min(0).optional(),
  collectionsInternalUnearned: z.number().min(0).optional(),
  collectionsInternalOthers: z.number().min(0).optional(),
  collectionsExternalEarned: z.number().min(0).optional(),
  collectionsExternalUnearned: z.number().min(0).optional(),
  collectionsExternalOthers: z.number().min(0).optional(),
  expenses: z.number().min(0).optional(),
  revenueRemarks: z.string().max(2000).optional(),
  collectionsInternalEarnedRemarks: z.string().max(2000).optional(),
  collectionsInternalUnearnedRemarks: z.string().max(2000).optional(),
  collectionsInternalOthersRemarks: z.string().max(2000).optional(),
  collectionsExternalEarnedRemarks: z.string().max(2000).optional(),
  collectionsExternalUnearnedRemarks: z.string().max(2000).optional(),
  collectionsExternalOthersRemarks: z.string().max(2000).optional(),
  expensesRemarks: z.string().max(2000).optional(),
  disbursementAmount: z.number().min(0).optional(),
  disbursementRemarks: z.string().max(2000).optional(),
});
type BulkRow = z.infer<typeof bulkRowSchema>;

const bulkUploadSchema = z.object({
  yearId: z.string().uuid(),
  rows: z.array(bulkRowSchema).min(1, "At least one row is required").max(1000, "Too many rows in one upload (max 1000)"),
});

interface BulkRowResult {
  row: number; // 1-based, matching the spreadsheet's data rows (header excluded)
  companyName: string;
  businessUnitName?: string;
  quarter: number;
  status: "ok" | "error";
  error?: string;
}

function actualFiguresAndRemarks(row: BulkRow): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  for (const key of ACTUAL_FIGURE_KEYS) out[key] = Number((row as any)[key] ?? 0);
  for (const key of ACTUAL_REMARKS_KEYS) out[key] = String((row as any)[key] ?? "");
  return out;
}

router.post("/", async (req, res) => {
  const parsed = bulkUploadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid bulk upload payload", details: parsed.error.issues });
  }
  const { yearId, rows } = parsed.data;

  const yearRow = await prisma.year.findUnique({ where: { id: yearId }, select: { year: true } });
  if (!yearRow) return res.status(404).json({ error: "Year not found" });

  // Pre-load every Company (with its Business Unit name) once, rather than
  // querying per row — bulk uploads are exactly the case where an N+1 query
  // pattern would hurt (same rationale as targets.ts's bulk upload).
  const allCompanies = await prisma.company.findMany({
    include: { businessUnit: { select: { id: true, name: true } } },
  });

  const results: BulkRowResult[] = [];
  let successCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = row.sourceRow ?? i + 1;
    const base: Omit<BulkRowResult, "status" | "error"> = {
      row: rowNum,
      companyName: row.companyName,
      businessUnitName: row.businessUnitName,
      quarter: row.quarter,
    };

    try {
      // Match Company by name (case-insensitive), narrowed by Business Unit
      // name if the row provided one — required to disambiguate when the
      // same Company name exists in more than one Business Unit.
      const nameLower = row.companyName.trim().toLowerCase();
      let candidates = allCompanies.filter((c) => c.name.trim().toLowerCase() === nameLower);
      if (row.businessUnitName) {
        const buLower = row.businessUnitName.trim().toLowerCase();
        candidates = candidates.filter((c) => c.businessUnit.name.trim().toLowerCase() === buLower);
      }

      if (candidates.length === 0) {
        results.push({ ...base, status: "error", error: "Company not found" });
        continue;
      }
      if (candidates.length > 1) {
        results.push({
          ...base,
          status: "error",
          error: `Company name is ambiguous — matches ${candidates.length} Companies across different Business Units. Add a Business Unit column to disambiguate.`,
        });
        continue;
      }

      const company = candidates[0];
      const figuresAndRemarks = actualFiguresAndRemarks(row);
      const disbAmount = Number(row.disbursementAmount ?? 0);
      const disbRemarks = String(row.disbursementRemarks ?? "");

      // Both models upserted together in one transaction — a row either
      // saves both Actuals and Disbursements or neither, rather than leaving
      // a row half-applied if the second upsert somehow failed.
      await prisma.$transaction([
        prisma.quarterActual.upsert({
          where: { companyId_yearId_quarter: { companyId: company.id, yearId, quarter: row.quarter } },
          update: { ...figuresAndRemarks, updatedById: req.user!.id },
          create: { companyId: company.id, yearId, quarter: row.quarter, ...figuresAndRemarks, updatedById: req.user!.id } as any,
        }),
        prisma.disbursementActual.upsert({
          where: { companyId_yearId_quarter: { companyId: company.id, yearId, quarter: row.quarter } },
          update: { amount: disbAmount, remarks: disbRemarks, updatedById: req.user!.id },
          create: { companyId: company.id, yearId, quarter: row.quarter, amount: disbAmount, remarks: disbRemarks, updatedById: req.user!.id },
        }),
      ]);

      results.push({ ...base, status: "ok" });
      successCount++;
    } catch (err: any) {
      results.push({ ...base, status: "error", error: err.message || "Failed to save this row" });
    }
  }

  await logAudit({
    user: req.user,
    action: "BULK_DATA_ENTRY_UPLOAD",
    entityType: "QuarterActual",
    entityId: yearId,
    summary: `Bulk-uploaded ${successCount}/${rows.length} data entry row(s) (actuals + disbursements) for ${yearRow.year}`,
    metadata: { yearId, total: rows.length, successCount, errorCount: rows.length - successCount },
  });

  res.json({ successCount, errorCount: rows.length - successCount, results });
});

export default router;
