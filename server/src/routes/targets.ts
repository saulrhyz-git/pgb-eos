import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import {
  assertBusinessUnitAccess,
  blockPendingPasswordChange,
  requireAuth,
  requireRole,
  resolveCompanyBusinessUnit,
  scopedBusinessUnitFilter,
} from "../middleware/auth";

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

// ---------- Annual Targets ----------
// Targets are set once per Company per Year (Group Integrator / Superadmin,
// or a BU Integrator scoped to their own assigned Business Unit(s)). The
// Business-Unit-level number shown on the dashboard is a rollup — see
// routes/dashboard.ts — not something stored directly.

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

router.put("/annual", async (req, res) => {
  const parsed = z
    .object({ companyId: z.string().uuid(), yearId: z.string().uuid() })
    .merge(figuresSchema)
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid annual target payload", details: parsed.error.issues });

  try {
    const businessUnitId = await resolveCompanyBusinessUnit(parsed.data.companyId);
    assertBusinessUnitAccess(req.user!, businessUnitId);
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  const { companyId, yearId, ...figures } = parsed.data;

  // Once saved, an annual target is locked — a BU Integrator can't edit it
  // again until a Group Integrator/Superadmin unlocks it. Group
  // Integrators/Superadmins always bypass the lock.
  if (req.user!.role === "BU_INTEGRATOR") {
    const existing = await prisma.annualTarget.findUnique({
      where: { companyId_yearId: { companyId, yearId } },
      select: { locked: true },
    });
    if (existing?.locked) {
      return res.status(403).json({
        error: "This annual target is locked. Ask a Group Integrator or Superadmin to unlock it before making changes.",
        code: "ANNUAL_TARGET_LOCKED",
      });
    }
  }

  const target = await prisma.annualTarget.upsert({
    where: { companyId_yearId: { companyId, yearId } },
    update: { ...figures, locked: true },
    create: { companyId, yearId, ...figures, locked: true },
  });
  res.json(target);
});

// Clears the lock on a Company's annual target so a BU Integrator can edit
// it again. Group Integrator / Superadmin only.
router.patch("/annual/unlock", requireRole("GROUP_INTEGRATOR", "SUPERADMIN"), async (req, res) => {
  const parsed = z.object({ companyId: z.string().uuid(), yearId: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "companyId and yearId are required" });

  try {
    const businessUnitId = await resolveCompanyBusinessUnit(parsed.data.companyId);
    assertBusinessUnitAccess(req.user!, businessUnitId);
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  try {
    const target = await prisma.annualTarget.update({
      where: { companyId_yearId: parsed.data },
      data: { locked: false },
    });
    res.json(target);
  } catch (err: any) {
    if (err.code === "P2025") return res.status(404).json({ error: "No annual target found to unlock" });
    throw err;
  }
});

// ---------- Quarter Targets ----------

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

router.put("/quarter", async (req, res) => {
  const parsed = z
    .object({ companyId: z.string().uuid(), yearId: z.string().uuid(), quarter: z.number().int().min(1).max(4) })
    .merge(figuresSchema)
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid quarter target payload", details: parsed.error.issues });

  try {
    const businessUnitId = await resolveCompanyBusinessUnit(parsed.data.companyId);
    assertBusinessUnitAccess(req.user!, businessUnitId);
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
