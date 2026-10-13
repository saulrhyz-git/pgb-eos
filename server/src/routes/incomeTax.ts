import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import {
  assertBusinessUnitAccess,
  AuthUser,
  blockPendingPasswordChange,
  loadUserPermissions,
  requireAuth,
  resolveCompanyBusinessUnit,
} from "../middleware/auth";
import { PermissionError } from "../utils/permissions";
import { canIncomeTax } from "../utils/incomeTaxAccess";
import { logAudit } from "../utils/auditLog";
import { assertYearOpen } from "../utils/yearLock";
import { n } from "../utils/aggregate";

// ---------------------------------------------------------------------------
// Quarterly income tax per Company (see IncomeTax in schema.prisma).
//
//   GET    /api/income-tax?yearId&quarter&companyId   the entered tax, if any
//   PUT    /api/income-tax                            enter / update it
//   DELETE /api/income-tax?yearId&quarter&companyId   clear it (NIAT goes back
//                                                     to its estimate)
//
// The NIAT tab uses an entered amount as that quarter's tax; quarters with
// nothing entered fall back to the RCIT/MCIT estimate. Recording tax is
// independent of the NIAT feature flag — it can always be entered.
//
// Access is its own role-matrix item (INCOME_TAX). Without a Custom Role
// that mentions it, the base role decides: Superadmins, Group Integrators
// and BU Integrators can view and enter tax for the Business Units they're
// assigned to — the same people who enter Actuals. Blank-role users need an
// explicit grant. A wrapped-up Year is read-only.
// ---------------------------------------------------------------------------
const router = Router();
router.use(requireAuth);
router.use(blockPendingPasswordChange);

const keySchema = z.object({
  companyId: z.string().uuid(),
  yearId: z.string().uuid(),
  quarter: z.coerce.number().int().min(1).max(4),
});

async function resolveScope(user: AuthUser, companyId: string) {
  const businessUnitId = await resolveCompanyBusinessUnit(companyId);
  assertBusinessUnitAccess(user, businessUnitId);
  return { businessUnitId, companyId };
}

router.get("/", async (req, res) => {
  const parsed = keySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "companyId, yearId and quarter (1-4) are required" });
  const { companyId, yearId, quarter } = parsed.data;
  const user = req.user!;
  try {
    const ctx = await resolveScope(user, companyId);
    const permRows = await loadUserPermissions(user);
    const canView = canIncomeTax(user, permRows, "view", ctx);
    const canEdit = canIncomeTax(user, permRows, "edit", ctx);
    if (!canView) return res.json({ canView: false, canEdit: false, amount: null, remarks: "", updatedAt: null });
    const row = await prisma.incomeTax.findUnique({
      where: { companyId_yearId_quarter: { companyId, yearId, quarter } },
    });
    res.json({
      canView,
      canEdit,
      amount: row ? n(row.amount) : null,
      remarks: row?.remarks ?? "",
      updatedAt: row?.updatedAt ?? null,
    });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

const putSchema = keySchema.extend({
  quarter: z.number().int().min(1).max(4),
  // Tax can legitimately be negative only in edge cases (refunds/credits);
  // allow it, but keep it to a sane range.
  amount: z.number().min(-1e12).max(1e12),
  remarks: z.string().max(2000).optional().default(""),
});

router.put("/", async (req, res) => {
  const parsed = putSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid income tax" });
  const { companyId, yearId, quarter, remarks } = parsed.data;
  const amount = Math.round(parsed.data.amount * 100) / 100;
  const user = req.user!;
  try {
    await assertYearOpen(yearId);
    const ctx = await resolveScope(user, companyId);
    const permRows = await loadUserPermissions(user);
    if (!canIncomeTax(user, permRows, "edit", ctx)) throw new PermissionError("Your role doesn't allow entering income tax for this Company");

    const before = await prisma.incomeTax.findUnique({ where: { companyId_yearId_quarter: { companyId, yearId, quarter } } });
    const row = await prisma.incomeTax.upsert({
      where: { companyId_yearId_quarter: { companyId, yearId, quarter } },
      update: { amount, remarks, updatedById: user.id },
      create: { companyId, yearId, quarter, amount, remarks, updatedById: user.id },
    });
    await logAudit({
      user,
      action: "INCOME_TAX_UPDATE",
      entityType: "IncomeTax",
      entityId: row.id,
      summary: `${before ? "Updated" : "Entered"} Q${quarter} income tax for Company ${companyId}`,
      metadata: { companyId, yearId, quarter, amount, previousAmount: before ? n(before.amount) : null },
    });
    res.json({ amount: n(row.amount), remarks: row.remarks, updatedAt: row.updatedAt });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.delete("/", async (req, res) => {
  const parsed = keySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "companyId, yearId and quarter (1-4) are required" });
  const { companyId, yearId, quarter } = parsed.data;
  const user = req.user!;
  try {
    await assertYearOpen(yearId);
    const ctx = await resolveScope(user, companyId);
    const permRows = await loadUserPermissions(user);
    // Clearing is an edit of the quarter's tax (back to "not entered"), not
    // the deletion of a record someone manages separately.
    if (!canIncomeTax(user, permRows, "edit", ctx)) throw new PermissionError("Your role doesn't allow changing income tax for this Company");
    const before = await prisma.incomeTax.findUnique({ where: { companyId_yearId_quarter: { companyId, yearId, quarter } } });
    if (!before) return res.status(204).send();
    await prisma.incomeTax.delete({ where: { id: before.id } });
    await logAudit({
      user,
      action: "INCOME_TAX_CLEAR",
      entityType: "IncomeTax",
      entityId: before.id,
      summary: `Cleared Q${quarter} income tax for Company ${companyId} (NIAT goes back to its estimate)`,
      metadata: { companyId, yearId, quarter, previousAmount: n(before.amount) },
    });
    res.status(204).send();
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

export default router;
