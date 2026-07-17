import { Router } from "express";
import { prisma } from "../lib/prisma";
import {
  assertBusinessUnitAccess,
  blockPendingPasswordChange,
  requireAuth,
  resolveCompanyBusinessUnit,
  scopedBusinessUnitFilter,
} from "../middleware/auth";
import { addFigures, emptyFigures, Figures, pct, revenueTotal, toFigures } from "../utils/aggregate";

const router = Router();
router.use(requireAuth);
router.use(blockPendingPasswordChange);

/**
 * GET /api/dashboard
 * Query params: yearId (required), quarter (1-4, default 4 = full year to date),
 *               businessUnitId (optional scope), companyId (optional drill-down)
 *
 * Annual/Quarter Targets belong to a Business Unit (not a Company). Quarter
 * Actuals are recognized per Company and summed up to compare against their
 * parent Business Unit's target. Drilling down to a single companyId still
 * shows that company's own actuals against its *whole* Business Unit's
 * target (not a per-company slice of it) — there is no such thing as a
 * per-company target in this model.
 */
router.get("/", async (req, res) => {
  const user = req.user!;
  const { yearId, businessUnitId, companyId } = req.query as Record<string, string | undefined>;
  const quarter = req.query.quarter ? Number(req.query.quarter) : 4;

  if (!yearId) return res.status(400).json({ error: "yearId is required" });
  if (quarter < 1 || quarter > 4) return res.status(400).json({ error: "quarter must be 1-4" });

  // Resolve the Business Unit scope (whose targets matter) and the Company
  // scope (whose actuals get summed) for this request.
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
      scope: { yearId, quarter, businessUnitId: businessUnitId || null, companyId: companyId || null },
      kpis: { annualTarget: 0, quarterTarget: 0, quarterActual: 0, ytdTarget: 0, ytdActual: 0, attainmentPct: 0, ytdAttainmentPct: 0 },
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

  const [annualTargets, quarterTargets, quarterActuals] = await Promise.all([
    prisma.annualTarget.findMany({ where: { yearId, businessUnitId: { in: businessUnitIds } } }),
    prisma.quarterTarget.findMany({ where: { yearId, businessUnitId: { in: businessUnitIds } } }),
    companyIds.length ? prisma.quarterActual.findMany({ where: { yearId, companyId: { in: companyIds } } }) : [],
  ]);

  const annualByBu = new Map(annualTargets.map((t) => [t.businessUnitId, toFigures(t)]));
  const qTargetByBuQuarter = new Map<string, Figures>();
  for (const t of quarterTargets) qTargetByBuQuarter.set(`${t.businessUnitId}:${t.quarter}`, toFigures(t));

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

  // ---------- Chart: quarterly revenue vs target across Q1-Q4 for the whole scope ----------
  const chart = [1, 2, 3, 4].map((q) => {
    let targetInternal = 0,
      targetExternal = 0,
      actualInternal = 0,
      actualExternal = 0;
    for (const buId of businessUnitIds) {
      const t = qTargetByBuQuarter.get(`${buId}:${q}`);
      if (t) {
        targetInternal += t.revenueInternal;
        targetExternal += t.revenueExternal;
      }
    }
    for (const cid of companyIds) {
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

  // ---------- KPIs ----------
  let annualTargetTotal = 0;
  let quarterTargetTotal = 0;
  let ytdTargetTotal = 0;
  for (const buId of businessUnitIds) {
    const annual = annualByBu.get(buId) || emptyFigures();
    annualTargetTotal += revenueTotal(annual);

    const qt = qTargetByBuQuarter.get(`${buId}:${quarter}`) || emptyFigures();
    quarterTargetTotal += revenueTotal(qt);

    for (let q = 1; q <= quarter; q++) {
      const t = qTargetByBuQuarter.get(`${buId}:${q}`) || emptyFigures();
      ytdTargetTotal += revenueTotal(t);
    }
  }

  let quarterActualTotal = 0;
  let ytdActualTotal = 0;
  for (const cid of companyIds) {
    const qa = qActualByCompanyQuarter.get(`${cid}:${quarter}`) || emptyFigures();
    quarterActualTotal += revenueTotal(qa);

    for (let q = 1; q <= quarter; q++) {
      const a = qActualByCompanyQuarter.get(`${cid}:${q}`) || emptyFigures();
      ytdActualTotal += revenueTotal(a);
    }
  }

  const kpis = {
    annualTarget: annualTargetTotal,
    quarterTarget: quarterTargetTotal,
    quarterActual: quarterActualTotal,
    ytdTarget: ytdTargetTotal,
    ytdActual: ytdActualTotal,
    attainmentPct: pct(quarterActualTotal, quarterTargetTotal),
    ytdAttainmentPct: pct(ytdActualTotal, ytdTargetTotal),
  };

  // ---------- Target Distribution Matrix: Annual vs each Quarter Target, per Business Unit ----------
  const targetMatrix = businessUnits.map((bu) => {
    const annual = annualByBu.get(bu.id) || emptyFigures();
    const quarterTargetsRow = [1, 2, 3, 4].map((q) => {
      const t = qTargetByBuQuarter.get(`${bu.id}:${q}`) || emptyFigures();
      return { quarter: q, revenueInternal: t.revenueInternal, revenueExternal: t.revenueExternal, total: revenueTotal(t) };
    });
    const distributedTotal = quarterTargetsRow.reduce((sum, q) => sum + q.total, 0);
    return {
      businessUnitId: bu.id,
      businessUnitName: bu.name,
      annualTarget: { revenueInternal: annual.revenueInternal, revenueExternal: annual.revenueExternal, total: revenueTotal(annual) },
      quarterTargets: quarterTargetsRow,
      distributedTotal,
      varianceFromAnnual: revenueTotal(annual) - distributedTotal,
    };
  });

  // ---------- Operational Grid: Business Unit rows (target vs aggregated actual), each with its Companies nested ----------
  const companiesByBu = new Map<string, typeof companies>();
  for (const c of companies) {
    const list = companiesByBu.get(c.businessUnitId) || [];
    list.push(c);
    companiesByBu.set(c.businessUnitId, list);
  }

  const operationalGrid = businessUnits.map((bu) => {
    const annual = annualByBu.get(bu.id) || emptyFigures();
    const qt = qTargetByBuQuarter.get(`${bu.id}:${quarter}`) || emptyFigures();
    const buCompanies = companiesByBu.get(bu.id) || [];

    let quarterActualAgg = emptyFigures();
    let ytdActualAgg = emptyFigures();

    const companyRows = buCompanies.map((c) => {
      const qa = qActualByCompanyQuarter.get(`${c.id}:${quarter}`) || emptyFigures();
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
        ...(remarksByCompanyQuarter.get(`${c.id}:${quarter}`) || {
          revenueRemarks: "",
          collectionsRemarks: "",
          expensesRemarks: "",
        }),
      };
    });

    const annualTotal = revenueTotal(annual);
    const quarterTargetTotalRow = revenueTotal(qt);
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
    scope: { yearId, quarter, businessUnitId: businessUnitId || null, companyId: companyId || null },
    kpis,
    chart,
    targetMatrix,
    operationalGrid,
  });
});

export default router;
