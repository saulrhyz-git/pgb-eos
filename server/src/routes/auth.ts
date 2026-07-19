import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AuthUser, requireAuth, signToken } from "../middleware/auth";
import { logAudit } from "../utils/auditLog";

const router = Router();

// Accepts either an email address or a username in the same field, so the
// seeded superadmin (which logs in with a username, not an email) works
// through the same form as everyone else.
const loginSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
});

// Login lockout: 3 consecutive invalid-password attempts locks the account
// for 60 seconds; a successful login (or the lock simply expiring) resets
// the counter back to 0. Tracked per User row (failedLoginAttempts/
// lockedUntil in schema.prisma) rather than per-IP — simplest option that
// matches "3 invalid attempts locks for 60 seconds then resets" without
// needing separate rate-limiting infrastructure.
const LOCKOUT_THRESHOLD = 3;
const LOCKOUT_MS = 60_000;

function secondsRemaining(lockedUntil: Date, now: Date): number {
  return Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 1000));
}

function lockedMessage(seconds: number): string {
  return `Too many failed attempts. Try again in ${seconds} second${seconds === 1 ? "" : "s"}.`;
}

function toAuthUser(user: {
  id: string;
  email: string;
  username: string | null;
  name: string;
  role: AuthUser["role"];
  description: string;
  mustChangePassword: boolean;
  customRoleId: string | null;
  businessUnits: { businessUnitId: string }[];
}): AuthUser {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    name: user.name,
    role: user.role,
    description: user.description,
    businessUnitIds: user.businessUnits.map((b) => b.businessUnitId),
    mustChangePassword: user.mustChangePassword,
    customRoleId: user.customRoleId,
  };
}

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Email/username and password are required" });

  const { identifier, password } = parsed.data;
  const normalized = identifier.trim().toLowerCase();
  const user = await prisma.user.findFirst({
    where: { OR: [{ email: normalized }, { username: normalized }] },
    include: { businessUnits: { select: { businessUnitId: true } } },
  });
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const now = new Date();
  if (user.lockedUntil && user.lockedUntil > now) {
    return res.status(423).json({ error: lockedMessage(secondsRemaining(user.lockedUntil, now)) });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);

  if (!valid) {
    // A lock that's already expired (checked above) means this failure
    // starts a fresh count of 1 rather than picking up a stale number.
    const priorAttempts = user.lockedUntil && user.lockedUntil <= now ? 0 : user.failedLoginAttempts;
    const attempts = priorAttempts + 1;
    const justLocked = attempts >= LOCKOUT_THRESHOLD;

    await prisma.user.update({
      where: { id: user.id },
      data: justLocked
        ? { failedLoginAttempts: 0, lockedUntil: new Date(now.getTime() + LOCKOUT_MS) }
        : { failedLoginAttempts: attempts, lockedUntil: null },
    });

    await logAudit({
      // Not a real authenticated actor (credentials never validated) — but
      // the log should still say whose account this was, so this passes
      // just the target User's id/name/email rather than null.
      user: { id: user.id, name: user.name, email: user.email },
      action: justLocked ? "LOGIN_LOCKED" : "LOGIN_FAILED",
      entityType: "User",
      entityId: user.id,
      summary: justLocked
        ? `${user.name} locked out after ${LOCKOUT_THRESHOLD} failed login attempts`
        : `Failed login attempt for ${user.name} (${attempts}/${LOCKOUT_THRESHOLD})`,
      metadata: { attempts, threshold: LOCKOUT_THRESHOLD },
    });

    if (justLocked) {
      return res.status(423).json({ error: lockedMessage(Math.ceil(LOCKOUT_MS / 1000)) });
    }
    return res.status(401).json({ error: "Invalid credentials" });
  }

  // A successful login clears any lingering failure count/lock.
  if (user.failedLoginAttempts > 0 || user.lockedUntil) {
    await prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: null } });
  }

  const authUser = toAuthUser(user);
  const token = signToken(authUser);
  await logAudit({
    user: authUser,
    action: "LOGIN",
    entityType: "User",
    entityId: authUser.id,
    summary: `${authUser.name} logged in`,
  });
  res.json({ token, user: authUser });
});

router.get("/me", requireAuth, async (req, res) => {
  res.json({ user: req.user });
});

const updateProfileSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  username: z.string().min(3).max(50).nullable().optional(),
});

// Self-service profile update — any authenticated user can change their own
// name/email/username. Deliberately does NOT include `role`, `description`,
// `businessUnitIds`, or `customRoleId`: those stay superadmin-only via
// routes/admin.ts. Returns a fresh token since name/email/username all
// travel in it.
router.put("/profile", requireAuth, async (req, res) => {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid profile payload" });
  }

  const { name, email, username } = parsed.data;
  const data: any = {};
  if (name) data.name = name;
  if (email) data.email = email.toLowerCase();
  if (username !== undefined) data.username = username ? username.toLowerCase() : null;

  try {
    const updated = await prisma.user.update({
      where: { id: req.user!.id },
      data,
      include: { businessUnits: { select: { businessUnitId: true } } },
    });
    const authUser = toAuthUser(updated);
    const token = signToken(authUser);
    res.json({ token, user: authUser });
  } catch (err: any) {
    if (err.code === "P2002") return res.status(409).json({ error: "Email or username is already in use" });
    throw err;
  }
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(8, "New password must be at least 8 characters")
    .refine((v) => /[A-Za-z]/.test(v) && /[0-9]/.test(v), "New password must contain letters and numbers"),
});

// Lets a logged-in user (including one flagged mustChangePassword after being
// seeded/created by a superadmin) set a new password. Always requires the
// current password. Returns a fresh token with mustChangePassword cleared.
router.post("/change-password", requireAuth, async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid password payload" });
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    include: { businessUnits: { select: { businessUnitId: true } } },
  });
  if (!user) return res.status(404).json({ error: "User not found" });

  const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!valid) return res.status(401).json({ error: "Current password is incorrect" });

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, mustChangePassword: false },
    include: { businessUnits: { select: { businessUnitId: true } } },
  });

  const authUser = toAuthUser(updated);
  const token = signToken(authUser);
  res.json({ token, user: authUser });
});

export default router;
