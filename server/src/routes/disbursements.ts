import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import {
  assertBusinessUnitAccess,
  blockPendingPasswordChange,
  loadUserPermissions,
  requireAuth,
  resolveCompanyBusinessUnit,
  scopedBusinessUnitFilter,
} from "../middleware/auth";
import { can, hasAnyGrant, PermissionError } from "../utils/permissions";
import { logAudit } from "../utils/auditLog";

// Disbursements: recorded — not targeted — per Company/Year/Quarter, same
// hierarchy as Quarter Actuals but with no corresponding Target endpoint.
// Unlike Revenue/Collections/Expenses (each independently gate-able), all
// three sub-categories here (Advances/Loans/Interests) share a single
// combined DISBURSEMENTS Custom Role resource — see utils/permissions.ts.
// Intended as a building block toward a later consolidated financial pane
// of glass; today it feeds the Disbursement cards on the Revenue dashboard
// and Executive Scorecard, and has its own three-sub-tab entry pages
// (Advances/Loans/Interests) on the frontend.
const router = Router();
router.use(requireAuth);
router.use(blockPendingPasswordChange);

export const DISBURSEMENT_CATEGORIES = ["ADVANCES", "LOANS", "INTERESTS"] as const;
export type DisbursementCategory = (typeof DISBURSEMENT_CATEGORIES)[number];

// Maps each sub-category to the three columns on the shared DisbursementActual
// row it owns — every sub-tab's PUT only ever touches its own three columns,
// leaving the other two categories' figures on the same row untouched.
const CATEGORY_FIELDS: Record<DisbursementCategory, { internal: string; external: string; remarks: string }> = {
  ADVANCES: { internal: "advancesInternal", external: "advancesExternal", remarks: "advancesRemarks" },
  LOANS: { internal: "loansInternal", external: "loansExternal", remarks: "loansRemarks" },
  INTERESTS: { internal: "interestsInternal", external: "interestsExternal", remarks: "interestsRemarks" },
};

router.get("/", async (req, res) => {
  const { yearId, quarter, businessUnitId, companyId } = req.query as Record<string, string | undefined>;
  if (!yearId) return res.status(400).json({ error: "yearId is required" });

  const user = req.user!;
  const permRows = await loadUserPermissions(user);

  try {
    if (companyId) {
      const buId = await resolveCompanyBusinessUnit(companyId);
      assertBusinessUnitAccess(user, buId);
      if (hasAnyGrant(permRows, ["DISBURSEMENTS"]) && !can(permRows, "view", "DISBURSEMENTS", { businessUnitId: buId, companyId })) {
        throw new PermissionError("Your assigned role does not grant view access to disbursements here");
      }
    }
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  const where: any = { yearId };
  if (quarter) where.quarter = Number(quarter);

  if (companyId) {
    where.companyId = companyId;
  } else {
    let buFilter: string | { in: string[] } | undefined;
    try {
      buFilter = scopedBusinessUnitFilter(user, businessUnitId);
    } catch (err: any) {
      return res.status(err.status || 500).json({ error: err.message });
    }

    if (hasAnyGrant(permRows, ["DISBURSEMENTS"])) {
      const companyWhere: any = {};
      if (buFilter) companyWhere.businessUnitId = buFilter;
      const candidates = await prisma.company.findMany({ where: companyWhere, select: { id: true, businessUnitId: true } });
      const permittedIds = candidates
        .filter((c) => can(permRows, "view", "DISBURSEMENTS", { businessUnitId: c.businessUnitId, companyId: c.id }))
        .map((c) => c.id);
      where.companyId = { in: permittedIds };
    } else if (buFilter) {
      where.company = { businessUnitId: buFilter };
    }
  }

  const rows = await prisma.disbursementActual.findMany({
    where,
    include: { company: { select: { id: true, name: true, businessUnitId: true } } },
    orderBy: { quarter: "asc" },
  });
  res.json(rows);
});

// Upsert one Disbursement sub-category (Advances/Loans/Interests) for a
// Company/Year/Quarter — each of the three sub-tab pages submits only its
// own category, leaving the other two untouched on the shared row.
const putSchema = z.object({
  companyId: z.string().uuid(),
  yearId: z.string().uuid(),
  quarter: z.number().int().min(1).max(4),
  category: z.enum(DISBURSEMENT_CATEGORIES),
  internal: z.number().min(0).default(0),
  external: z.number().min(0).default(0),
  remarks: z.string().max(2000).optional().default(""),
});

router.put("/", async (req, res) => {
  const parsed = putSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid disbursement payload" });

  const { companyId, yearId, quarter, category, internal, external, remarks } = parsed.data;

  try {
    const businessUnitId = await resolveCompanyBusinessUnit(companyId);
    assertBusinessUnitAccess(req.user!, businessUnitId);
    const permRows = await loadUserPermissions(req.user!);
    if (hasAnyGrant(permRows, ["DISBURSEMENTS"]) && !can(permRows, "edit", "DISBURSEMENTS", { businessUnitId, companyId })) {
      throw new PermissionError("Your assigned role does not grant edit access to disbursements here");
    }
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  const fields = CATEGORY_FIELDS[category];
  const data: Record<string, any> = {
    [fields.internal]: internal,
    [fields.external]: external,
    [fields.remarks]: remarks,
    updatedById: req.user!.id,
  };

  const row = await prisma.disbursementActual.upsert({
    where: { companyId_yearId_quarter: { companyId, yearId, quarter } },
    update: data,
    create: { companyId, yearId, quarter, ...data },
  });
  await logAudit({
    user: req.user,
    action: "DISBURSEMENT_UPDATE",
    entityType: "DisbursementActual",
    entityId: row.id,
    summary: `Updated Q${quarter} ${category.toLowerCase()} for Company ${companyId}`,
    metadata: { companyId, yearId, quarter, category, internal, external },
  });
  res.json(row);
});

export default router;
