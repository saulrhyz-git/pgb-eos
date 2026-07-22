import { Router } from "express";
import { prisma } from "../lib/prisma";
import { AuthUser, blockPendingPasswordChange, loadUserPermissions, requireAuth, scopedBusinessUnitFilter } from "../middleware/auth";
import { can, canAnyOf, FINANCIAL_RESOURCES, narrowingApplies } from "../utils/permissions";
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

const router = Router();
router.use(requireAuth);
router.use(blockPendingPasswordChange);

/**
 * Access gate: Superadmins and Group Integrators can always open the
 * Executive Scorecard (matches the default access level of other
 * exec/board-facing features like Business Goals management and Rock
 * Rollover). A BU Integrator needs a Custom Role that explicitly grants
 * SCORECARD view — anywhere, for any Business Unit/Company they're
 * otherwise scoped to — to see it at all. This is a coarse "can they open
 * the page" check; once inside, the actual figures shown are still masked
 * per the REVENUE/COLLECTIONS/EXPENSES/ROCKS grants exactly like everywhere
 * else in the app (see below).
 */
router.use(async (req, res, next) => {
  const user = req.user!;
  if (user.role === "SUPERADMIN" || user.role === "GROUP_INTEGRATOR") return next();
  const permRows = await loadUserPermissions(user);
  if (permRows.some((r) => r.resource === "SCORECARD" && r.canView)) return next();
  return res.status(403).json({ error: "You don't have access to the Executive Scorecard" });
});

export interface ScorecardParams {
  yearId?: string;
  quarter?: string;
  businessUnitId?: string;
}

/**
 * Computes the Executive Scorecard's data — the Revenue Performance
 * Summary, Rocks Performance Summary, and Disbursements Summary sections —
 * for a given user and scope. Extracted out of the GET / route handler
 * below so routes/aiAnalysis.ts can build its Gemini prompt from the exact
 * same numbers the Scorecard page shows, rather than re-deriving them
 * separately (and risking the two drifting apart). Throws an Error with a
 * `.status` property (400/403/etc, matching this codebase's usual ad-hoc
 * error convention — see assertBusinessUnitAccess) on invalid input or an
 * access violation; callers should catch and respond with
 * `err.status || 500`, same as every other route in this file.
 */
