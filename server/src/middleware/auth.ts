import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: "GROUP_INTEGRATOR" | "BU_INTEGRATOR";
  businessUnitIds: string[];
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
 * Ensures a BU Integrator only ever touches business units they are assigned to.
 * Group Integrators bypass this check entirely (global access).
 * businessUnitId is resolved by the caller (either directly from the request,
 * or derived from a companyId lookup) before calling this helper.
 */
export function assertBusinessUnitAccess(user: AuthUser, businessUnitId: string) {
  if (user.role === "GROUP_INTEGRATOR") return;
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
 * - Otherwise, Group Integrators see everything (no filter); BU Integrators are
 *   implicitly restricted to their assigned business units.
 */
export function scopedBusinessUnitFilter(user: AuthUser, businessUnitId?: string): string | { in: string[] } | undefined {
  if (businessUnitId) {
    assertBusinessUnitAccess(user, businessUnitId);
    return businessUnitId;
  }
  if (user.role === "BU_INTEGRATOR") {
    return { in: user.businessUnitIds };
  }
  return undefined;
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
