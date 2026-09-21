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
import { can, narrowingApplies, PermissionError } from "../utils/permissions";
import { logAudit } from "../utils/auditLog";

// Disbursements: recorded — not targeted — per Company/Year/Quarter, same
// hierarchy as Quarter Actuals but with no corresponding Target endpoint.
// A single plain amount + Remarks per Company/Year/Quarter (used to be three
// sub-categories — Advances/Loans/Interests, each split Internal/External —
// collapsed down the same way Expenses was; see DisbursementNote for the
// growable, informational-only record-keeping facility that replaced that
// breakdown). Gated by the single combined DISBURSEMENTS Custom Role
// resource — see utils/permissions.ts. Intended as a building block toward a
// later consolidated financial pane of glass; today it feeds the
// Disbursement card on the Revenue dashboard and Executive Scorecard, and is
// entered as an extra field group on the Data Entry page
// (client/src/pages/IntegratorPortal.tsx) alongside Revenue/Collections/
// Expenses, rather than on a separate page.
const router = Router();
router.use(requireAuth);
router.use(blockPendingPasswordChange);

router.get("/", async (req, res) => {
  const { yearId, quarter, businessUnitId, companyId } = req.query as Record<string, string | undefined>;
  if (!yearId) return res.status(400).json({ error: "yearId is required" });

  const user = req.user!;
  const permRows = await loadUserPermissions(user);

  try {
    if (companyId) {
      const buId = await resolveCompanyBusinessUnit(companyId);
      assertBusinessUnitAccess(user, buId);
      if (narrowingApplies(Boolean(user.role), permRows, ["DISBURSEMENTS"]) && !can(permRows, "view", "DISBURSEMENTS", { businessUnitId: buId, companyId })) {
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

    if (narrowingApplies(Boolean(user.role), permRows, ["DISBURSEMENTS"])) {
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

// Upsert a Company/Year/Quarter's single Disbursements amount + Remarks.
const putSchema = z.object({
  companyId: z.string().uuid(),
  yearId: z.string().uuid(),
  quarter: z.number().int().min(1).max(4),
  amount: z.number().min(0).default(0),
  remarks: z.string().max(2000).optional().default(""),
});

router.put("/", async (req, res) => {
  const parsed = putSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid disbursement payload" });

  const { companyId, yearId, quarter, amount, remarks } = parsed.data;

  try {
    const businessUnitId = await resolveCompanyBusinessUnit(companyId);
    assertBusinessUnitAccess(req.user!, businessUnitId);
    const permRows = await loadUserPermissions(req.user!);
    if (narrowingApplies(Boolean(req.user!.role), permRows, ["DISBURSEMENTS"]) && !can(permRows, "edit", "DISBURSEMENTS", { businessUnitId, companyId })) {
      throw new PermissionError("Your assigned role does not grant edit access to disbursements here");
    }
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  const data = { amount, remarks, updatedById: req.user!.id };

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
    summary: `Updated Q${quarter} disbursements for Company ${companyId}`,
    metadata: { companyId, yearId, quarter, amount },
  });
  res.json(row);
});

export default router;
