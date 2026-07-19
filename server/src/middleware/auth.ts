import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";
import { loadRolePermissions } from "../utils/permissions";

export interface AuthUser {
  id: string;
  email: string;
  username?: string | null;
  name: string;
  // null = "blank" role — no base-role-derived access at all. Such a user
  // relies entirely on their assigned Custom Role (customRoleId below); with
  // no Custom Role assigned either, they have no access to anything.
  role: "SUPERADMIN" | "GROUP_INTEGRATOR" | "BU_INTEGRATOR" | null;
  businessUnitIds: string[];
  mustChangePassword: boolean;
  // Optional, additional layer on top of `role` (see CustomRole/RolePermission
  // in schema.prisma). Only the id travels in the token — permissions
  // themselves are looked up fresh from the DB per request (see
  // utils/permissions.ts) so edits to a role take effect immediately rather
  // than waiting for the affected user to log in again. Superadmins ignore
  // this entirely; users with no customRoleId keep today's coarser
  // "everything in my assigned Business Unit(s)" behavior unchanged.
  customRoleId?: string | null;
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
 *
 * A "blank" role (role === null) has no coarse Business-Unit-assignment
 * concept of its own — such a user's access is meant to be defined entirely
 * by their Custom Role's own per-Business-Unit/Company grants. So: if they
 * have a Custom Role assigned, the coarse BU gate is bypassed entirely (this
 * function returns true) and the Custom Role's own `can()`/`assertPermission()`
 * checks downstream are what actually restrict them. If they have no Custom
 * Role at all, they have no basis for access whatsoever, so this returns
 * false and — since a blank-role user's businessUnitIds is always empty —
 * every coarse check below denies them by default.
 */
function hasGlobalBusinessUnitAccess(user: AuthUser): boolean {
  if (user.role === "SUPERADMIN") return true;
  if (user.role === "GROUP_INTEGRATOR") return user.businessUnitIds.length === 0;
  if (user.role === null) return Boolean(user.customRoleId);
  return false; // BU_INTEGRATOR
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

/**
 * Loads the requesting user's Custom Role permission rows, if any (empty
 * array if they have no customRoleId — routes should treat an empty array as
 * "not using the Custom Role system, fall back to existing BU scoping").
 * Superadmins never have their access narrowed by a Custom Role even if one
 * is somehow assigned, so this returns [] for them unconditionally.
 */
export async function loadUserPermissions(user: AuthUser) {
  if (user.role === "SUPERADMIN" || !user.customRoleId) return [];
  return loadRolePermissions(user.customRoleId);
}
