import type { AuthUser } from "../middleware/auth";
import { Action, can, narrowingApplies, PermissionRow } from "./permissions";

// Who may view / enter a Company's quarterly income tax (see
// routes/incomeTax.ts). A Custom Role that mentions INCOME_TAX decides;
// otherwise the base role (Superadmin, Group Integrator, BU Integrator) can,
// within the Business Unit access the caller has already checked. Blank-role
// users only get it through an explicit grant.
export function canIncomeTax(user: AuthUser, permRows: PermissionRow[], action: Action, ctx: { businessUnitId: string; companyId: string }): boolean {
  if (narrowingApplies(Boolean(user.role), permRows, ["INCOME_TAX"])) return can(permRows, action, "INCOME_TAX", ctx);
  return true;
}
