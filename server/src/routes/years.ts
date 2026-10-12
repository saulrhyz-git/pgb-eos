import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { blockPendingPasswordChange, hasGlobalBusinessUnitAccess, requireAuth, requireRole } from "../middleware/auth";
import { logAudit } from "../utils/auditLog";
import { escalateStaleRocks } from "../utils/rockAutoStatus";
import { buildYearReport, scopeYearReport, YearReport } from "../utils/yearReport";

// ---------------------------------------------------------------------------
// Year wrap-up.
//
//   GET  /api/years/:id/wrap-up/preview  what's still open, before wrapping up
//   POST /api/years/:id/wrap-up          generate the full-year report + lock
//   GET  /api/years/:id/wrap-up/report   the frozen report
//   POST /api/years/:id/reopen           Superadmin only, reason required
//
// Wrapping up is Group Integrator / Superadmin only, and a Group Integrator
// must have group-wide access (not narrowed to specific Business Units),
// since it locks the whole Year for every Business Unit at once. The lock
// itself is enforced in utils/yearLock.ts; nothing is deleted or moved.
// Creating a new (blank) Year stays where it was: POST /api/years in meta.ts.
// ---------------------------------------------------------------------------
const router = Router();
router.use(requireAuth);
router.use(blockPendingPasswordChange);
router.use(requireRole("GROUP_INTEGRATOR", "SUPERADMIN"));

function yearEnded(year: number): boolean {
  return new Date() > new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
}

router.get("/:id/wrap-up/preview", async (req, res) => {
  const year = await prisma.year.findUnique({
    where: { id: req.params.id },
    select: { id: true, year: true, wrappedUpAt: true, wrappedUpByName: true },
  });
  if (!year) return res.status(404).json({ error: "Year not found" });

  const open = { yearId: year.id, status: { notIn: ["TARGET_MET", "ROLLED_OVER"] as any } };
  const [rocksTotal, openRocks, openQ4Rocks, companiesWithActuals, nextYear] = await Promise.all([
    prisma.rock.count({ where: { yearId: year.id } }),
    prisma.rock.count({ where: open }),
    prisma.rock.count({ where: { ...open, quarter: 4 } }),
    prisma.quarterActual.findMany({ where: { yearId: year.id }, distinct: ["companyId"], select: { companyId: true } }),
    prisma.year.findUnique({ where: { year: year.year + 1 }, select: { id: true } }),
  ]);
  const companiesTotal = await prisma.company.count();

  res.json({
    yearId: year.id,
    year: year.year,
    wrappedUpAt: year.wrappedUpAt,
    wrappedUpByName: year.wrappedUpByName,
    yearEnded: yearEnded(year.year),
    companiesTotal,
    companiesWithActuals: companiesWithActuals.length,
    rocksTotal,
    openRocks,
    openQ4Rocks,
    nextYearExists: Boolean(nextYear),
    canWrapUp: hasGlobalBusinessUnitAccess(req.user!),
  });
});

router.post("/:id/wrap-up", async (req, res) => {
  const user = req.user!;
  if (!hasGlobalBusinessUnitAccess(user)) {
    return res.status(403).json({
      error: "Wrapping up locks the Year for every Business Unit, so it needs group-wide access. Your account is limited to specific Business Units.",
    });
  }

  const parsed = z.object({ confirmYear: z.number().int() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "confirmYear is required" });

  const year = await prisma.year.findUnique({ where: { id: req.params.id }, select: { id: true, year: true, wrappedUpAt: true } });
  if (!year) return res.status(404).json({ error: "Year not found" });
  if (year.wrappedUpAt) return res.status(409).json({ error: `Year ${year.year} is already wrapped up.` });
  if (parsed.data.confirmYear !== year.year) {
    return res.status(400).json({ error: `Type ${year.year} to confirm — it didn't match.` });
  }

  // Bring every Rock's auto-status up to date one last time, so the report
  // and the frozen statuses reflect today rather than the last page load.
  await escalateStaleRocks({ yearId: year.id });

  const report = await buildYearReport(year.id, { id: user.id, name: user.name });

  // updateMany with wrappedUpAt: null so two people clicking at once can't
  // both "win" — the second one updates zero rows.
  const now = new Date();
  const { count } = await prisma.year.updateMany({
    where: { id: year.id, wrappedUpAt: null },
    data: { wrappedUpAt: now, wrappedUpById: user.id, wrappedUpByName: user.name, wrapUpReport: report as any },
  });
  if (count === 0) return res.status(409).json({ error: `Year ${year.year} was just wrapped up by someone else.` });

  await logAudit({
    user,
    action: "YEAR_WRAP_UP",
    entityType: "Year",
    entityId: year.id,
    summary: `Wrapped up Year ${year.year} — full-year report generated and the Year locked`,
    metadata: {
      revenueActual: report.annual.revenueActual,
      netIncomeActual: report.annual.netIncomeActual,
      rocksTotal: report.rocks.summary.total,
      rocksTargetMet: report.rocks.summary.targetMet,
    },
  });

  res.json({ yearId: year.id, year: year.year, wrappedUpAt: now, wrappedUpByName: user.name });
});

router.get("/:id/wrap-up/report", async (req, res) => {
  const year = await prisma.year.findUnique({
    where: { id: req.params.id },
    select: { year: true, wrappedUpAt: true, wrappedUpByName: true, wrapUpReport: true },
  });
  if (!year) return res.status(404).json({ error: "Year not found" });
  if (!year.wrappedUpAt || !year.wrapUpReport) {
    return res.status(404).json({ error: `Year ${year.year} hasn't been wrapped up yet, so there's no wrap-up report.` });
  }

  const user = req.user!;
  const scoped = scopeYearReport(
    year.wrapUpReport as unknown as YearReport,
    hasGlobalBusinessUnitAccess(user) ? undefined : user.businessUnitIds
  );
  res.json({ ...scoped, wrappedUpAt: year.wrappedUpAt, wrappedUpByName: year.wrappedUpByName });
});

router.post("/:id/reopen", requireRole("SUPERADMIN"), async (req, res) => {
  const parsed = z.object({ reason: z.string().trim().min(5, "Please give a reason (at least 5 characters)").max(1000) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "A reason is required" });

  const year = await prisma.year.findUnique({ where: { id: req.params.id }, select: { id: true, year: true, wrappedUpAt: true, wrappedUpByName: true } });
  if (!year) return res.status(404).json({ error: "Year not found" });
  if (!year.wrappedUpAt) return res.status(409).json({ error: `Year ${year.year} isn't wrapped up.` });

  // The old report is kept in the column (replaced on the next wrap-up) but
  // isn't served while the Year is open, since live data may now change.
  await prisma.year.update({
    where: { id: year.id },
    data: { wrappedUpAt: null, wrappedUpById: null, wrappedUpByName: null },
  });

  await logAudit({
    user: req.user,
    action: "YEAR_REOPEN",
    entityType: "Year",
    entityId: year.id,
    summary: `Reopened Year ${year.year} (was wrapped up ${year.wrappedUpAt.toISOString().slice(0, 10)} by ${year.wrappedUpByName || "unknown"})`,
    metadata: { reason: parsed.data.reason },
  });

  res.json({ yearId: year.id, year: year.year, wrappedUpAt: null });
});

export default router;
