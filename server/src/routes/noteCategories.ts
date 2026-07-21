import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { blockPendingPasswordChange, requireAuth, requireRole } from "../middleware/auth";
import { logAudit } from "../utils/auditLog";

// Superadmin-only CRUD over the NoteCategory catalog — the master list of
// selectable categories for the Expenses/Disbursements "notable line items"
// facility (see routes/notes.ts). Not gated by a Custom Role/
// PermissionResource, same as SMTP/AI Settings: this is app configuration,
// not per-Business-Unit data.
const router = Router();
router.use(requireAuth);
router.use(blockPendingPasswordChange);
router.use(requireRole("SUPERADMIN"));

router.get("/", async (_req, res) => {
  const rows = await prisma.noteCategory.findMany({ orderBy: [{ type: "asc" }, { sortOrder: "asc" }, { label: "asc" }] });
  res.json(rows);
});

const createSchema = z.object({
  type: z.enum(["EXPENSE", "DISBURSEMENT"]),
  label: z.string().trim().min(1).max(100),
  sortOrder: z.number().int().default(0),
});

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid category payload" });

  try {
    const row = await prisma.noteCategory.create({ data: parsed.data });
    await logAudit({
      user: req.user,
      action: "NOTE_CATEGORY_CREATE",
      entityType: "NoteCategory",
      entityId: row.id,
      summary: `Added ${parsed.data.type} note category "${row.label}"`,
    });
    res.status(201).json(row);
  } catch (err: any) {
    if (err.code === "P2002") return res.status(409).json({ error: "A category with that name already exists for this type" });
    throw err;
  }
});

const updateSchema = z.object({
  label: z.string().trim().min(1).max(100).optional(),
  sortOrder: z.number().int().optional(),
  active: z.boolean().optional(),
});

router.put("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid category payload" });

  const existing = await prisma.noteCategory.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Category not found" });

  try {
    const row = await prisma.noteCategory.update({ where: { id: req.params.id }, data: parsed.data });
    await logAudit({
      user: req.user,
      action: "NOTE_CATEGORY_UPDATE",
      entityType: "NoteCategory",
      entityId: row.id,
      summary: `Updated note category "${row.label}"`,
    });
    res.json(row);
  } catch (err: any) {
    if (err.code === "P2002") return res.status(409).json({ error: "A category with that name already exists for this type" });
    throw err;
  }
});

router.delete("/:id", async (req, res) => {
  const existing = await prisma.noteCategory.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Category not found" });

  try {
    await prisma.noteCategory.delete({ where: { id: req.params.id } });
  } catch (err: any) {
    if (err.code === "P2003") {
      return res.status(400).json({ error: "This category is already used by existing notes — deactivate it instead of deleting it." });
    }
    throw err;
  }
  await logAudit({
    user: req.user,
    action: "NOTE_CATEGORY_DELETE",
    entityType: "NoteCategory",
    entityId: existing.id,
    summary: `Deleted note category "${existing.label}"`,
  });
  res.status(204).send();
});

export default router;
