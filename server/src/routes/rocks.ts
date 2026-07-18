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

// Rocks (EOS-style 90-day priorities) tracked per Company/Year/Quarter.
// Read access follows the same Business-Unit scoping as the rest of the app;
// write access follows the same pattern as Quarter Actuals — a BU Integrator
// may only add/edit/delete Rocks for companies within their assigned
// Business Unit(s), while Group Integrators/Superadmins can act on any Rock
// within their own scope (which may itself be narrowed if a Group Integrator
// has been assigned specific BUs).
const router = Router();
router.use(requireAuth);
router.use(blockPendingPasswordChange);

const statusEnum = z.enum(["PENDING", "ON_TRACK", "AT_RISK", "TARGET_MET"]);

const rockInclude = {
  company: { select: { id: true, name: true, businessUnitId: true } },
  businessGoal: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  updatedBy: { select: { id: true, name: true } },
} as const;

// A Business Goal that's been assigned to specific Business Units can only be
// used to tag Rocks belonging to companies in one of those units. A Business
// Goal with no assignment is global and usable anywhere.
async function assertBusinessGoalUsable(businessGoalId: string, businessUnitId: string) {
  const goal = await prisma.businessGoal.findUnique({
    where: { id: businessGoalId },
    include: { businessUnits: { select: { businessUnitId: true } } },
  });
  if (!goal) {
    const err = new Error("Business goal not found");
    (err as any).status = 404;
    throw err;
  }
  if (goal.businessUnits.length && !goal.businessUnits.some((b) => b.businessUnitId === businessUnitId)) {
    const err = new Error("This business goal is not assigned to the selected company's Business Unit");
    (err as any).status = 400;
    throw err;
  }
}

router.get("/", async (req, res) => {
  const { yearId, quarter, businessUnitId, companyId, businessGoalId, status } = req.query as Record<string, string | undefined>;
  if (!yearId) return res.status(400).json({ error: "yearId is required" });

  const user = req.user!;
  try {
    if (companyId) assertBusinessUnitAccess(user, await resolveCompanyBusinessUnit(companyId));
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  const where: any = { yearId };
  if (quarter) where.quarter = Number(quarter);
  if (businessGoalId) where.businessGoalId = businessGoalId;
  if (status) {
    const parsedStatus = statusEnum.safeParse(status);
    if (!parsedStatus.success) return res.status(400).json({ error: "Invalid status filter" });
    where.status = parsedStatus.data;
  }
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

  const rocks = await prisma.rock.findMany({
    where,
    include: rockInclude,
    orderBy: [{ quarter: "asc" }, { createdAt: "asc" }],
  });
  res.json(rocks);
});

const createSchema = z.object({
  companyId: z.string().uuid(),
  yearId: z.string().uuid(),
  quarter: z.number().int().min(1).max(4),
  businessGoalId: z.string().uuid().optional().nullable(),
  title: z.string().min(1).max(300),
  description: z.string().max(4000).optional().default(""),
  remarks: z.string().max(4000).optional().default(""),
  ownerName: z.string().max(200).optional().default(""),
  status: statusEnum.optional().default("PENDING"),
  progressPct: z.number().int().min(0).max(100).optional().default(0),
});

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid rock payload", details: parsed.error.issues });

  try {
    const businessUnitId = await resolveCompanyBusinessUnit(parsed.data.companyId);
    assertBusinessUnitAccess(req.user!, businessUnitId);
    if (parsed.data.businessGoalId) await assertBusinessGoalUsable(parsed.data.businessGoalId, businessUnitId);
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  const rock = await prisma.rock.create({
    data: { ...parsed.data, createdById: req.user!.id, updatedById: req.user!.id },
    include: rockInclude,
  });
  res.status(201).json(rock);
});

