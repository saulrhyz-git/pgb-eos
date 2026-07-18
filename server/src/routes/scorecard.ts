import { Router } from "express";
import { prisma } from "../lib/prisma";
import { blockPendingPasswordChange, loadUserPermissions, requireAuth, scopedBusinessUnitFilter } from "../middleware/auth";
import { can, canAnyOf, FINANCIAL_RESOURCES } from "../utils/permissions";
import { addFigures, collectionsTotal, emptyFigures, expensesTotal, Figures, pct, revenueTotal, toFigures } from "../utils/aggregate";

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
 * audience instead of the row-by-row Operational Grid / Rocks table.
 */
router.get("/", async (req, res) => {
  const user = req.user!;
  const { yearId, businessUnitId } = req.query as Record<string, string | undefined>;
  const quarterParam = req.query.quarter as string | undefined;
  const isAllQuarters = quarterParam === "all" || quarterParam === undefined;
  const quarter = isAllQuarters ? 4 : Number(quarterParam);
  const quartersInScope = isAllQuarters ? [1, 2, 3, 4] : [quarter];

  if (!yearId) return res.status(400).json({ error: "yearId is required" });
  if (!isAllQuarters && (quarter < 1 || quarter > 4)) {
    return res.status(400).json({ error: 'quarter must be 1-4 or "all"' });
  }

  const buWhere: any = {};
  const companyWhere: any = {};
  try {
    const buFilter = scopedBusinessUnitFilter(user, businessUnitId);
    if (buFilter) {
      buWhere.id = buFilter;
      companyWhere.businessUnitId = buFilter;
    }
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  const permRows = await loadUserPermissions(user);

  let businessUnits = await prisma.businessUnit.findMany({ where: buWhere, orderBy: { name: "asc" } });
  let companies = await prisma.company.findMany({ where: companyWhere, orderBy: { name: "asc" } });

  // Same "hide entirely if no view grant at all" narrowing dashboard.ts does
  // for financial data, applied twice here — once for the Revenue section
  // (FINANCIAL_RESOURCES) and once for the Rocks section (ROCKS) below,
  // since a role could grant one without the other (e.g. a board member who
  // should see Rocks status but not raw financials).
  let revenueCompanies = companies;
  let revenueBusinessUnits = businessUnits;
  let rockCompanies = companies;
  let rockBusinessUnits = businessUnits;

  if (permRows.length) {
    revenueCompanies = companies.filter((c) =>
      canAnyOf(permRows, "view", FINANCIAL_RESOURCES, { businessUnitId: c.businessUnitId, companyId: c.id })
    );
    const permittedRevenueBuIds = new Set(revenueCompanies.map((c) => c.businessUnitId));
    for (const bu of businessUnits) {
      if (canAnyOf(permRows, "view", FINANCIAL_RESOURCES, { businessUnitId: bu.id })) permittedRevenueBuIds.add(bu.id);
    }
    revenueBusinessUnits = businessUnits.filter((bu) => permittedRevenueBuIds.has(bu.id));

    rockCompanies = companies.filter((c) => can(permRows, "view", "ROCKS", { businessUnitId: c.businessUnitId, companyId: c.id }));
    const permittedRockBuIds = new Set(rockCompanies.map((c) => c.businessUnitId));
    for (const bu of businessUnits) {
      if (can(permRows, "view", "ROCKS", { businessUnitId: bu.id })) permittedRockBuIds.add(bu.id);
    }
    rockBusinessUnits = businessUnits.filter((bu) => permittedRockBuIds.has(bu.id));
  }

  function isCatAllowed(companyId: string, businessUnitId: string, resource: "REVENUE" | "COLLECTIONS" | "EXPENSES"): boolean {
    if (!permRows.length) return true;
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
      if (isCatAllowed(c.id, c.businessUnitId, "EXPENSES")) quarterExpensesTargetTotal += expensesTotal(qt);
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
      ytdTarget: ytdTargetTotal,
      ytdActual: ytdActualTotal,
      attainmentPct: pct(quarterActualTotal, quarterRevenueTargetTotal),
      ytdAttainmentPct: pct(ytdActualTotal, ytdTargetTotal),
    },
    chart,
    businessUnits: buRows,
  };

  // ---------- Rocks Performance Summary ----------
  const rockCompanyIds = rockCompanies.map((c) => c.id);
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

  res.json({
    scope: { yearId, quarter, allQuarters: isAllQuarters, businessUnitId: businessUnitId || null },
    revenue,
    rocks: rocksSection,
  });
});

export default router;
