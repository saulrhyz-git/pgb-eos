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
import { addFigures, collectionsTotal, emptyFigures, expensesTotal, Figures, pct, revenueTotal, toFigures } from "../utils/aggregate";
import { can, canAnyOf, FINANCIAL_RESOURCES, hasAnyGrant, Resource } from "../utils/permissions";

const router = Router();
router.use(requireAuth);
router.use(blockPendingPasswordChange);

/**
 * GET /api/dashboard
 * Query params: yearId (required), quarter (1-4, or "all" for the full year, default 4),
 *               businessUnitId (optional scope), companyId (optional drill-down)
 *
 * Quarter Target and Quarter Actual are both recognized per Company. There is
 * no separately-stored Annual Target — it's always derived by summing a
 * Company's Q1-Q4 QuarterTarget rows, and that sum never changes with the
 * quarter filter. The Business-Unit-level numbers shown here (KPIs, chart,
 * target matrix, operational grid) are never stored directly either —
 * they're a rollup, computed on the fly by summing every Company's
 * target/actual within that BU.
 *
 * When quarter="all", every "quarter"-labeled figure (KPIs, operational
 * grid) represents the sum of Q1-Q4 instead of a single quarter — this is
 * the "All Quarters" option in the dashboard filter. This is unrelated to
 * Annual Target, which is always the Q1-Q4 sum regardless.
 *
 * If the requesting user has a Custom Role (see utils/permissions.ts), two
 * things happen on top of the usual Business-Unit scoping: (1) any Business
 * Unit/Company with no REVENUE/COLLECTIONS/EXPENSES view grant at all is
 * dropped from every list below rather than shown with zeroes, and (2)
 * within what remains, each of Revenue/Collections/Expenses is independently
 * zeroed out per Company wherever that specific category isn't granted —
 * so, e.g., a role with COLLECTIONS view but not REVENUE view sees real
 * Collections figures but 0 for every Revenue-derived number (which, per the
 * existing data model, includes the dashboard's "headline" KPIs/chart/
 * Operational Grid totals, since those have always been revenue-based).
 */
