import { Router } from "express";
import { prisma } from "../lib/prisma";
import {
  assertBusinessUnitAccess,
  blockPendingPasswordChange,
  loadUserPermissions,
  requireAuth,
  resolveCompanyBusinessUnit,
  scopedBusinessUnitFilter,
} from "../middleware/auth";
import { can, canAnyOf, FINANCIAL_RESOURCES, hasAnyGrant } from "../utils/permissions";
import {
  addDisbursementFigures,
  addFigures,
  collectionsTotal,
  DisbursementFigures,
  disbursementsTotal,
  emptyDisbursementFigures,
  emptyFigures,
  expensesTotal,
  Figures,
  pct,
  revenueTotal,
  toDisbursementFigures,
  toFigures,
} from "../utils/aggregate";
import { escalateStaleRocks } from "../utils/rockAutoStatus";

// Side-by-side Comparison tab: given an arbitrary Year+Quarter(+Business
// Unit+Company) scope, returns ONE aggregated snapshot covering "everything"
// on the Executive Scorecard — Revenue/Collections/Expenses Target+Actual+
// attainment, Rocks status counts, and Disbursements actuals — masked by the
// exact same Custom Role grants as scorecard.ts/dashboard.ts/rocks.ts/
// disbursements.ts. The frontend calls GET /snapshot twice (once per panel)
// with independently chosen scopes and computes the delta/%-change itself.
const router = Router();
router.use(requireAuth);
router.use(blockPendingPasswordChange);

/**
 * Access gate: same default as the Executive Scorecard and Reports —
 * Superadmins and Group Integrators can always open the Comparison tab; a BU
 * Integrator (or blank-role user) needs a Custom Role that explicitly grants
 * COMPARISON view. This only gates opening the page at all — the actual
 * figures returned by /snapshot are still masked per the REVENUE/
 * COLLECTIONS/EXPENSES/ROCKS/DISBURSEMENTS grants exactly like everywhere
 * else in the app (see below).
 */
router.use(async (req, res, next) => {
  const user = req.user!;
  if (user.role === "SUPERADMIN" || user.role === "GROUP_INTEGRATOR") return next();
  const permRows = await loadUserPermissions(user);
  if (permRows.some((r) => r.resource === "COMPARISON" && r.canView)) return next();
  return res.status(403).json({ error: "You don't have access to the Comparison tab" });
});

/**
 * GET /api/comparison/snapshot
 * Query params: yearId (required), quarter (1-4, or "all"/omitted for the
 * full year), businessUnitId (optional drill-down), companyId (optional
 * further drill-down into one specific Company within that Business Unit —
 * unlike the Executive Scorecard, this endpoint supports Company-level scope
 * since each Comparison panel picks its own Business Unit *and* Company
 * independently).
 */
