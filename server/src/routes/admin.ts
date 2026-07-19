import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { blockPendingPasswordChange, requireAuth, requireRole } from "../middleware/auth";
import { logAudit } from "../utils/auditLog";

// Superadmin-only management surface: full CRUD over Users, Companies, and
// Business Units. Group Integrators keep their existing (create-only) access
// via routes/meta.ts and routes/targets.ts — this router is the "manage
// everything" facility layered on top for SUPERADMIN.
const router = Router();
router.use(requireAuth);
router.use(blockPendingPasswordChange);
router.use(requireRole("SUPERADMIN"));

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .refine((v) => /[A-Za-z]/.test(v) && /[0-9]/.test(v), "Password must contain letters and numbers");

const roleSchema = z.enum(["SUPERADMIN", "GROUP_INTEGRATOR", "BU_INTEGRATOR"]);
// A user can be created/left with no base Role at all ("blank") — relying
// entirely on an assigned Custom Role for access. Blank is represented as
// `null` (as opposed to `undefined`, which on update means "leave unchanged").
const nullableRoleSchema = roleSchema.nullable();

const userSelect = {
  id: true,
  email: true,
  username: true,
  name: true,
  role: true,
  description: true,
  mustChangePassword: true,
  createdAt: true,
  businessUnits: { select: { businessUnit: { select: { id: true, name: true } } } },
  customRole: { select: { id: true, name: true } },
} as const;

function serializeUser(user: any) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    name: user.name,
    role: user.role,
    description: user.description,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt,
    businessUnits: user.businessUnits.map((b: any) => b.businessUnit),
    customRole: user.customRole,
  };
}

// ---------- Users ----------

router.get("/users", async (_req, res) => {
  const users = await prisma.user.findMany({ select: userSelect, orderBy: { name: "asc" } });
  res.json(users.map(serializeUser));
});

const createUserSchema = z
  .object({
    email: z.string().email(),
    username: z.string().min(3).max(50).optional(),
    name: z.string().min(1),
    // Optional — omit (or pass null) to create a "blank" role user whose
    // access is defined entirely by the Custom Role assigned below.
    role: nullableRoleSchema.optional(),
    // Superadmin-authored note about this user (title, team, etc.) — shown
    // in the app header in place of their role. The user themselves cannot
    // set this (no field for it on the self-service profile update).
    description: z.string().max(2000).optional().default(""),
    password: passwordSchema,
    businessUnitIds: z.array(z.string().uuid()).optional().default([]),
    // Optional additional layer on top of `role` — a Custom Role's
    // permission matrix (see routes/customRoles.ts). Superadmins ignore this
    // even if set.
    customRoleId: z.string().uuid().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    // A BU Integrator must always be tied to at least one Business Unit.
    // (Group Integrators may optionally be assigned one or more BUs to
    // narrow their scope, but it's not required — unassigned means global.)
    if (data.role === "BU_INTEGRATOR" && data.businessUnitIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["businessUnitIds"],
        message: "A BU Integrator must be assigned to at least one Business Unit",
      });
    }
  });

router.post("/users", async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid user payload", details: parsed.error.issues });

  const { email, username, name, description, password, businessUnitIds, customRoleId } = parsed.data;
  const role = parsed.data.role ?? null;
  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        username: username ? username.toLowerCase() : undefined,
        name,
        role,
        description,
        passwordHash,
        mustChangePassword: true,
        customRoleId: customRoleId || null,
        businessUnits: {
          create: businessUnitIds.map((businessUnitId) => ({ businessUnitId })),
        },
      },
      select: userSelect,
    });
    await logAudit({
      user: req.user,
      action: "USER_CREATE",
      entityType: "User",
      entityId: user.id,
      summary: `Created user ${user.name} (${user.email})${role ? ` as ${role}` : " with no base role"}`,
      metadata: { role, customRoleId: customRoleId || null, businessUnitIds },
    });
    res.status(201).json(serializeUser(user));
  } catch (err: any) {
    if (err.code === "P2002") return res.status(409).json({ error: "Email or username is already in use" });
    throw err;
  }
});

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  username: z.string().min(3).max(50).nullable().optional(),
  name: z.string().min(1).optional(),
  // Omit entirely to leave the role unchanged; pass `null` explicitly to
  // clear it to "blank" (Custom Role only).
  role: nullableRoleSchema.optional(),
  description: z.string().max(2000).optional(),
  businessUnitIds: z.array(z.string().uuid()).optional(),
  password: passwordSchema.optional(),
  customRoleId: z.string().uuid().nullable().optional(),
});

