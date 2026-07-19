import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { assertBusinessUnitAccess, blockPendingPasswordChange, requireAuth, requireRole, scopedBusinessUnitFilter } from "../middleware/auth";
import { logAudit } from "../utils/auditLog";

// Business Goals are a shared taxonomy that Rocks can be tagged with (e.g.
// "Grow Market Share", "Improve Client Retention"). Any authenticated role
// can read the list (needed to filter/tag Rocks); managing the list itself
// is explicitly a Group Integrator + Superadmin responsibility, not
// Superadmin-only, so this lives in its own router rather than under
// routes/admin.ts.
//
// A Business Goal with no Business Unit assignment is global (visible to
// everyone); assigning it to one or more specific Business Units narrows it
// to just those units — the same opt-in scoping used for Group Integrators.
const router = Router();
router.use(requireAuth);
router.use(blockPendingPasswordChange);

const include = {
  businessUnits: { select: { businessUnit: { select: { id: true, name: true } } } },
} as const;

function serialize(goal: any) {
  return {
    id: goal.id,
    name: goal.name,
    description: goal.description,
    createdAt: goal.createdAt,
    businessUnits: goal.businessUnits.map((b: any) => b.businessUnit),
  };
}

router.get("/", async (req, res) => {
  const user = req.user!;
  let where: any = {};
  try {
    const buFilter = scopedBusinessUnitFilter(user);
    if (buFilter) {
      const ids = typeof buFilter === "string" ? [buFilter] : buFilter.in;
      where = {
        OR: [{ businessUnits: { none: {} } }, { businessUnits: { some: { businessUnitId: { in: ids } } } }],
      };
    }
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  const goals = await prisma.businessGoal.findMany({ where, include, orderBy: { name: "asc" } });
  res.json(goals.map(serialize));
});

const businessGoalSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().default(""),
  businessUnitIds: z.array(z.string().uuid()).optional().default([]),
});

router.post("/", requireRole("GROUP_INTEGRATOR", "SUPERADMIN"), async (req, res) => {
  const parsed = businessGoalSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid business goal payload" });

  const { name, description, businessUnitIds } = parsed.data;
  try {
    for (const id of businessUnitIds) assertBusinessUnitAccess(req.user!, id);
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  try {
    const goal = await prisma.businessGoal.create({
      data: {
        name,
        description,
        businessUnits: { create: businessUnitIds.map((businessUnitId) => ({ businessUnitId })) },
      },
      include,
    });
    await logAudit({
      user: req.user,
      action: "BUSINESS_GOAL_CREATE",
      entityType: "BusinessGoal",
      entityId: goal.id,
      summary: `Created Business Goal "${goal.name}"`,
    });
    res.status(201).json(serialize(goal));
  } catch (err: any) {
    if (err.code === "P2002") return res.status(409).json({ error: "A business goal with that name already exists" });
    throw err;
  }
});

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  businessUnitIds: z.array(z.string().uuid()).optional(),
});

router.put("/:id", requireRole("GROUP_INTEGRATOR", "SUPERADMIN"), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid business goal payload" });

  const existing = await prisma.businessGoal.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Business goal not found" });

  const { name, description, businessUnitIds } = parsed.data;
  try {
    if (businessUnitIds) for (const id of businessUnitIds) assertBusinessUnitAccess(req.user!, id);
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  try {
    await prisma.$transaction(async (tx) => {
      const data: any = {};
      if (name !== undefined) data.name = name;
      if (description !== undefined) data.description = description;
      if (Object.keys(data).length) await tx.businessGoal.update({ where: { id: req.params.id }, data });

      if (businessUnitIds) {
        await tx.businessGoalBusinessUnit.deleteMany({ where: { businessGoalId: req.params.id } });
        if (businessUnitIds.length) {
          await tx.businessGoalBusinessUnit.createMany({
            data: businessUnitIds.map((businessUnitId) => ({ businessGoalId: req.params.id, businessUnitId })),
            skipDuplicates: true,
          });
        }
      }
    });
    const goal = await prisma.businessGoal.findUnique({ where: { id: req.params.id }, include });
    await logAudit({
      user: req.user,
      action: "BUSINESS_GOAL_UPDATE",
      entityType: "BusinessGoal",
      entityId: req.params.id,
      summary: `Updated Business Goal "${goal?.name}"`,
      metadata: { changedFields: Object.keys(parsed.data) },
    });
    res.json(serialize(goal));
  } catch (err: any) {
    if (err.code === "P2002") return res.status(409).json({ error: "A business goal with that name already exists" });
    throw err;
  }
});

router.delete("/:id", requireRole("GROUP_INTEGRATOR", "SUPERADMIN"), async (req, res) => {
  try {
    // Rocks tagged with this goal keep existing (businessGoalId is set to
    // null via the schema's onDelete: SetNull), they just lose the tag.
    const goal = await prisma.businessGoal.delete({ where: { id: req.params.id } });
    await logAudit({
      user: req.user,
      action: "BUSINESS_GOAL_DELETE",
      entityType: "BusinessGoal",
      entityId: goal.id,
      summary: `Deleted Business Goal "${goal.name}"`,
    });
    res.status(204).send();
  } catch (err: any) {
    if (err.code === "P2025") return res.status(404).json({ error: "Business goal not found" });
    throw err;
  }
});

export default router;