router.get("/snapshot", async (req, res) => {
  const user = req.user!;
  const { yearId, businessUnitId, companyId } = req.query as Record<string, string | undefined>;
  const quarterParam = req.query.quarter as string | undefined;
  const isAllQuarters = quarterParam === "all" || quarterParam === undefined;
  const quarter = isAllQuarters ? 0 : Number(quarterParam);
  const quartersInScope = isAllQuarters ? [1, 2, 3, 4] : [quarter];

  if (!yearId) return res.status(400).json({ error: "yearId is required" });
  if (!isAllQuarters && (quarter < 1 || quarter > 4)) {
    return res.status(400).json({ error: 'quarter must be 1-4 or "all"' });
  }

  const year = await prisma.year.findUnique({ where: { id: yearId }, select: { year: true } });
  if (!year) return res.status(404).json({ error: "Year not found" });

  // Resolve which Company rows are in scope: either one specific Company
  // (companyId given — verified against the caller's own BU assignment) or
  // every Company under the resolved Business Unit filter (all of them, if
  // neither businessUnitId nor companyId was given and the user has global
  // access).
  let companies: { id: string; name: string; businessUnitId: string }[];
  let businessUnitName: string | null = null;
  let companyName: string | null = null;
  try {
    if (companyId) {
      const buId = await resolveCompanyBusinessUnit(companyId);
      assertBusinessUnitAccess(user, buId);
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { id: true, name: true, businessUnitId: true, businessUnit: { select: { name: true } } },
      });
      if (!company) return res.status(404).json({ error: "Company not found" });
      companies = [{ id: company.id, name: company.name, businessUnitId: company.businessUnitId }];
      companyName = company.name;
      businessUnitName = company.businessUnit.name;
    } else {
      const buFilter = scopedBusinessUnitFilter(user, businessUnitId);
      const companyWhere: any = {};
      if (buFilter) companyWhere.businessUnitId = buFilter;
      companies = await prisma.company.findMany({ where: companyWhere, select: { id: true, name: true, businessUnitId: true } });
      if (businessUnitId) {
        const bu = await prisma.businessUnit.findUnique({ where: { id: businessUnitId }, select: { name: true } });
        businessUnitName = bu?.name || null;
      }
    }
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  const permRows = await loadUserPermissions(user);
  const financialRoleActive = hasAnyGrant(permRows, FINANCIAL_RESOURCES);
  const rocksRoleActive = hasAnyGrant(permRows, ["ROCKS"]);
  const disbursementsRoleActive = hasAnyGrant(permRows, ["DISBURSEMENTS"]);

  // Per-category financial masking (Revenue/Collections/Expenses are each
  // independently gate-able — see FINANCIAL_RESOURCES) applied while
  // summing, same "zero this category out for this company, keep the rest"
  // pattern used in scorecard.ts/reports.ts.
  function isCatAllowed(cid: string, buId: string, resource: "REVENUE" | "COLLECTIONS" | "EXPENSES"): boolean {
    if (!financialRoleActive) return true;
    return can(permRows, "view", resource, { businessUnitId: buId, companyId: cid });
  }

  // Rocks and Disbursements are each ONE combined resource — narrowed by
  // filtering the whole company list down to the ones actually granted,
  // exactly like scorecard.ts, rather than per-category masking. Computed
  // independently from the same raw `companies` list (not derived from one
  // another) so a role granting only DISBURSEMENTS (without ROCKS or
  // financials) still sees its own data in full.
  let rockCompanies = companies;
  if (rocksRoleActive) {
    rockCompanies = companies.filter((c) => can(permRows, "view", "ROCKS", { businessUnitId: c.businessUnitId, companyId: c.id }));
  }
  let disbCompanies = companies;
  if (disbursementsRoleActive) {
    disbCompanies = companies.filter((c) =>
      can(permRows, "view", "DISBURSEMENTS", { businessUnitId: c.businessUnitId, companyId: c.id })
    );
  }

  // ---------- Revenue / Collections / Expenses ----------
  const companyIds = companies.map((c) => c.id);
  const [quarterTargets, quarterActuals] = await Promise.all([
    companyIds.length ? prisma.quarterTarget.findMany({ where: { yearId, companyId: { in: companyIds } } }) : [],
    companyIds.length ? prisma.quarterActual.findMany({ where: { yearId, companyId: { in: companyIds } } }) : [],
  ]);
  const targetByCq = new Map<string, Figures>();
  for (const t of quarterTargets) targetByCq.set(`${t.companyId}:${t.quarter}`, toFigures(t));
  const actualByCq = new Map<string, Figures>();
  for (const a of quarterActuals) actualByCq.set(`${a.companyId}:${a.quarter}`, toFigures(a));

  let revenueTargetTotal = 0;
  let revenueActualTotal = 0;
  let collectionsTargetTotal = 0;
  let collectionsActualTotal = 0;
  let expensesTargetTotal = 0;
  let expensesActualTotal = 0;

  for (const c of companies) {
    let t = emptyFigures();
    let a = emptyFigures();
    for (const q of quartersInScope) {
      t = addFigures(t, targetByCq.get(`${c.id}:${q}`) || emptyFigures());
      a = addFigures(a, actualByCq.get(`${c.id}:${q}`) || emptyFigures());
    }
    if (isCatAllowed(c.id, c.businessUnitId, "REVENUE")) {
      revenueTargetTotal += revenueTotal(t);
      revenueActualTotal += revenueTotal(a);
    }
    if (isCatAllowed(c.id, c.businessUnitId, "COLLECTIONS")) {
      collectionsTargetTotal += collectionsTotal(t);
      collectionsActualTotal += collectionsTotal(a);
    }
    if (isCatAllowed(c.id, c.businessUnitId, "EXPENSES")) {
      expensesTargetTotal += expensesTotal(t);
      expensesActualTotal += expensesTotal(a);
    }
  }

  // ---------- Rocks ----------
  const rockCompanyIds = rockCompanies.map((c) => c.id);
  if (rockCompanyIds.length) await escalateStaleRocks({ yearId, companyId: { in: rockCompanyIds } });

  const rockWhere: any = { yearId };
  if (!isAllQuarters) rockWhere.quarter = quarter;
  if (rockCompanyIds.length) rockWhere.companyId = { in: rockCompanyIds };
  const rocks = rockCompanyIds.length ? await prisma.rock.findMany({ where: rockWhere, select: { status: true, progressPct: true } }) : [];

  const rocksTotal = rocks.length;
  const rocksTargetMet = rocks.filter((r) => r.status === "TARGET_MET").length;
  const rocksOnTrack = rocks.filter((r) => r.status === "ON_TRACK").length;
  const rocksAtRisk = rocks.filter((r) => r.status === "AT_RISK").length;
  const rocksPending = rocks.filter((r) => r.status === "PENDING").length;
  const rocksAvgProgressPct = rocksTotal ? Math.round(rocks.reduce((sum, r) => sum + r.progressPct, 0) / rocksTotal) : 0;

  // ---------- Disbursements ----------
  const disbCompanyIds = disbCompanies.map((c) => c.id);
  const disbursementActuals = disbCompanyIds.length
    ? await prisma.disbursementActual.findMany({ where: { yearId, companyId: { in: disbCompanyIds } } })
    : [];
  const disbByCq = new Map<string, DisbursementFigures>();
  for (const d of disbursementActuals) disbByCq.set(`${d.companyId}:${d.quarter}`, toDisbursementFigures(d));

  let disbursementsActualTotal = 0;
  for (const cid of disbCompanyIds) {
    let agg = emptyDisbursementFigures();
    for (const q of quartersInScope) {
      agg = addDisbursementFigures(agg, disbByCq.get(`${cid}:${q}`) || emptyDisbursementFigures());
    }
    disbursementsActualTotal += disbursementsTotal(agg);
  }

  res.json({
    scope: {
      yearId,
      year: year.year,
      quarter,
      allQuarters: isAllQuarters,
      businessUnitId: businessUnitId || null,
      businessUnitName,
      companyId: companyId || null,
      companyName,
    },
    revenueTarget: revenueTargetTotal,
    revenueActual: revenueActualTotal,
    revenueAttainmentPct: pct(revenueActualTotal, revenueTargetTotal),
    collectionsTarget: collectionsTargetTotal,
    collectionsActual: collectionsActualTotal,
    collectionsAttainmentPct: pct(collectionsActualTotal, collectionsTargetTotal),
    expensesTarget: expensesTargetTotal,
    expensesActual: expensesActualTotal,
    expensesAttainmentPct: pct(expensesActualTotal, expensesTargetTotal),
    rocksTotal,
    rocksTargetMet,
    rocksOnTrack,
    rocksAtRisk,
    rocksPending,
    rocksAvgProgressPct,
    disbursementsActual: disbursementsActualTotal,
  });
});

export default router;
