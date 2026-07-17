import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";

export interface AuthUser {
  id: string;
  email: string;
  username?: string | null;
  name: string;
  role: "SUPERADMIN" | "GROUP_INTEGRATOR" | "BU_INTEGRATOR";
  businessUnitIds: string[];
  mustChangePassword: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

export function signToken(user: AuthUser): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: "12h" });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or malformed Authorization header" });
  }
  const token = header.slice("Bearer ".length);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireRole(...roles: Array<AuthUser["role"]>) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions for this action" });
    }
    next();
  };
}

/**
 * Blocks any request other than the password-change flow itself while a user's
 * `mustChangePassword` flag is set (e.g. the seeded superadmin's first login).
 * Mount this after requireAuth on every router except the auth router.
 */
export function blockPendingPasswordChange(req: Request, res: Response, next: NextFunction) {
  if (req.user?.mustChangePassword) {
    return res.status(403).json({ error: "You must change your password before continuing", code: "MUST_CHANGE_PASSWORD" });
  }
  next();
}

/**
 * Superadmins always have global Business Unit access. Group Integrators are
 * global by default (backward-compatible), but an admin can now optionally
 * assign a Group Integrator to one or more specific Business Units — once
 * assigned, that Group Integrator is scoped to just those BUs instead of
 * everything. BU Integrators are always scoped to their assignment(s) and
 * are required to have at least one.
 */
function hasGlobalBusinessUnitAccess(user: AuthUser): boolean {
  if (user.role === "SUPERADMIN") return true;
  if (user.role === "GROUP_INTEGRATOR") return user.businessUnitIds.length === 0;
  return false;
}

/**
 * Ensures a scoped user (a BU Integrator, or a Group Integrator that has been
 * assigned specific Business Units) only ever touches Business Units they're
 * assigned to. Superadmins, and Group Integrators with no explicit BU
 * assignment, bypass this check entirely (global access). businessUnitId is
 * resolved by the caller (either directly from the request, or derived from
 * a companyId lookup) before calling this helper.
 */
export function assertBusinessUnitAccess(user: AuthUser, businessUnitId: string) {
  if (hasGlobalBusinessUnitAccess(user)) return;
  if (!user.businessUnitIds.includes(businessUnitId)) {
    const err = new Error("You are not assigned to this Business Unit");
    (err as any).status = 403;
    throw err;
  }
}

/**
 * Resolves the effective Prisma "businessUnitId" filter for a scoped GET query.
 * - If the caller explicitly requested a businessUnitId, verify they're allowed to see it
 *   (throws 403 otherwise) and return that single id.
 * - Otherwise, users with global access (Superadmins, and Group Integrators with
 *   no explicit BU assignment) see everything (no filter); BU Integrators and
 *   BU-assigned Group Integrators are implicitly restricted to their assigned
 *   business units (which may be more than one).
 */
export function scopedBusinessUnitFilter(user: AuthUser, businessUnitId?: string): string | { in: string[] } | undefined {
  if (businessUnitId) {
    assertBusinessUnitAccess(user, businessUnitId);
    return businessUnitId;
  }
  if (hasGlobalBusinessUnitAccess(user)) return undefined;
  return { in: user.businessUnitIds };
}

export async function resolveCompanyBusinessUnit(companyId: string): Promise<string> {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { businessUnitId: true } });
  if (!company) {
    const err = new Error("Company not found");
    (err as any).status = 404;
    throw err;
  }
  return company.businessUnitId;
}