export async function computeScorecard(user: AuthUser, params: ScorecardParams) {
  const { yearId, businessUnitId } = params;
  const quarterParam = params.quarter;
  const isAllQuarters = quarterParam === "all" || quarterParam === undefined;
  const quarter = isAllQuarters ? 4 : Number(quarterParam);
  const quartersInScope = isAllQuarters ? [1, 2, 3, 4] : [quarter];

  if (!yearId) {
    const err: any = new Error("yearId is required");
    err.status = 400;
    throw err;
  }
  if (!isAllQuarters && (quarter < 1 || quarter > 4)) {
    const err: any = new Error('quarter must be 1-4 or "all"');
    err.status = 400;
    throw err;
  }

  const buWhere: any = {};
  const companyWhere: any = {};
  const buFilter = scopedBusinessUnitFilter(user, businessUnitId);
  if (buFilter) {
    buWhere.id = buFilter;
    companyWhere.businessUnitId = buFilter;
  }

  const permRows = await loadUserPermissions(user);

  let businessUnits = await prisma.businessUnit.findMany({ where: buWhere, orderBy: { name: "asc" } });
  let companies = await prisma.company.findMany({ where: companyWhere, orderBy: { name: "asc" } });

  // Same "hide entirely if no view grant at all" narrowing dashboard.ts does
  // for financial data, applied twice here — once for the Revenue section
  // (FINANCIAL_RESOURCES) and once for the Rocks section (ROCKS) below,
  // since a role could grant one without the other (e.g. a board member who
  // should see Rocks status but not raw financials). Each section only
  // engages narrowing if the Custom Role actually addresses that section's
  // resource(s) at all — a role that never mentions REVENUE/COLLECTIONS/
  // EXPENSES (e.g. a Rocks-only grant) must never touch financial visibility,
  // and vice versa. See hasAnyGrant() in utils/permissions.ts.
  let revenueCompanies = companies;
  let revenueBusinessUnits = businessUnits;
  let rockCompanies = companies;
  let rockBusinessUnits = businessUnits;
  let disbCompanies = companies;
  let disbBusinessUnits = businessUnits;

  const financialRoleActive = narrowingApplies(Boolean(user.role), permRows, FINANCIAL_RESOURCES);
  const rocksRoleActive = narrowingApplies(Boolean(user.role), permRows, ["ROCKS"]);
  const disbursementsRoleActive = narrowingApplies(Boolean(user.role), permRows, ["DISBURSEMENTS"]);

  if (financialRoleActive) {
    revenueCompanies = companies.filter((c) =>
      canAnyOf(permRows, "view", FINANCIAL_RESOURCES, { businessUnitId: c.businessUnitId, companyId: c.id })
    );
    const permittedRevenueBuIds = new Set(revenueCompanies.map((c) => c.businessUnitId));
    for (const bu of businessUnits) {
      if (canAnyOf(permRows, "view", FINANCIAL_RESOURCES, { businessUnitId: bu.id })) permittedRevenueBuIds.add(bu.id);
    }
    revenueBusinessUnits = businessUnits.filter((bu) => permittedRevenueBuIds.has(bu.id));
  }

  if (rocksRoleActive) {
    rockCompanies = companies.filter((c) => can(permRows, "view", "ROCKS", { businessUnitId: c.businessUnitId, companyId: c.id }));
    const permittedRockBuIds = new Set(rockCompanies.map((c) => c.businessUnitId));
    for (const bu of businessUnits) {
      if (can(permRows, "view", "ROCKS", { businessUnitId: bu.id })) permittedRockBuIds.add(bu.id);
    }
    rockBusinessUnits = businessUnits.filter((bu) => permittedRockBuIds.has(bu.id));
  }

  if (disbursementsRoleActive) {
    disbCompanies = companies.filter((c) => can(permRows, "view", "DISBURSEMENTS", { businessUnitId: c.businessUnitId, companyId: c.id }));
    const permittedDisbBuIds = new Set(disbCompanies.map((c) => c.businessUnitId));
    for (const bu of businessUnits) {
      if (can(permRows, "view", "DISBURSEMENTS", { businessUnitId: bu.id })) permittedDisbBuIds.add(bu.id);
    }
    disbBusinessUnits = businessUnits.filter((bu) => permittedDisbBuIds.has(bu.id));
  }

  function isCatAllowed(companyId: string, businessUnitId: string, resource: "REVENUE" | "COLLECTIONS" | "EXPENSES"): boolean {
    if (!financialRoleActive) return true;
    return can(permRows, "view", resource, { businessUnitId, companyId });
  }

  // ---------- Revenue Performance Summary ----------
  const revenueCompanyIds = revenueCompanies.map((c) => c.id);
  const [quarterTargets, quarterActuals] = await Promise.all([
    revenueCompanyIds.length ? prisma.quarterTarget.findMany({ where: { yearId, companyId: { in: revenueCompanyIds } } }) : [],
    revenueCompanyIds.length ? prisma.quarterActual.findMany({ where: { yearId, companyId: { in: revenueCompanyIds } } }) : [],
  ]);

  const qTargetByCompanyQuarter = new Map<string, Figures>();
  for (const t of quarterTargets) qTargetByCompanyQuarter.set(`${t.companyId}:${t.quarter}`, toFigures(t));
  const qActualByCompanyQuarter = new Map<string, Figures>();
  for (const a of quarterActuals) qActualByCompanyQuarter.set(`${a.companyId}:${a.quarter}`, toFigures(a));

  const annualByCompany = new Map<string, Figures>();
  for (const cid of revenueCompanyIds) {
    let annual = emptyFigures();
    for (let q = 1; q <= 4; q++) annual = addFigures(annual, qTargetByCompanyQuarter.get(`${cid}:${q}`) || emptyFigures());
    annualByCompany.set(cid, annual);
  }

  const revenueCompaniesByBu = new Map<string, typeof revenueCompanies>();
  for (const c of revenueCompanies) {
    const list = revenueCompaniesByBu.get(c.businessUnitId) || [];
    list.push(c);
    revenueCompaniesByBu.set(c.businessUnitId, list);
  }

  const chart = [1, 2, 3, 4].map((q) => {
    let targetInternal = 0,
      targetExternal = 0,
      actualInternal = 0,
      actualExternal = 0;
    for (const c of revenueCompanies) {
      if (!isCatAllowed(c.id, c.businessUnitId, "REVENUE")) continue;
      const t = qTargetByCompanyQuarter.get(`${c.id}:${q}`);
      if (t) {
        targetInternal += t.revenueInternal;
        targetExternal += t.revenueExternal;
      }
      const a = qActualByCompanyQuarter.get(`${c.id}:${q}`);
      if (a) {
        actualInternal += a.revenueInternal;
        actualExternal += a.revenueExternal;
      }
    }
    return { quarter: q, label: `Q${q}`, targetTotal: targetInternal + targetExternal, actualTotal: actualInternal + actualExternal };
  });

  let annualRevenueTargetTotal = 0;
  let annualCollectionsTargetTotal = 0;
  let annualExpensesTargetTotal = 0;
  let quarterRevenueTargetTotal = 0;
  let quarterCollectionsTargetTotal = 0;
  let quarterExpensesTargetTotal = 0;
  let quarterActualTotal = 0;
  // Expenses Actual (not just Target) for the scope in view — needed to
  // compute Net Income (Total Revenue − Total Expenses) for the headline
  // card. Mirrors the Collections/Expenses Actual parity already added to
  // dashboard.ts's kpis; scorecard.ts only tracked Expenses Target before.
  let quarterExpensesActualTotal = 0;
  let ytdTargetTotal = 0;
  let ytdActualTotal = 0;

  const buRows = revenueBusinessUnits.map((bu) => {
    const buCompanies = revenueCompaniesByBu.get(bu.id) || [];
    let annualAgg = emptyFigures();
    let quarterTargetAgg = emptyFigures();
    let quarterActualAgg = emptyFigures();
    let ytdActualAgg = emptyFigures();

    for (const c of buCompanies) {
      const revenueOk = isCatAllowed(c.id, c.businessUnitId, "REVENUE");
      const annual = annualByCompany.get(c.id) || emptyFigures();

      if (revenueOk) {
        annualRevenueTargetTotal += revenueTotal(annual);
        annualAgg = addFigures(annualAgg, annual);
      }
      if (isCatAllowed(c.id, c.businessUnitId, "COLLECTIONS")) annualCollectionsTargetTotal += collectionsTotal(annual);
      if (isCatAllowed(c.id, c.businessUnitId, "EXPENSES")) annualExpensesTargetTotal += expensesTotal(annual);

      let qt = emptyFigures();
      let qa = emptyFigures();
      for (const q of quartersInScope) {
        qt = addFigures(qt, qTargetByCompanyQuarter.get(`${c.id}:${q}`) || emptyFigures());
        qa = addFigures(qa, qActualByCompanyQuarter.get(`${c.id}:${q}`) || emptyFigures());
      }
      if (isCatAllowed(c.id, c.businessUnitId, "COLLECTIONS")) quarterCollectionsTargetTotal += collectionsTotal(qt);
      if (isCatAllowed(c.id, c.businessUnitId, "EXPENSES")) {
        quarterExpensesTargetTotal += expensesTotal(qt);
        quarterExpensesActualTotal += expensesTotal(qa);
      }
      if (revenueOk) {
        quarterRevenueTargetTotal += revenueTotal(qt);
        quarterActualTotal += revenueTotal(qa);
        quarterTargetAgg = addFigures(quarterTargetAgg, qt);
        quarterActualAgg = addFigures(quarterActualAgg, qa);
      }

      let ytdActualCompany = emptyFigures();
      for (let q = 1; q <= quarter; q++) {
        ytdActualCompany = addFigures(ytdActualCompany, qActualByCompanyQuarter.get(`${c.id}:${q}`) || emptyFigures());
      }
      if (revenueOk) {
        ytdActualAgg = addFigures(ytdActualAgg, ytdActualCompany);
        for (let q = 1; q <= quarter; q++) {
          ytdTargetTotal += revenueTotal(qTargetByCompanyQuarter.get(`${c.id}:${q}`) || emptyFigures());
        }
        ytdActualTotal += revenueTotal(ytdActualCompany);
      }
    }

    const annualTotal = revenueTotal(annualAgg);
    const quarterTargetTotalRow = revenueTotal(quarterTargetAgg);
    const quarterActualTotalRow = revenueTotal(quarterActualAgg);
    const ytdActualTotalRow = revenueTotal(ytdActualAgg);

    return {
      businessUnitId: bu.id,
      businessUnitName: bu.name,
      annualTarget: annualTotal,
      quarterTarget: quarterTargetTotalRow,
      quarterActual: quarterActualTotalRow,
      quarterAttainmentPct: pct(quarterActualTotalRow, quarterTargetTotalRow),
      ytdActual: ytdActualTotalRow,
      ytdVsAnnualPct: pct(ytdActualTotalRow, annualTotal),
    };
  });

  const revenue = {
    kpis: {
      annualRevenueTarget: annualRevenueTargetTotal,
      annualCollectionsTarget: annualCollectionsTargetTotal,
      annualExpensesTarget: annualExpensesTargetTotal,
      quarterTarget: quarterRevenueTargetTotal,
      quarterCollectionsTarget: quarterCollectionsTargetTotal,
      quarterExpensesTarget: quarterExpensesTargetTotal,
      quarterActual: quarterActualTotal,
      quarterExpensesActual: quarterExpensesActualTotal,
      ytdTarget: ytdTargetTotal,
      ytdActual: ytdActualTotal,
      attainmentPct: pct(quarterActualTotal, quarterRevenueTargetTotal),
      ytdAttainmentPct: pct(ytdActualTotal, ytdTargetTotal),
      // Net Income = Total Revenue (Actual) − Total Expenses (Actual) for
      // whatever scope (quarter or full year) is in view. Zeroed-out
      // Expenses (masked by a Custom Role without EXPENSES view) simply
      // means Net Income reflects Revenue alone, consistent with how every
      // other masked category already behaves on this page.
      netIncome: quarterActualTotal - quarterExpensesActualTotal,
    },
    chart,
    businessUnits: buRows,
  };

  // ---------- Rocks Performance Summary ----------
  const rockCompanyIds = rockCompanies.map((c) => c.id);

  // Same auto-escalation as GET /api/rocks (see utils/rockAutoStatus.ts) —
  // covers the whole Year in scope, not just the currently-selected Quarter,
  // so the Scorecard never shows a stale PENDING/ON_TRACK Rock that GET
  // /api/rocks would already have flagged AT_RISK.
  if (rockCompanyIds.length) {
    await escalateStaleRocks({ yearId, companyId: { in: rockCompanyIds } });
  }

  const rockWhere: any = { yearId };
  if (!isAllQuarters) rockWhere.quarter = quarter;
  if (rockCompanyIds.length) rockWhere.companyId = { in: rockCompanyIds };

  const rocks = rockCompanyIds.length
    ? await prisma.rock.findMany({
        where: rockWhere,
        include: { company: { select: { id: true, name: true, businessUnitId: true } } },
      })
    : [];

  const buNameById = new Map(rockBusinessUnits.map((bu) => [bu.id, bu.name]));

  function summarize(list: typeof rocks) {
    const total = list.length;
    const targetMet = list.filter((r) => r.status === "TARGET_MET").length;
    const onTrack = list.filter((r) => r.status === "ON_TRACK").length;
    const atRisk = list.filter((r) => r.status === "AT_RISK").length;
    const pending = list.filter((r) => r.status === "PENDING").length;
    const avgProgressPct = total ? Math.round(list.reduce((sum, r) => sum + r.progressPct, 0) / total) : 0;
    return { total, targetMet, onTrack, atRisk, pending, avgProgressPct };
  }

  const rocksByBu = new Map<string, typeof rocks>();
  for (const r of rocks) {
    const list = rocksByBu.get(r.company.businessUnitId) || [];
    list.push(r);
    rocksByBu.set(r.company.businessUnitId, list);
  }

  const rocksSection = {
    summary: summarize(rocks),
    businessUnits: rockBusinessUnits.map((bu) => ({
      businessUnitId: bu.id,
      businessUnitName: bu.name,
      ...summarize(rocksByBu.get(bu.id) || []),
    })),
    attentionNeeded: rocks
      .filter((r) => r.status === "AT_RISK" || r.status === "PENDING")
      .sort((a, b) => a.progressPct - b.progressPct)
      .slice(0, 8)
      .map((r) => ({
        id: r.id,
        title: r.title,
        companyName: r.company.name,
        businessUnitName: buNameById.get(r.company.businessUnitId) || "",
        ownerName: r.ownerName,
        status: r.status,
        progressPct: r.progressPct,
        quarter: r.quarter,
      })),
  };

  // ---------- Disbursements Summary ----------
  // Recorded (not targeted), same period scope as Revenue above — a single
  // running amount total, summed for whichever quarter(s) are in scope, plus
  // a per-Business-Unit breakdown.
  const disbCompanyIds = disbCompanies.map((c) => c.id);
  const disbursementActuals = disbCompanyIds.length
    ? await prisma.disbursementActual.findMany({ where: { yearId, companyId: { in: disbCompanyIds } } })
    : [];
  const disbByCompanyQuarter = new Map<string, DisbursementFigures>();
  for (const d of disbursementActuals) disbByCompanyQuarter.set(`${d.companyId}:${d.quarter}`, toDisbursementFigures(d));

  const disbCompaniesByBu = new Map<string, typeof disbCompanies>();
  for (const c of disbCompanies) {
    const list = disbCompaniesByBu.get(c.businessUnitId) || [];
    list.push(c);
    disbCompaniesByBu.set(c.businessUnitId, list);
  }

  let disbursementsActualTotal = 0;

  const disbBuRows = disbBusinessUnits.map((bu) => {
    const buCompanies = disbCompaniesByBu.get(bu.id) || [];
    let agg = emptyDisbursementFigures();
    for (const c of buCompanies) {
      for (const q of quartersInScope) {
        agg = addDisbursementFigures(agg, disbByCompanyQuarter.get(`${c.id}:${q}`) || emptyDisbursementFigures());
      }
    }
    const disbursements = disbursementsTotal(agg);
    disbursementsActualTotal += disbursements;
    return { businessUnitId: bu.id, businessUnitName: bu.name, disbursementsActual: disbursements };
  });

  const disbursementsSection = {
    summary: { disbursementsActual: disbursementsActualTotal },
    businessUnits: disbBuRows,
  };

  return {
    scope: { yearId, quarter, allQuarters: isAllQuarters, businessUnitId: businessUnitId || null },
    revenue,
    rocks: rocksSection,
    disbursements: disbursementsSection,
  };
}

/**
 * GET /api/scorecard
 * Query params: yearId (required), quarter (1-4, or "all"/omitted for the
 * full year — full year is the default here, since this is a board-level
 * view), businessUnitId (optional drill-down; no Company-level drill-down —
 * this page is intentionally summary-only).
 *
 * Two independent sections, each reusing the exact same figures/scoping the
 * Revenue dashboard and Rocks page already use — this route just re-shapes
 * them into a condensed, BU-level-only summary suited to a C-Level/BOD
 * audience instead of the row-by-row Operational Grid / Rocks table. See
 * computeScorecard() above for the actual work; this handler is now just
 * the HTTP wrapper around it.
 */
router.get("/", async (req, res) => {
  try {
    const result = await computeScorecard(req.user!, req.query as Record<string, string | undefined>);
    res.json(result);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

export default router;
