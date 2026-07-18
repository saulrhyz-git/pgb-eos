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
import { assertPermission, can } from "../utils/permissions";

const router = Router();
router.use(requireAuth);
router.use(blockPendingPasswordChange);

const figuresSchema = z.object({
  revenueInternal: z.number().min(0).default(0),
  revenueExternal: z.number().min(0).default(0),
  collectionsInternal: z.number().min(0).default(0),
  collectionsExternal: z.number().min(0).default(0),
  expensesInternal: z.number().min(0).default(0),
  expensesExternal: z.number().min(0).default(0),
});

// ---------- Quarter Targets ----------
// Targets are set once per Company per Year+Quarter (Group Integrator /
// Superadmin, or a BU Integrator scoped to their own assigned Business
// Unit(s)). There is no separate Annual Target entry anymore — Annual
// Target is purely a derived figure (sum of a Company's/Business Unit's
// Q1-Q4 QuarterTarget rows), computed on the fly in routes/dashboard.ts.

router.get("/quarter", async (req, res) => {
  const { yearId, quarter, businessUnitId, companyId } = req.query as Record<string, string | undefined>;
  if (!yearId) return res.status(400).json({ error: "yearId is required" });

  const user = req.user!;
  const permRows = await loadUserPermissions(user);

  try {
    if (companyId) {
      const buId = await resolveCompanyBusinessUnit(companyId);
      assertBusinessUnitAccess(user, buId);
      if (permRows.length) assertPermission(permRows, "view", "TARGETS", { businessUnitId: buId, companyId });
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

    if (permRows.length) {
      // A Custom Role narrows visibility further, down to only the
      // Companies it grants TARGETS view on (Company-level rows take
      // precedence over a Business-Unit-level grant for the same resource).
      const companyWhere: any = {};
      if (buFilter) companyWhere.businessUnitId = buFilter;
      const candidates = await prisma.company.findMany({ where: companyWhere, select: { id: true, businessUnitId: true } });
      const permittedIds = candidates
        .filter((c) => can(permRows, "view", "TARGETS", { businessUnitId: c.businessUnitId, companyId: c.id }))
        .map((c) => c.id);
      where.companyId = { in: permittedIds };
    } else if (buFilter) {
      where.company = { businessUnitId: buFilter };
    }
  }

  const targets = await prisma.quarterTarget.findMany({
    where,
    include: { company: { select: { id: true, name: true, businessUnitId: true } } },
    orderBy: { quarter: "asc" },
  });
  res.json(targets);
});

router.put("/quarter", async (req, res) => {
  const parsed = z
    .object({ companyId: z.string().uuid(), yearId: z.string().uuid(), quarter: z.number().int().min(1).max(4) })
    .merge(figuresSchema)
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid quarter target payload", details: parsed.error.issues });

  try {
    const businessUnitId = await resolveCompanyBusinessUnit(parsed.data.companyId);
    assertBusinessUnitAccess(req.user!, businessUnitId);
    const permRows = await loadUserPermissions(req.user!);
    if (permRows.length) assertPermission(permRows, "edit", "TARGETS", { businessUnitId, companyId: parsed.data.companyId });
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  const { companyId, yearId, quarter, ...figures } = parsed.data;
  const target = await prisma.quarterTarget.upsert({
    where: { companyId_yearId_quarter: { companyId, yearId, quarter } },
    update: figures,
    create: { companyId, yearId, quarter, ...figures },
  });
  res.json(target);
});

export default router;
