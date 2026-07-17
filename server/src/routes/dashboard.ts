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
 * Aggregates Company-level Annual/Quarter Targets and Quarter Actuals up to
 * BU level (all companies in the BU) or Group level (all BUs) on the fly.
 */
router.get("/", async (req, res) => {
  const user = req.user!;
  const { yearId, businessUnitId, companyId } = req.query as Record<string, string | undefined>;
  const quarter = req.query.quarter ? Number(req.query.quarter) : 4;

  if (!yearId) return res.status(400).json({ error: "yearId is required" });
  if (quarter < 1 || quarter > 4) return res.status(400).json({ error: "quarter must be 1-4" });

  // Resolve the set of companies in scope.
  const companyWhere: any = {};
  try {
    if (companyId) {
      const buId = await resolveCompanyBusinessUnit(companyId);
      assertBusinessUnitAccess(user, buId);
      companyWhere.id = companyId;
    } else {
      const buFilter = scopedBusinessUnitFilter(user, businessUnitId);
      if (buFilter) companyWhere.businessUnitId = buFilter;
    }
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  const companies = await prisma.company.findMany({
    where: companyWhere,
    include: { businessUnit: { select: { id: true, name: true } } },
    orderBy: { name: "asc" },
  });
  const companyIds = companies.map((c) => c.id);

  if (companyIds.length === 0) {
    return res.json({
      scope: { yearId, quarter, businessUnitId: businessUnitId || null, companyId: companyId || null },
      kpis: { annualTarget: 0, quarterTarget: 0, quarterActual: 0, ytdTarget: 0, ytdActual: 0, attainmentPct: 0, ytdAttainmentPct: 0 },
      chart: [],
      targetMatrix: [],
      operationalGrid: [],
    });
  }

  const [annualTargets, quarterTargets, quarterActuals] = await Promise.all([
    prisma.annualTarget.findMany({ where: { yearId, companyId: { in: companyIds } } }),
    prisma.quarterTarget.findMany({ where: { yearId, companyId: { in: companyIds } } }),
    prisma.quarterActual.findMany({ where: { yearId, companyId: { in: companyIds } } }),
  ]);

  const annualByCompany = new Map(annualTargets.map((t) => [t.companyId, toFigures(t)]));
  const qTargetByCompanyQuarter = new Map<string, Figures>();
  for (const t of quarterTargets) qTargetByCompanyQuarter.set(`${t.companyId}:${t.quarter}`, toFigures(t));
  const qActualByCompanyQuarter = new Map<string, Figures>();
  const remarksByCompanyQuarter = new Map<string, string>();
  for (const a of quarterActuals) {
    qActualByCompanyQuarter.set(`${a.companyId}:${a.quarter}`, toFigures(a));
    remarksByCompanyQuarter.set(`${a.companyId}:${a.quarter}`, a.remarks);
  }

  // ---------- Chart: quarterly revenue vs target across Q1-Q4 for the whole scope ----------
  const chart = [1, 2, 3, 4].map((q) => {
    let targetInternal = 0,
      targetExternal = 0,
      actualInternal = 0,
      actualExternal = 0;
    for (const cid of companyIds) {
      const t = qTargetByCompanyQuarter.get(`${cid}:${q}`);
      const a = qActualByCompanyQuarter.get(`${cid}:${q}`);
      if (t) {
        targetInternal += t.revenueInternal;
        targetExternal += t.revenueExternal;
      }
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
  let quarterActualTotal = 0;
  let ytdTargetTotal = 0;
  let ytdActualTotal = 0;

  for (const cid of companyIds) {
    const annual = annualByCompany.get(cid) || emptyFigures();
    annualTargetTotal += revenueTotal(annual);

    const qt = qTargetByCompanyQuarter.get(`${cid}:${quarter}`) || emptyFigures();
    quarterTargetTotal += revenueTotal(qt);
    const qa = qActualByCompanyQuarter.get(`${cid}:${quarter}`) || emptyFigures();
    quarterActualTotal += revenueTotal(qa);

    for (let q = 1; q <= quarter; q++) {
      const t = qTargetByCompanyQuarter.get(`${cid}:${q}`) || emptyFigures();
      ytdTargetTotal += revenueTotal(t);
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

  // ---------- Target Distribution Matrix: Annual vs each Quarter Target, per company ----------
  const targetMatrix = companies.map((c) => {
    const annual = annualByCompany.get(c.id) || emptyFigures();
    const quarterTargetsRow = [1, 2, 3, 4].map((q) => {
      const t = qTargetByCompanyQuarter.get(`${c.id}:${q}`) || emptyFigures();
      return { quarter: q, revenueInternal: t.revenueInternal, revenueExternal: t.revenueExternal, total: revenueTotal(t) };
    });
    const distributedTotal = quarterTargetsRow.reduce((sum, q) => sum + q.total, 0);
    return {
      companyId: c.id,
      companyName: c.name,
      businessUnitId: c.businessUnitId,
      businessUnitName: c.businessUnit.name,
      annualTarget: { revenueInternal: annual.revenueInternal, revenueExternal: annual.revenueExternal, total: revenueTotal(annual) },
      quarterTargets: quarterTargetsRow,
      distributedTotal,
      varianceFromAnnual: revenueTotal(annual) - distributedTotal,
    };
  });

  // ---------- Operational Grid: core company-level table ----------
  const operationalGrid = companies.map((c) => {
    const annual = annualByCompany.get(c.id) || emptyFigures();
    const qt = qTargetByCompanyQuarter.get(`${c.id}:${quarter}`) || emptyFigures();
    const qa = qActualByCompanyQuarter.get(`${c.id}:${quarter}`) || emptyFigures();

    let ytdActual = emptyFigures();
    for (let q = 1; q <= quarter; q++) {
      const a = qActualByCompanyQuarter.get(`${c.id}:${q}`) || emptyFigures();
      ytdActual = addFigures(ytdActual, a);
    }

    const annualTotal = revenueTotal(annual);
    const quarterTargetTotalRow = revenueTotal(qt);
    const quarterActualTotalRow = revenueTotal(qa);
    const ytdActualTotalRow = revenueTotal(ytdActual);

    return {
      companyId: c.id,
      companyName: c.name,
      businessUnitId: c.businessUnitId,
      businessUnitName: c.businessUnit.name,
      annualTarget: annualTotal,
      quarterTarget: quarterTargetTotalRow,
      quarterActual: {
        internal: qa.revenueInternal,
        external: qa.revenueExternal,
        total: quarterActualTotalRow,
        collectionsInternal: qa.collectionsInternal,
        collectionsExternal: qa.collectionsExternal,
        expensesInternal: qa.expensesInternal,
        expensesExternal: qa.expensesExternal,
      },
      quarterAttainmentPct: pct(quarterActualTotalRow, quarterTargetTotalRow),
      ytdActual: ytdActualTotalRow,
      ytdVsAnnualPct: pct(ytdActualTotalRow, annualTotal),
      remarks: remarksByCompanyQuarter.get(`${c.id}:${quarter}`) || "",
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
