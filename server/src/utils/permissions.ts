import { prisma } from "../lib/prisma";

// Mirrors the Prisma PermissionResource enum. Kept as a plain string union
// here (rather than importing the generated enum) so this file has no
// Prisma-client-generation-order dependency.
export type Resource =
  | "TARGETS"
  | "REVENUE"
  | "COLLECTIONS"
  | "EXPENSES"
  | "ROCKS"
  | "SCORECARD"
  | "AUDIT_LOG"
  | "REPORTS"
  | "DISBURSEMENTS";
// Deliberately excludes AUDIT_LOG: ALL_RESOURCES feeds `canAny()`, which
// meta.ts uses to decide whether a Business Unit/Company should show up in
// dropdowns at all ("does this role have any view grant here"). Unlike the
// other resources (including SCORECARD, REPORTS, and DISBURSEMENTS),
// AUDIT_LOG isn't really about any one Business Unit/Company's data — it's a
// global security log, with no BU/Company filter of its own — so a role that
// only grants AUDIT_LOG view shouldn't cause an otherwise-invisible BU to
// start appearing in unrelated dropdowns. REPORTS and DISBURSEMENTS, by
// contrast, DO have their own Business Unit/Company filters (same as the
// Scorecard and Rocks pages), so they're included here for the same reason
// SCORECARD is: a Disbursements-only Custom Role still needs to see the
// right BU/Company in its own filter dropdowns.
export const ALL_RESOURCES: Resource[] = [
  "TARGETS",
  "REVENUE",
  "COLLECTIONS",
  "EXPENSES",
  "ROCKS",
  "SCORECARD",
  "REPORTS",
  "DISBURSEMENTS",
];
// The three financial categories a single QuarterActual record covers at
// once. Its PUT endpoint submits all three together, so — since permissions
// are granted per-category — actuals.ts treats "can I submit this form at
// all" as "do I have edit on at least one of these", per-field remarks
// patches aside (those check the matching single category instead).
export const FINANCIAL_RESOURCES: Resource[] = ["REVENUE", "COLLECTIONS", "EXPENSES"];

export type Action = "view" | "edit" | "delete";

export interface PermissionRow {
  businessUnitId: string | null;
  companyId: string | null;
  resource: Resource;
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

/**
 * Loads every RolePermission row belonging to a Custom Role. Called once per
 * request (not cached across requests) so edits to a role take effect
 * immediately, without waiting for affected users to log in again.
 */
export async function loadRolePermissions(customRoleId: string): Promise<PermissionRow[]> {
  const rows = await prisma.rolePermission.findMany({ where: { customRoleId } });
  return rows.map((r) => ({
    businessUnitId: r.businessUnitId,
    companyId: r.companyId,
    resource: r.resource as Resource,
    canView: r.canView,
    canEdit: r.canEdit,
    canDelete: r.canDelete,
  }));
}

/**
 * Same as loadRolePermissions, but for a User with any number of assigned
 * Custom Roles at once (see UserCustomRole in schema.prisma) — one query
 * returning the union of every assigned role's RolePermission rows. Every
 * `can()`/`canAnyOf()`/`hasAnyGrant()` check downstream already treats its
 * `rows` argument as "whatever this user is granted, from wherever", so
 * merging rows from multiple roles into one flat array here is all that's
 * needed for a user's effective access to be the union of all their roles.
 */
export async function loadRolePermissionsForRoles(customRoleIds: string[]): Promise<PermissionRow[]> {
  if (customRoleIds.length === 0) return [];
  const rows = await prisma.rolePermission.findMany({ where: { customRoleId: { in: customRoleIds } } });
  return rows.map((r) => ({
    businessUnitId: r.businessUnitId,
    companyId: r.companyId,
    resource: r.resource as Resource,
    canView: r.canView,
    canEdit: r.canEdit,
    canDelete: r.canDelete,
  }));
}

const actionKey: Record<Action, keyof PermissionRow> = {
  view: "canView",
  edit: "canEdit",
  delete: "canDelete",
};

/**
 * Rows scoped to a specific Company always take precedence over a
 * Business-Unit-level row for the same resource, letting a role grant BU-wide
 * access with a narrower (or wider) carve-out for one specific Company.
 */
function relevantRows(rows: PermissionRow[], resource: Resource, ctx: { businessUnitId?: string; companyId?: string }) {
  if (ctx.companyId) {
    const companyRows = rows.filter((r) => r.resource === resource && r.companyId === ctx.companyId);
    if (companyRows.length) return companyRows;
  }
  if (ctx.businessUnitId) {
    return rows.filter((r) => r.resource === resource && r.businessUnitId === ctx.businessUnitId && !r.companyId);
  }
  return [];
}

/** Does this permission set allow `action` on `resource` for the given Business Unit/Company? */
export function can(
  rows: PermissionRow[],
  action: Action,
  resource: Resource,
  ctx: { businessUnitId?: string; companyId?: string }
): boolean {
  const relevant = relevantRows(rows, resource, ctx);
  if (!relevant.length) return false;
  const key = actionKey[action];
  return relevant.some((r) => Boolean(r[key]));
}

/** Does this permission set allow `action` on ANY of `resources` for this Business Unit/Company? */
export function canAnyOf(
  rows: PermissionRow[],
  action: Action,
  resources: Resource[],
  ctx: { businessUnitId?: string; companyId?: string }
): boolean {
  return resources.some((resource) => can(rows, action, resource, ctx));
}

/** Does this permission set allow `action` on ANY resource for this Business Unit/Company (used for coarse visibility)? */
export function canAny(rows: PermissionRow[], action: Action, ctx: { businessUnitId?: string; companyId?: string }): boolean {
  return canAnyOf(rows, action, ALL_RESOURCES, ctx);
}

/**
 * Does this Custom Role even *address* any of `resources` — anywhere, for any
 * Business Unit/Company — at all? A RolePermission row only ever exists if an
 * admin explicitly checked at least one View/Edit/Delete box for it (see
 * AdminRoles.tsx), so this answers "did the person who built this role
 * configure anything for these resources", as opposed to `rows.length > 0`,
 * which is true the instant the role touches ANY resource whatsoever (even
 * ones with nothing to do with the check at hand).
 *
 * This is the fix for Custom Roles narrowing resources they were never meant
 * to touch: a role built to grant only SCORECARD view has rows, so
 * `rows.length > 0`, but `hasAnyGrant(rows, FINANCIAL_RESOURCES)` is false —
 * meaning financial narrowing should never engage for that user at all, and
 * their base role's normal Revenue/Collections/Expenses access is left fully
 * intact. Every call site that used to gate narrowing on raw `rows.length`
 * should gate on `hasAnyGrant(rows, <the specific resource(s) that route
 * narrows on>)` instead — that's what makes a Custom Role strictly additive
 * on top of the base role rather than a wholesale replacement of it.
 */
export function hasAnyGrant(rows: PermissionRow[], resources: Resource[]): boolean {
  return rows.some((r) => resources.includes(r.resource));
}

export class PermissionError extends Error {
  status = 403;
  constructor(message = "You don't have permission to do this") {
    super(message);
  }
}

/** Throws a 403 PermissionError unless `action` on `resource` is allowed for this scope. */
export function assertPermission(
  rows: PermissionRow[],
  action: Action,
  resource: Resource,
  ctx: { businessUnitId?: string; companyId?: string }
) {
  if (!can(rows, action, resource, ctx)) {
    throw new PermissionError(`Your assigned role does not allow you to ${action} ${resource.toLowerCase()} here`);
  }
}