router.put("/users/:id", async (req, res) => {
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid user payload", details: parsed.error.issues });

  const { email, username, name, role, description, businessUnitIds, password, customRoleId } = parsed.data;
  const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "User not found" });

  // role === undefined means "not provided, leave unchanged"; role === null
  // means "explicitly clear to blank" and must go through the same
  // last-superadmin-demotion guard as switching to any other non-SUPERADMIN
  // role.
  if (role !== undefined && role !== "SUPERADMIN" && existing.role === "SUPERADMIN") {
    const superadminCount = await prisma.user.count({ where: { role: "SUPERADMIN" } });
    if (superadminCount <= 1) return res.status(400).json({ error: "Cannot demote the last remaining superadmin" });
  }

  // A BU Integrator must always be tied to at least one Business Unit —
  // check the effective post-update state (new role/assignment if provided,
  // otherwise whatever's already on the record). Only fall back to the
  // existing role when `role` was omitted entirely (undefined) — an explicit
  // `null` means "blank", which is never BU_INTEGRATOR.
  const effectiveRole = role === undefined ? existing.role : role;
  if (effectiveRole === "BU_INTEGRATOR") {
    const effectiveBuCount = businessUnitIds
      ? businessUnitIds.length
      : await prisma.userBusinessUnit.count({ where: { userId: existing.id } });
    if (effectiveBuCount === 0) {
      return res.status(400).json({ error: "A BU Integrator must be assigned to at least one Business Unit" });
    }
  }

  const data: any = {};
  if (email) data.email = email.toLowerCase();
  if (username !== undefined) data.username = username ? username.toLowerCase() : null;
  if (name) data.name = name;
  if (role !== undefined) data.role = role;
  if (description !== undefined) data.description = description;
  if (customRoleId !== undefined) data.customRoleId = customRoleId || null;
  if (password) {
    data.passwordHash = await bcrypt.hash(password, 10);
    data.mustChangePassword = true;
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: req.params.id }, data });
      if (businessUnitIds) {
        await tx.userBusinessUnit.deleteMany({ where: { userId: req.params.id } });
        if (businessUnitIds.length) {
          await tx.userBusinessUnit.createMany({
            data: businessUnitIds.map((businessUnitId) => ({ userId: req.params.id, businessUnitId })),
            skipDuplicates: true,
          });
        }
      }
    });
    const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: userSelect });
    const changedFields = Object.keys(data).filter((k) => k !== "passwordHash");
    if (password) changedFields.push("password");
    if (businessUnitIds) changedFields.push("businessUnitIds");
    await logAudit({
      user: req.user,
      action: "USER_UPDATE",
      entityType: "User",
      entityId: req.params.id,
      summary: `Updated user ${existing.email}${changedFields.length ? ` (${changedFields.join(", ")})` : ""}`,
      metadata: { changedFields },
    });
    res.json(serializeUser(user));
  } catch (err: any) {
    if (err.code === "P2002") return res.status(409).json({ error: "Email or username is already in use" });
    throw err;
  }
});

router.delete("/users/:id", async (req, res) => {
  if (req.params.id === req.user!.id) {
    return res.status(400).json({ error: "You cannot delete your own account while logged in as it" });
  }
  const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "User not found" });

  if (existing.role === "SUPERADMIN") {
    const superadminCount = await prisma.user.count({ where: { role: "SUPERADMIN" } });
    if (superadminCount <= 1) return res.status(400).json({ error: "Cannot delete the last remaining superadmin" });
  }

  await prisma.$transaction([
    prisma.quarterActual.updateMany({ where: { updatedById: req.params.id }, data: { updatedById: null } }),
    prisma.rock.updateMany({ where: { createdById: req.params.id }, data: { createdById: null } }),
    prisma.rock.updateMany({ where: { updatedById: req.params.id }, data: { updatedById: null } }),
    prisma.user.delete({ where: { id: req.params.id } }),
  ]);
  await logAudit({
    user: req.user,
    action: "USER_DELETE",
    entityType: "User",
    entityId: existing.id,
    summary: `Deleted user ${existing.name} (${existing.email})`,
  });
  res.status(204).send();
});

// ---------- Business Units ----------

router.put("/business-units/:id", async (req, res) => {
  const parsed = z.object({ name: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "'name' is required" });
  try {
    const existing = await prisma.businessUnit.findUnique({ where: { id: req.params.id } });
    const bu = await prisma.businessUnit.update({ where: { id: req.params.id }, data: { name: parsed.data.name } });
    await logAudit({
      user: req.user,
      action: "BUSINESS_UNIT_UPDATE",
      entityType: "BusinessUnit",
      entityId: bu.id,
      summary: `Renamed Business Unit "${existing?.name}" to "${bu.name}"`,
    });
    res.json(bu);
  } catch (err: any) {
    if (err.code === "P2025") return res.status(404).json({ error: "Business unit not found" });
    if (err.code === "P2002") return res.status(409).json({ error: "A business unit with that name already exists" });
    throw err;
  }
});

router.delete("/business-units/:id", async (req, res) => {
  try {
    const bu = await prisma.businessUnit.delete({ where: { id: req.params.id } });
    await logAudit({
      user: req.user,
      action: "BUSINESS_UNIT_DELETE",
      entityType: "BusinessUnit",
      entityId: bu.id,
      summary: `Deleted Business Unit "${bu.name}"`,
    });
    res.status(204).send();
  } catch (err: any) {
    if (err.code === "P2025") return res.status(404).json({ error: "Business unit not found" });
    throw err;
  }
});

// ---------- Companies ----------

router.put("/companies/:id", async (req, res) => {
  const parsed = z
    .object({
      name: z.string().min(1).optional(),
      businessUnitId: z.string().uuid().optional(),
      description: z.string().max(2000).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid company payload" });
  try {
    const company = await prisma.company.update({ where: { id: req.params.id }, data: parsed.data });
    await logAudit({
      user: req.user,
      action: "COMPANY_UPDATE",
      entityType: "Company",
      entityId: company.id,
      summary: `Updated Company "${company.name}"`,
      metadata: { changedFields: Object.keys(parsed.data) },
    });
    res.json(company);
  } catch (err: any) {
    if (err.code === "P2025") return res.status(404).json({ error: "Company not found" });
    if (err.code === "P2002") return res.status(409).json({ error: "A company with that name already exists in this business unit" });
    throw err;
  }
});

router.delete("/companies/:id", async (req, res) => {
  try {
    const company = await prisma.company.delete({ where: { id: req.params.id } });
    await logAudit({
      user: req.user,
      action: "COMPANY_DELETE",
      entityType: "Company",
      entityId: company.id,
      summary: `Deleted Company "${company.name}"`,
    });
    res.status(204).send();
  } catch (err: any) {
    if (err.code === "P2025") return res.status(404).json({ error: "Company not found" });
    throw err;
  }
});

export default router;
