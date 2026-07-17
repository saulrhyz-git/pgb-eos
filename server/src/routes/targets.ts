import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import {
  assertBusinessUnitAccess,
  blockPendingPasswordChange,
  requireAuth,
  requireRole,
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
// Targets are set once per Business Unit per Year (Group Integrator /
// Superadmin, or a BU Integrator scoped to their own assigned Business
// Unit(s)). Actuals are recognized per Company and roll up to compare
// against these Business-Unit-level numbers — see routes/actuals.ts and
// routes/dashboard.ts.

router.get("/annual", async (req, res) => {
  const { yearId, businessUnitId } = req.query as Record<string, string | undefined>;
  if (!yearId) return res.status(400).json({ error: "yearId is required" });

  const where: any = { yearId };
  try {
    const buFilter = scopedBusinessUnitFilter(req.user!, businessUnitId);
    if (buFilter) where.businessUnitId = buFilter;
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  const targets = await prisma.annualTarget.findMany({
    where,
    include: { businessUnit: { select: { id: true, name: true } } },
  });
  res.json(targets);
});

router.put("/annual", async (req, res) => {
  const parsed = z
    .object({ businessUnitId: z.string().uuid(), yearId: z.string().uuid() })
    .merge(figuresSchema)
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid annual target payload", details: parsed.error.issues });

  try {
    assertBusinessUnitAccess(req.user!, parsed.data.businessUnitId);
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  const { businessUnitId, yearId, ...figures } = parsed.data;

  // Once saved, an annual target is locked — a BU Integrator can't edit it
  // again until a Group Integrator/Superadmin unlocks it. Group
  // Integrators/Superadmins always bypass the lock.
  if (req.user!.role === "BU_INTEGRATOR") {
    const existing = await prisma.annualTarget.findUnique({
      where: { businessUnitId_yearId: { businessUnitId, yearId } },
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
    where: { businessUnitId_yearId: { businessUnitId, yearId } },
    update: { ...figures, locked: true },
    create: { businessUnitId, yearId, ...figures, locked: true },
  });
  res.json(target);
});

// Clears the lock on an annual target so a BU Integrator can edit it again.
// Group Integrator / Superadmin only.
router.patch("/annual/unlock", requireRole("GROUP_INTEGRATOR", "SUPERADMIN"), async (req, res) => {
  const parsed = z.object({ businessUnitId: z.string().uuid(), yearId: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "businessUnitId and yearId are required" });

  try {
    assertBusinessUnitAccess(req.user!, parsed.data.businessUnitId);
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  try {
    const target = await prisma.annualTarget.update({
      where: { businessUnitId_yearId: parsed.data },
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
  const { yearId, quarter, businessUnitId } = req.query as Record<string, string | undefined>;
  if (!yearId) return res.status(400).json({ error: "yearId is required" });

  const where: any = { yearId };
  if (quarter) where.quarter = Number(quarter);
  try {
    const buFilter = scopedBusinessUnitFilter(req.user!, businessUnitId);
    if (buFilter) where.businessUnitId = buFilter;
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  const targets = await prisma.quarterTarget.findMany({
    where,
    include: { businessUnit: { select: { id: true, name: true } } },
    orderBy: { quarter: "asc" },
  });
  res.json(targets);
});

router.put("/quarter", async (req, res) => {
  const parsed = z
    .object({ businessUnitId: z.string().uuid(), yearId: z.string().uuid(), quarter: z.number().int().min(1).max(4) })
    .merge(figuresSchema)
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid quarter target payload", details: parsed.error.issues });

  try {
    assertBusinessUnitAccess(req.user!, parsed.data.businessUnitId);
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  const { businessUnitId, yearId, quarter, ...figures } = parsed.data;
  const target = await prisma.quarterTarget.upsert({
    where: { businessUnitId_yearId_quarter: { businessUnitId, yearId, quarter } },
    update: figures,
    create: { businessUnitId, yearId, quarter, ...figures },
  });
  res.json(target);
});

export default router;
