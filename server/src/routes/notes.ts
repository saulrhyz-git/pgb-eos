import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import {
  assertBusinessUnitAccess,
  blockPendingPasswordChange,
  requireAuth,
  loadUserPermissions,
  resolveCompanyBusinessUnit,
  scopedBusinessUnitFilter,
} from "../middleware/auth";
import { can, hasAnyGrant, PermissionError, Resource } from "../utils/permissions";
import { logAudit } from "../utils/auditLog";

// Shared implementation for the "notable line items" record-keeping facility
// attached to Expenses and Disbursements (see schema.prisma's ExpenseNote/
// DisbursementNote comment) — a growable list of Company/Year/Quarter-scoped
// entries (category + amount + remarks) that is purely informational: it is
// never read by aggregate.ts/computeScorecard, so nothing here ever feeds a
// KPI, attainment %, or AI Analysis figure. Both models are structurally
// identical and gated by their parent category's existing Custom Role
// resource (EXPENSES/DISBURSEMENTS) rather than a resource of their own, so
// this file builds one router per model from a shared factory instead of
// duplicating the CRUD logic twice.
function buildNotesRouter(opts: {
  model: "expenseNote" | "disbursementNote";
  categoryType: "EXPENSE" | "DISBURSEMENT";
  resource: Resource;
  entityType: string;
}) {
  const router = Router();
  router.use(requireAuth);
  router.use(blockPendingPasswordChange);

  const delegate = () => (prisma as any)[opts.model];

  router.get("/", async (req, res) => {
    const { yearId, quarter, businessUnitId, companyId } = req.query as Record<string, string | undefined>;
    if (!yearId) return res.status(400).json({ error: "yearId is required" });

    const user = req.user!;
    const permRows = await loadUserPermissions(user);

    try {
      if (companyId) {
        const buId = await resolveCompanyBusinessUnit(companyId);
        assertBusinessUnitAccess(user, buId);
        if (hasAnyGrant(permRows, [opts.resource]) && !can(permRows, "view", opts.resource, { businessUnitId: buId, companyId })) {
          throw new PermissionError(`Your assigned role does not grant view access to ${opts.resource.toLowerCase()} here`);
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

      if (hasAnyGrant(permRows, [opts.resource])) {
        const companyWhere: any = {};
        if (buFilter) companyWhere.businessUnitId = buFilter;
        const candidates = await prisma.company.findMany({ where: companyWhere, select: { id: true, businessUnitId: true } });
        const permittedIds = candidates
          .filter((c) => can(permRows, "view", opts.resource, { businessUnitId: c.businessUnitId, companyId: c.id }))
          .map((c) => c.id);
        where.companyId = { in: permittedIds };
      } else if (buFilter) {
        where.company = { businessUnitId: buFilter };
      }
    }

    const rows = await delegate().findMany({
      where,
      include: { category: { select: { id: true, label: true, type: true } } },
      orderBy: [{ quarter: "asc" }, { createdAt: "asc" }],
    });
    res.json(rows);
  });

  const createSchema = z.object({
    companyId: z.string().uuid(),
    yearId: z.string().uuid(),
    quarter: z.number().int().min(1).max(4),
    categoryId: z.string().uuid(),
    amount: z.number().min(0).default(0),
    remarks: z.string().max(2000).optional().default(""),
  });

  router.post("/", async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid note payload" });

    const { companyId, yearId, quarter, categoryId, amount, remarks } = parsed.data;

    let businessUnitId: string;
    try {
      businessUnitId = await resolveCompanyBusinessUnit(companyId);
      assertBusinessUnitAccess(req.user!, businessUnitId);
      const permRows = await loadUserPermissions(req.user!);
      if (hasAnyGrant(permRows, [opts.resource]) && !can(permRows, "edit", opts.resource, { businessUnitId, companyId })) {
        throw new PermissionError(`Your assigned role does not grant edit access to ${opts.resource.toLowerCase()} here`);
      }
    } catch (err: any) {
      return res.status(err.status || 500).json({ error: err.message });
    }

    const category = await prisma.noteCategory.findUnique({ where: { id: categoryId } });
    if (!category || category.type !== opts.categoryType) {
      return res.status(400).json({ error: "Invalid category for this note type" });
    }

    const row = await delegate().create({
      data: { companyId, yearId, quarter, categoryId, amount, remarks },
      include: { category: { select: { id: true, label: true, type: true } } },
    });
    await logAudit({
      user: req.user,
      action: `${opts.entityType.toUpperCase()}_CREATE`,
      entityType: opts.entityType,
      entityId: row.id,
      summary: `Added a "${category.label}" note (${opts.resource.toLowerCase()}, informational only) for Q${quarter}, Company ${companyId}`,
      metadata: { companyId, yearId, quarter, categoryId, amount },
    });
    res.status(201).json(row);
  });

  router.delete("/:id", async (req, res) => {
    const existing = await delegate().findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Not found" });

    try {
      const businessUnitId = await resolveCompanyBusinessUnit(existing.companyId);
      assertBusinessUnitAccess(req.user!, businessUnitId);
      const permRows = await loadUserPermissions(req.user!);
      if (hasAnyGrant(permRows, [opts.resource]) && !can(permRows, "delete", opts.resource, { businessUnitId, companyId: existing.companyId })) {
        throw new PermissionError(`Your assigned role does not grant delete access to ${opts.resource.toLowerCase()} here`);
      }
    } catch (err: any) {
      return res.status(err.status || 500).json({ error: err.message });
    }

    await delegate().delete({ where: { id: req.params.id } });
    await logAudit({
      user: req.user,
      action: `${opts.entityType.toUpperCase()}_DELETE`,
      entityType: opts.entityType,
      entityId: existing.id,
      summary: `Removed a note (${opts.resource.toLowerCase()}, informational only) for Q${existing.quarter}, Company ${existing.companyId}`,
    });
    res.status(204).send();
  });

  return router;
}

export const expenseNotesRouter = buildNotesRouter({
  model: "expenseNote",
  categoryType: "EXPENSE",
  resource: "EXPENSES",
  entityType: "ExpenseNote",
});

export const disbursementNotesRouter = buildNotesRouter({
  model: "disbursementNote",
  categoryType: "DISBURSEMENT",
  resource: "DISBURSEMENTS",
  entityType: "DisbursementNote",
});
