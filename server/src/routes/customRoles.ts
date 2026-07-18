import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { blockPendingPasswordChange, requireAuth, requireRole } from "../middleware/auth";

// Superadmin-only CRUD over Custom Roles: named permission profiles that can
// be assigned to any User (see admin.ts's user create/update) as an
// additional, more granular layer on top of their base Role. Each role owns a
// matrix of RolePermission rows — one per (Business Unit or Company) x
// resource, each with independent View/Edit/Delete flags — enforced across
// targets.ts, actuals.ts, rocks.ts, and dashboard.ts wherever a request's user
// has a customRoleId set.
const router = Router();
router.use(requireAuth);
router.use(blockPendingPasswordChange);
router.use(requireRole("SUPERADMIN"));

const resourceEnum = z.enum(["TARGETS", "REVENUE", "COLLECTIONS", "EXPENSES", "ROCKS", "SCORECARD"]);

// Each entry grants access to exactly one scope: either a whole Business Unit
// (companyId omitted) or one specific Company within it (both ids present,
// so the UI can label it correctly and so a Company-level row can override a
// BU-level one for the same resource). At least one of View/Edit/Delete must
// be set, otherwise the row is meaningless and is dropped.
const permissionEntrySchema = z
  .object({
    businessUnitId: z.string().uuid(),
    companyId: z.string().uuid().optional(),
    resource: resourceEnum,
    canView: z.boolean().default(false),
    canEdit: z.boolean().default(false),
    canDelete: z.boolean().default(false),
  })
  .refine((p) => p.canView || p.canEdit || p.canDelete, {
    message: "Each permission row needs at least one of View/Edit/Delete checked",
  });

const roleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(2000).optional().default(""),
  permissions: z.array(permissionEntrySchema).default([]),
});

const roleInclude = {
  permissions: {
    include: {
      businessUnit: { select: { id: true, name: true } },
      company: { select: { id: true, name: true, businessUnitId: true } },
    },
  },
  _count: { select: { users: true } },
} as const;

function serializeRole(role: any) {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
    userCount: role._count.users,
    permissions: role.permissions.map((p: any) => ({
      id: p.id,
      businessUnitId: p.businessUnitId,
      businessUnitName: p.businessUnit?.name ?? null,
      companyId: p.companyId,
      companyName: p.company?.name ?? null,
      resource: p.resource,
      canView: p.canView,
      canEdit: p.canEdit,
      canDelete: p.canDelete,
    })),
  };
}

router.get("/", async (_req, res) => {
  const roles = await prisma.customRole.findMany({ include: roleInclude, orderBy: { name: "asc" } });
  res.json(roles.map(serializeRole));
});

router.post("/", async (req, res) => {
  const parsed = roleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid role payload", details: parsed.error.issues });

  const { name, description, permissions } = parsed.data;
  try {
    const role = await prisma.customRole.create({
      data: {
        name,
        description,
        permissions: {
          create: permissions.map((p) => ({
            businessUnitId: p.businessUnitId,
            companyId: p.companyId,
            resource: p.resource,
            canView: p.canView,
            canEdit: p.canEdit,
            canDelete: p.canDelete,
          })),
        },
      },
      include: roleInclude,
    });
    res.status(201).json(serializeRole(role));
  } catch (err: any) {
    if (err.code === "P2002") return res.status(409).json({ error: "A role with that name already exists" });
    throw err;
  }
});

router.put("/:id", async (req, res) => {
  const parsed = roleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid role payload", details: parsed.error.issues });

  const existing = await prisma.customRole.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Role not found" });

  const { name, description, permissions } = parsed.data;
  try {
    // Replace the whole permission matrix atomically — simpler and safer
    // than diffing individual rows, and matches how the admin UI submits the
    // full, current matrix on every save.
    const role = await prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { customRoleId: req.params.id } });
      return tx.customRole.update({
        where: { id: req.params.id },
        data: {
          name,
          description,
          permissions: {
            create: permissions.map((p) => ({
              businessUnitId: p.businessUnitId,
              companyId: p.companyId,
              resource: p.resource,
              canView: p.canView,
              canEdit: p.canEdit,
              canDelete: p.canDelete,
            })),
          },
        },
        include: roleInclude,
      });
    });
    res.json(serializeRole(role));
  } catch (err: any) {
    if (err.code === "P2002") return res.status(409).json({ error: "A role with that name already exists" });
    throw err;
  }
});

router.delete("/:id", async (req, res) => {
  const existing = await prisma.customRole.findUnique({ where: { id: req.params.id }, include: { _count: { select: { users: true } } } });
  if (!existing) return res.status(404).json({ error: "Role not found" });
  if (existing._count.users > 0) {
    return res.status(400).json({
      error: `${existing._count.users} user(s) are still assigned this role — reassign or clear their role first`,
    });
  }
  await prisma.customRole.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
