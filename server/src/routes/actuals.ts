import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import {
  assertBusinessUnitAccess,
  blockPendingPasswordChange,
  requireAuth,
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
  remarks: z.string().max(2000).optional().default(""),
});

router.get("/", async (req, res) => {
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

  const actuals = await prisma.quarterActual.findMany({
    where,
    include: { company: { select: { id: true, name: true, businessUnitId: true } } },
    orderBy: { quarter: "asc" },
  });
  res.json(actuals);
});

// Upsert a quarter actual. BU Integrators may only post to companies within their
// assigned business unit(s); Group Integrators can post/override for any company.
router.put("/", async (req, res) => {
  const parsed = z
    .object({ companyId: z.string().uuid(), yearId: z.string().uuid(), quarter: z.number().int().min(1).max(4) })
    .merge(figuresSchema)
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid actuals payload", details: parsed.error.issues });

  try {
    const businessUnitId = await resolveCompanyBusinessUnit(parsed.data.companyId);
    assertBusinessUnitAccess(req.user!, businessUnitId);
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  const { companyId, yearId, quarter, ...figures } = parsed.data;
  const actual = await prisma.quarterActual.upsert({
    where: { companyId_yearId_quarter: { companyId, yearId, quarter } },
    update: { ...figures, updatedById: req.user!.id },
    create: { companyId, yearId, quarter, ...figures, updatedById: req.user!.id },
  });
  res.json(actual);
});

// Lightweight endpoint for updating just the Remarks inline field from the operational grid.
router.patch("/:companyId/:yearId/:quarter/remarks", async (req, res) => {
  const remarksParsed = z.object({ remarks: z.string().max(2000) }).safeParse(req.body);
  if (!remarksParsed.success) return res.status(400).json({ error: "'remarks' is required" });

  const { companyId, yearId } = req.params;
  const quarter = Number(req.params.quarter);

  try {
    const businessUnitId = await resolveCompanyBusinessUnit(companyId);
    assertBusinessUnitAccess(req.user!, businessUnitId);
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  const actual = await prisma.quarterActual.upsert({
    where: { companyId_yearId_quarter: { companyId, yearId, quarter } },
    update: { remarks: remarksParsed.data.remarks, updatedById: req.user!.id },
    create: {
      companyId,
      yearId,
      quarter,
      remarks: remarksParsed.data.remarks,
      updatedById: req.user!.id,
    },
  });
  res.json(actual);
});

export default router;
