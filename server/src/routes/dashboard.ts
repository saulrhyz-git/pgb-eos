import { Router } from "express";
import { prisma } from "../lib/prisma";
import {
  assertBusinessUnitAccess,
  blockPendingPasswordChange,
  requireAuth,
  resolveCompanyBusinessUnit,
  scopedBusinessUnitFilter,
} from "../middleware/auth";
import { addFigures, collectionsTotal, emptyFigures, expensesTotal, Figures, pct, revenueTotal, toFigures } from "../utils/aggregate";

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

  const businessUnits = await prisma.businessUnit.findMany({ where: buWhere, orderBy: { name: "asc" } });
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

  const companies = await prisma.company.findMany({
    where: companyWhere,
    orderBy: { name: "asc" },
  });
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
  for (const c of companies) {
    const list = companiesByBu.get(c.businessUnitId) || [];
    list.push(c);
    companiesByBu.set(c.businessUnitId, list);
  }

  // ---------- Chart: quarterly revenue vs target across Q1-Q4 for the whole scope ----------
  const chart = [1, 2, 3, 4].map((q) => {
    let targetInternal = 0,
      targetExternal = 0,
      actualInternal = 0,
      actualExternal = 0;
    for (const cid of companyIds) {
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
    annualRevenueTargetTotal += revenueTotal(annual);
    annualCollectionsTargetTotal += collectionsTotal(annual);
    annualExpensesTargetTotal += expensesTotal(annual);

    for (const q of quartersInScope) {
      const qt = qTargetByCompanyQuarter.get(`${cid}:${q}`) || emptyFigures();
      quarterRevenueTargetTotal += revenueTotal(qt);
      quarterCollectionsTargetTotal += collectionsTotal(qt);
      quarterExpensesTargetTotal += expensesTotal(qt);
      const qa = qActualByCompanyQuarter.get(`${cid}:${q}`) || emptyFigures();
      quarterActualTotal += revenueTotal(qa);
    }

    for (let q = 1; q <= quarter; q++) {
      const t = qTargetByCompanyQuarter.get(`${cid}:${q}`) || emptyFigures();
      ytdTargetTotal += revenueTotal(t);
      const a = qActualByCompanyQuarter.get(`${cid}:${q}`) || emptyFigures();
      ytdActualTotal += revenueTotal(a);
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
      let t = emptyFigures();
      for (const c of buCompanies) t = addFigures(t, qTargetByCompanyQuarter.get(`${c.id}:${q}`) || emptyFigures());
      return {
        quarter: q,
        revenue: revenueTotal(t),
        collections: collectionsTotal(t),
        expenses: expensesTotal(t),
      };
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
      annualAgg = addFigures(annualAgg, annualByCompany.get(c.id) || emptyFigures());

      let qt = emptyFigures();
      let qa = emptyFigures();
      for (const q of quartersInScope) {
        qt = addFigures(qt, qTargetByCompanyQuarter.get(`${c.id}:${q}`) || emptyFigures());
        qa = addFigures(qa, qActualByCompanyQuarter.get(`${c.id}:${q}`) || emptyFigures());
      }
      quarterTargetAgg = addFigures(quarterTargetAgg, qt);
      quarterActualAgg = addFigures(quarterActualAgg, qa);

      let ytdActualCompany = emptyFigures();
      for (let q = 1; q <= quarter; q++) {
        const a = qActualByCompanyQuarter.get(`${c.id}:${q}`) || emptyFigures();
        ytdActualCompany = addFigures(ytdActualCompany, a);
      }
      ytdActualAgg = addFigures(ytdActualAgg, ytdActualCompany);

      return {
        companyId: c.id,
        companyName: c.name,
        quarterActual: {
          internal: qa.revenueInternal,
          external: qa.revenueExternal,
          total: revenueTotal(qa),
          collectionsInternal: qa.collectionsInternal,
          collectionsExternal: qa.collectionsExternal,
          expensesInternal: qa.expensesInternal,
          expensesExternal: qa.expensesExternal,
        },
        ytdActual: revenueTotal(ytdActualCompany),
        // Remarks are logged per single quarter, so they're only meaningful
        // (and only shown) when a specific quarter is selected, not "all".
        ...(!isAllQuarters && remarksByCompanyQuarter.get(`${c.id}:${quarter}`)
          ? remarksByCompanyQuarter.get(`${c.id}:${quarter}`)!
          : { revenueRemarks: "", collectionsRemarks: "", expensesRemarks: "" }),
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
