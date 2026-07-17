import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { assertBusinessUnitAccess, requireAuth, requireRole, resolveCompanyBusinessUnit, scopedBusinessUnitFilter } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

const figuresSchema = z.object({
  revenueInternal: z.number().min(0).default(0),
  revenueExternal: z.number().min(0).default(0),
  collectionsInternal: z.number().min(0).default(0),
  collectionsExternal: z.number().min(0).default(0),
  expensesInternal: z.number().min(0).default(0),
  expensesExternal: z.number().min(0).default(0),
});

// ---------- Annual Targets (Group Integrator only) ----------

router.get("/annual", async (req, res) => {
  const { yearId, businessUnitId, companyId } = req.query as Record<string, string | undefined>;
  if (!yearId) return res.status(400).json({ error: "yearId is required" });

  const user = req.user!;
  try {
    if (companyId) assertBusinessUnitAccess(user, await resolveCompanyBusinessUnit(companyId));
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  const where: any = { yearId };
  if (companyId) {
    where.companyId = companyId;
  } else {
    try {
      const buFilter = scopedBusinessUnitFilter(user, businessUnitId);
      if (buFilter) where.company = { businessUnitId: buFilter };
    } catch (err: any) {
      return res.status(err.status || 500).json({ error: err.message });
    }
  }

  const targets = await prisma.annualTarget.findMany({
    where,
    include: { company: { select: { id: true, name: true, businessUnitId: true } } },
  });
  res.json(targets);
});

router.put("/annual", requireRole("GROUP_INTEGRATOR"), async (req, res) => {
  const parsed = z
    .object({ companyId: z.string().uuid(), yearId: z.string().uuid() })
    .merge(figuresSchema)
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid annual target payload", details: parsed.error.issues });

  const { companyId, yearId, ...figures } = parsed.data;
  const target = await prisma.annualTarget.upsert({
    where: { companyId_yearId: { companyId, yearId } },
    update: figures,
    create: { companyId, yearId, ...figures },
  });
  res.json(target);
});

// ---------- Quarter Targets (Group Integrator only) ----------

router.get("/quarter", async (req, res) => {
  const { yearId, quarter, businessUnitId, companyId } = req.query as Record<string, string | undefined>;
  if (!yearId) return res.status(400).json({ error: "yearId is required" });

  const user = req.user!;
  try {
    if (companyId) assertBusinessUnitAccess(user, await resolveCompanyBusinessUnit(companyId));
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  const where: any = { yearId };
  if (quarter) where.quarter = Number(quarter);
  if (companyId) {
    where.companyId = companyId;
  } else {
    try {
      const buFilter = scopedBusinessUnitFilter(user, businessUnitId);
      if (buFilter) where.company = { businessUnitId: buFilter };
    } catch (err: any) {
      return res.status(err.status || 500).json({ error: err.message });
    }
  }

  const targets = await prisma.quarterTarget.findMany({
    where,
    include: { company: { select: { id: true, name: true, businessUnitId: true } } },
    orderBy: { quarter: "asc" },
  });
  res.json(targets);
});

router.put("/quarter", requireRole("GROUP_INTEGRATOR"), async (req, res) => {
  const parsed = z
    .object({ companyId: z.string().uuid(), yearId: z.string().uuid(), quarter: z.number().int().min(1).max(4) })
    .merge(figuresSchema)
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid quarter target payload", details: parsed.error.issues });

  const { companyId, yearId, quarter, ...figures } = parsed.data;
  const target = await prisma.quarterTarget.upsert({
    where: { companyId_yearId_quarter: { companyId, yearId, quarter } },
    update: figures,
    create: { companyId, yearId, quarter, ...figures },
  });
  res.json(target);
});

export default router;