router.get("/", async (req, res) => {
  const user = req.user!;
  const { yearId, businessUnitId, companyId } = req.query as Record<string, string | undefined>;
  const quarterParam = req.query.quarter as string | undefined;
  const isAllQuarters = quarterParam === "all";
  const quarter = isAllQuarters ? 4 : quarterParam ? Number(quarterParam) : 4;
  const quartersInScope = isAllQuarters ? [1, 2, 3, 4] : [quarter];

  if (!yearId) return res.status(400).json({ error: "yearId is required" });
  if (!isAllQuarters && (quarter < 1 || quarter > 4)) {
    return res.status(400).json({ error: 'quarter must be 1-4 or "all"' });
  }

  // Resolve the Business Unit scope (which BUs show up) and the Company
  // scope (whose targets/actuals get summed) for this request.
  const buWhere: any = {};
  const companyWhere: any = {};
  try {
    if (companyId) {
      const buId = await resolveCompanyBusinessUnit(companyId);
      assertBusinessUnitAccess(user, buId);
      buWhere.id = buId;
      companyWhere.id = companyId;
    } else {
      const buFilter = scopedBusinessUnitFilter(user, businessUnitId);
      if (buFilter) {
        buWhere.id = buFilter;
        companyWhere.businessUnitId = buFilter;
      }
    }
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  const permRows = await loadUserPermissions(user);
  // Only engage Custom-Role narrowing for financial data if the role actually
  // addresses at least one of REVENUE/COLLECTIONS/EXPENSES somewhere — a role
  // that never mentions these (e.g. a SCORECARD-only grant) must leave the
  // user's base-role financial visibility completely untouched, rather than
  // collapsing it to nothing just because `permRows` is non-empty for some
  // unrelated resource. See hasAnyGrant() in utils/permissions.ts.
  const financialRoleActive = hasAnyGrant(permRows, FINANCIAL_RESOURCES);

  let businessUnits = await prisma.businessUnit.findMany({ where: buWhere, orderBy: { name: "asc" } });
  let companies = await prisma.company.findMany({ where: companyWhere, orderBy: { name: "asc" } });

  if (financialRoleActive) {
    // A Custom Role can grant view either at the whole-Business-Unit level or
    // at just one specific Company within it — a Business Unit stays visible
    // if EITHER is true for at least one of its Companies (or for itself
    // directly), so a narrow "just this one Company" grant isn't hidden for
    // lack of a BU-wide grant.
    companies = companies.filter((c) =>
      canAnyOf(permRows, "view", FINANCIAL_RESOURCES, { businessUnitId: c.businessUnitId, companyId: c.id })
    );
    const permittedBuIds = new Set(companies.map((c) => c.businessUnitId));
    for (const bu of businessUnits) {
      if (canAnyOf(permRows, "view", FINANCIAL_RESOURCES, { businessUnitId: bu.id })) permittedBuIds.add(bu.id);
    }
    businessUnits = businessUnits.filter((bu) => permittedBuIds.has(bu.id));
  }
  const businessUnitIds = businessUnits.map((b) => b.id);

  if (businessUnitIds.length === 0) {
    return res.json({
      scope: { yearId, quarter, allQuarters: isAllQuarters, businessUnitId: businessUnitId || null, companyId: companyId || null },
      kpis: {
        annualRevenueTarget: 0,
        annualCollectionsTarget: 0,
        annualExpensesTarget: 0,
        quarterTarget: 0,
        quarterCollectionsTarget: 0,
        quarterExpensesTarget: 0,
        quarterActual: 0,
        ytdTarget: 0,
        ytdActual: 0,
        attainmentPct: 0,
        ytdAttainmentPct: 0,
      },
      chart: [],
      targetMatrix: [],
      operationalGrid: [],
    });
  }

  const companyIds = companies.map((c) => c.id);

  const [quarterTargets, quarterActuals] = await Promise.all([
    companyIds.length ? prisma.quarterTarget.findMany({ where: { yearId, companyId: { in: companyIds } } }) : [],
    companyIds.length ? prisma.quarterActual.findMany({ where: { yearId, companyId: { in: companyIds } } }) : [],
  ]);

  const qTargetByCompanyQuarter = new Map<string, Figures>();
  for (const t of quarterTargets) qTargetByCompanyQuarter.set(`${t.companyId}:${t.quarter}`, toFigures(t));

  // "Annual Target" is not a separately-entered value — it's always the sum
  // of a Company's Q1-Q4 QuarterTarget rows, independent of the quarter
  // filter (unlike quarterTargetTotal/quarterActualTotal below, which do
  // respect it).
  const annualByCompany = new Map<string, Figures>();
  for (const cid of companyIds) {
    let annual = emptyFigures();
    for (let q = 1; q <= 4; q++) {
      annual = addFigures(annual, qTargetByCompanyQuarter.get(`${cid}:${q}`) || emptyFigures());
    }
    annualByCompany.set(cid, annual);
  }

  const qActualByCompanyQuarter = new Map<string, Figures>();
  const remarksByCompanyQuarter = new Map<
    string,
    { revenueRemarks: string; collectionsRemarks: string; expensesRemarks: string }
  >();
  for (const a of quarterActuals) {
    qActualByCompanyQuarter.set(`${a.companyId}:${a.quarter}`, toFigures(a));
    remarksByCompanyQuarter.set(`${a.companyId}:${a.quarter}`, {
      revenueRemarks: a.revenueRemarks,
      collectionsRemarks: a.collectionsRemarks,
      expensesRemarks: a.expensesRemarks,
    });
  }

  const companiesByBu = new Map<string, typeof companies>();
  const businessUnitIdByCompany = new Map<string, string>();
  for (const c of companies) {
    const list = companiesByBu.get(c.businessUnitId) || [];
    list.push(c);
    companiesByBu.set(c.businessUnitId, list);
    businessUnitIdByCompany.set(c.id, c.businessUnitId);
  }

  // Per-Company, per-category view check used to mask figures below. Users
  // whose Custom Role (if any) never addresses REVENUE/COLLECTIONS/EXPENSES
  // at all always pass — identical to having no Custom Role, and identical to
  // today's behavior for the common case. `companies`/`businessUnits` were
  // already narrowed above to ones with at least SOME financial view (only
  // when financialRoleActive), so this only ever hides one specific
  // category's numbers, never an entire row.
  function isCatAllowed(companyId: string, resource: Resource): boolean {
    if (!financialRoleActive) return true;
    return can(permRows, "view", resource, { businessUnitId: businessUnitIdByCompany.get(companyId), companyId });
  }

  // ---------- Chart: quarterly revenue vs target across Q1-Q4 for the whole scope ----------
  const chart = [1, 2, 3, 4].map((q) => {
    let targetInternal = 0,
      targetExternal = 0,
      actualInternal = 0,
      actualExternal = 0;
    for (const cid of companyIds) {
      if (!isCatAllowed(cid, "REVENUE")) continue;
      const t = qTargetByCompanyQuarter.get(`${cid}:${q}`);
      if (t) {
        targetInternal += t.revenueInternal;
        targetExternal += t.revenueExternal;
      }
      const a = qActualByCompanyQuarter.get(`${cid}:${q}`);
      if (a) {
        actualInternal += a.revenueInternal;
        actualExternal += a.revenueExternal;
      }
    }
    return {
      quarter: q,
      label: `Q${q}`,
      targetInternal,
      targetExternal,
      targetTotal: targetInternal + targetExternal,
      actualInternal,
      actualExternal,
      actualTotal: actualInternal + actualExternal,
    };
  });

  // ---------- KPIs (sum of every Company's target/actual in scope) ----------
  // The three Annual _ Target figures are a straight sum of every in-scope
  // Company's Q1-Q4 Quarter Target (via annualByCompany above) and never
  // change with the quarter filter.
  let annualRevenueTargetTotal = 0;
  let annualCollectionsTargetTotal = 0;
  let annualExpensesTargetTotal = 0;
  // Unlike the Annual _ Target figures above, these three DO respect the
  // quarter filter (quartersInScope) — they're the "Quarterly _ Target"
  // cards, one quarter's (or, in "All Quarters" mode, the full year's)
  // target by category.
  let quarterRevenueTargetTotal = 0;
  let quarterCollectionsTargetTotal = 0;
  let quarterExpensesTargetTotal = 0;
  let quarterActualTotal = 0;
  let ytdTargetTotal = 0;
  let ytdActualTotal = 0;

  for (const cid of companyIds) {
    const annual = annualByCompany.get(cid) || emptyFigures();
    if (isCatAllowed(cid, "REVENUE")) annualRevenueTargetTotal += revenueTotal(annual);
    if (isCatAllowed(cid, "COLLECTIONS")) annualCollectionsTargetTotal += collectionsTotal(annual);
    if (isCatAllowed(cid, "EXPENSES")) annualExpensesTargetTotal += expensesTotal(annual);

    for (const q of quartersInScope) {
      const qt = qTargetByCompanyQuarter.get(`${cid}:${q}`) || emptyFigures();
      if (isCatAllowed(cid, "REVENUE")) quarterRevenueTargetTotal += revenueTotal(qt);
      if (isCatAllowed(cid, "COLLECTIONS")) quarterCollectionsTargetTotal += collectionsTotal(qt);
      if (isCatAllowed(cid, "EXPENSES")) quarterExpensesTargetTotal += expensesTotal(qt);
      if (isCatAllowed(cid, "REVENUE")) {
        const qa = qActualByCompanyQuarter.get(`${cid}:${q}`) || emptyFigures();
        quarterActualTotal += revenueTotal(qa);
      }
    }

    if (isCatAllowed(cid, "REVENUE")) {
      for (let q = 1; q <= quarter; q++) {
        const t = qTargetByCompanyQuarter.get(`${cid}:${q}`) || emptyFigures();
        ytdTargetTotal += revenueTotal(t);
        const a = qActualByCompanyQuarter.get(`${cid}:${q}`) || emptyFigures();
        ytdActualTotal += revenueTotal(a);
      }
    }
  }

  const kpis = {
    annualRevenueTarget: annualRevenueTargetTotal,
    annualCollectionsTarget: annualCollectionsTargetTotal,
    annualExpensesTarget: annualExpensesTargetTotal,
    quarterTarget: quarterRevenueTargetTotal,
    quarterCollectionsTarget: quarterCollectionsTargetTotal,
    quarterExpensesTarget: quarterExpensesTargetTotal,
    quarterActual: quarterActualTotal,
    ytdTarget: ytdTargetTotal,
    ytdActual: ytdActualTotal,
    attainmentPct: pct(quarterActualTotal, quarterRevenueTargetTotal),
    ytdAttainmentPct: pct(ytdActualTotal, ytdTargetTotal),
  };

  // ---------- Target Distribution Matrix: Q1-Q4 Target per Business Unit, by category, plus their Annual (Q1-Q4) sum ----------
  // (a Business Unit's numbers here are the sum of its Companies' own targets;
  // Annual Target is always exactly the sum of the four quarters shown, since
  // it's no longer a separately-entered figure.)
  const targetMatrix = businessUnits.map((bu) => {
    const buCompanies = companiesByBu.get(bu.id) || [];

    const quarterTargetsRow = [1, 2, 3, 4].map((q) => {
      let revenue = 0,
        collections = 0,
        expenses = 0;
      for (const c of buCompanies) {
        const t = qTargetByCompanyQuarter.get(`${c.id}:${q}`) || emptyFigures();
        if (isCatAllowed(c.id, "REVENUE")) revenue += revenueTotal(t);
        if (isCatAllowed(c.id, "COLLECTIONS")) collections += collectionsTotal(t);
        if (isCatAllowed(c.id, "EXPENSES")) expenses += expensesTotal(t);
      }
      return { quarter: q, revenue, collections, expenses };
    });
    const annualTarget = {
      revenue: quarterTargetsRow.reduce((sum, q) => sum + q.revenue, 0),
      collections: quarterTargetsRow.reduce((sum, q) => sum + q.collections, 0),
      expenses: quarterTargetsRow.reduce((sum, q) => sum + q.expenses, 0),
    };
    return {
      businessUnitId: bu.id,
      businessUnitName: bu.name,
      quarterTargets: quarterTargetsRow,
      annualTarget,
    };
  });

  // ---------- Operational Grid: Business Unit rows (target vs aggregated actual), each with its Companies nested ----------
  const operationalGrid = businessUnits.map((bu) => {
    const buCompanies = companiesByBu.get(bu.id) || [];

    let annualAgg = emptyFigures();
    let quarterTargetAgg = emptyFigures();
    let quarterActualAgg = emptyFigures();
    let ytdActualAgg = emptyFigures();

    const companyRows = buCompanies.map((c) => {
      const revenueOk = isCatAllowed(c.id, "REVENUE");
      const collectionsOk = isCatAllowed(c.id, "COLLECTIONS");
      const expensesOk = isCatAllowed(c.id, "EXPENSES");

      // The Business-Unit-level headline figures below (annualTarget/
      // quarterTarget/quarterActual/ytdActual) have always been revenue-only
      // (see revenueTotal() calls further down), so gating a Company's
      // contribution to these aggregates on REVENUE view alone is correct
      // and sufficient — Collections/Expenses are never read from them.
      if (revenueOk) annualAgg = addFigures(annualAgg, annualByCompany.get(c.id) || emptyFigures());

      let qt = emptyFigures();
      let qa = emptyFigures();
      for (const q of quartersInScope) {
        qt = addFigures(qt, qTargetByCompanyQuarter.get(`${c.id}:${q}`) || emptyFigures());
        qa = addFigures(qa, qActualByCompanyQuarter.get(`${c.id}:${q}`) || emptyFigures());
      }
      if (revenueOk) {
        quarterTargetAgg = addFigures(quarterTargetAgg, qt);
        quarterActualAgg = addFigures(quarterActualAgg, qa);
      }

      let ytdActualCompany = emptyFigures();
      for (let q = 1; q <= quarter; q++) {
        const a = qActualByCompanyQuarter.get(`${c.id}:${q}`) || emptyFigures();
        ytdActualCompany = addFigures(ytdActualCompany, a);
      }
      if (revenueOk) ytdActualAgg = addFigures(ytdActualAgg, ytdActualCompany);

      const remarks = !isAllQuarters ? remarksByCompanyQuarter.get(`${c.id}:${quarter}`) : undefined;

      return {
        companyId: c.id,
        companyName: c.name,
        quarterActual: {
          internal: revenueOk ? qa.revenueInternal : 0,
          external: revenueOk ? qa.revenueExternal : 0,
          total: revenueOk ? revenueTotal(qa) : 0,
          collectionsInternal: collectionsOk ? qa.collectionsInternal : 0,
          collectionsExternal: collectionsOk ? qa.collectionsExternal : 0,
          expensesInternal: expensesOk ? qa.expensesInternal : 0,
          expensesExternal: expensesOk ? qa.expensesExternal : 0,
        },
        ytdActual: revenueOk ? revenueTotal(ytdActualCompany) : 0,
        // Remarks are logged per single quarter, so they're only meaningful
        // (and only shown) when a specific quarter is selected, not "all" —
        // and, same as the figures above, each category's remarks are only
        // included if that category is view-permitted for this Company.
        revenueRemarks: revenueOk && remarks ? remarks.revenueRemarks : "",
        collectionsRemarks: collectionsOk && remarks ? remarks.collectionsRemarks : "",
        expensesRemarks: expensesOk && remarks ? remarks.expensesRemarks : "",
      };
    });

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
      companies: companyRows,
    };
  });

  res.json({
    scope: { yearId, quarter, allQuarters: isAllQuarters, businessUnitId: businessUnitId || null, companyId: companyId || null },
    kpis,
    chart,
    targetMatrix,
    operationalGrid,
  });
});

export default router;
