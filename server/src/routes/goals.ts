import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { blockPendingPasswordChange, requireAuth, requireRole } from "../middleware/auth";

// Goals are a shared, org-wide taxonomy that Rocks can be tagged with (e.g.
// "Grow Market Share", "Improve Client Retention"). Any authenticated role
// can read the list (needed to filter/tag Rocks); managing the list itself
// is explicitly a Group Integrator + Superadmin responsibility, not
// Superadmin-only, so this lives in its own router rather than under
// routes/admin.ts.
const router = Router();
router.use(requireAuth);
router.use(blockPendingPasswordChange);

router.get("/", async (_req, res) => {
  const goals = await prisma.goal.findMany({ orderBy: { name: "asc" } });
  res.json(goals);
});

const goalSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().default(""),
});

router.post("/", requireRole("GROUP_INTEGRATOR", "SUPERADMIN"), async (req, res) => {
  const parsed = goalSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid goal payload" });
  try {
    const goal = await prisma.goal.create({ data: parsed.data });
    res.status(201).json(goal);
  } catch (err: any) {
    if (err.code === "P2002") return res.status(409).json({ error: "A goal with that name already exists" });
    throw err;
  }
});

router.put("/:id", requireRole("GROUP_INTEGRATOR", "SUPERADMIN"), async (req, res) => {
  const parsed = goalSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid goal payload" });
  try {
    const goal = await prisma.goal.update({ where: { id: req.params.id }, data: parsed.data });
    res.json(goal);
  } catch (err: any) {
    if (err.code === "P2025") return res.status(404).json({ error: "Goal not found" });
    if (err.code === "P2002") return res.status(409).json({ error: "A goal with that name already exists" });
    throw err;
  }
});

router.delete("/:id", requireRole("GROUP_INTEGRATOR", "SUPERADMIN"), async (req, res) => {
  try {
    // Rocks tagged with this goal keep existing (goalId is set to null via
    // the schema's onDelete: SetNull), they just lose the tag.
    await prisma.goal.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err: any) {
    if (err.code === "P2025") return res.status(404).json({ error: "Goal not found" });
    throw err;
  }
});

export default router;