// ---------- Rollover ----------
// Carries every not-yet-complete Rock (status != TARGET_MET) in the given
// scope forward one quarter: Q1-Q3 roll into Q2-Q4 of the same Year; Q4 rolls
// into Q1 of the following Year (which must already exist — this endpoint
// never creates a Year). Each carried-over Rock is a new row in the target
// quarter with the same details/status/progress; the original Rock in its
// original quarter is left untouched, so this is a "carry forward a copy",
// not a "move". Restricted to Group Integrator/Superadmin since it acts
// across whatever scope is currently filtered on the Rocks page, not just a
// single Company.
const rolloverSchema = z.object({
  yearId: z.string().uuid(),
  quarter: z.number().int().min(1).max(4),
  businessUnitId: z.string().uuid().optional(),
  companyId: z.string().uuid().optional(),
  businessGoalId: z.string().uuid().optional(),
});

router.post("/rollover", requireRole("GROUP_INTEGRATOR", "SUPERADMIN"), async (req, res) => {
  const parsed = rolloverSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid rollover payload", details: parsed.error.issues });
  const { yearId, quarter, businessUnitId, companyId, businessGoalId } = parsed.data;

  const user = req.user!;
  try {
    if (companyId) assertBusinessUnitAccess(user, await resolveCompanyBusinessUnit(companyId));
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  const sourceYear = await prisma.year.findUnique({ where: { id: yearId } });
  if (!sourceYear) return res.status(404).json({ error: "Year not found" });

  let targetYearId = yearId;
  let targetQuarter = quarter + 1;
  if (quarter === 4) {
    const nextYear = await prisma.year.findUnique({ where: { year: sourceYear.year + 1 } });
    if (!nextYear) {
      return res.status(400).json({
        error: `Year ${sourceYear.year + 1} doesn't exist yet — create it in Target Setup before rolling over Q4 rocks.`,
      });
    }
    targetYearId = nextYear.id;
    targetQuarter = 1;
  }

  const where: any = { yearId, quarter, status: { not: "TARGET_MET" } };
  if (businessGoalId) where.businessGoalId = businessGoalId;
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

  const sourceRocks = await prisma.rock.findMany({ where });
  if (sourceRocks.length === 0) {
    return res.json({ rolledOver: 0, targetYearId, targetQuarter, rocks: [] });
  }

  const created = await prisma.$transaction(
    sourceRocks.map((r) =>
      prisma.rock.create({
        data: {
          companyId: r.companyId,
          yearId: targetYearId,
          quarter: targetQuarter,
          businessGoalId: r.businessGoalId,
          title: r.title,
          description: r.description,
          remarks: r.remarks,
          ownerName: r.ownerName,
          status: r.status,
          progressPct: r.progressPct,
          createdById: user.id,
          updatedById: user.id,
        },
        include: rockInclude,
      })
    )
  );

  res.json({ rolledOver: created.length, targetYearId, targetQuarter, rocks: created });
});

const updateSchema = z.object({
  quarter: z.number().int().min(1).max(4).optional(),
  businessGoalId: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(4000).optional(),
  remarks: z.string().max(4000).optional(),
  ownerName: z.string().max(200).optional(),
  status: statusEnum.optional(),
  progressPct: z.number().int().min(0).max(100).optional(),
});

router.put("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid rock payload", details: parsed.error.issues });

  const existing = await prisma.rock.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Rock not found" });

  try {
    const businessUnitId = await resolveCompanyBusinessUnit(existing.companyId);
    assertBusinessUnitAccess(req.user!, businessUnitId);
    if (parsed.data.businessGoalId) await assertBusinessGoalUsable(parsed.data.businessGoalId, businessUnitId);
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  const rock = await prisma.rock.update({
    where: { id: req.params.id },
    data: { ...parsed.data, updatedById: req.user!.id },
    include: rockInclude,
  });
  res.json(rock);
});

router.delete("/:id", async (req, res) => {
  const existing = await prisma.rock.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Rock not found" });

  try {
    const businessUnitId = await resolveCompanyBusinessUnit(existing.companyId);
    assertBusinessUnitAccess(req.user!, businessUnitId);
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  await prisma.rock.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
