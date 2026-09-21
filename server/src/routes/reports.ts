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
import { assertPermission, can, canAnyOf, FINANCIAL_RESOURCES, narrowingApplies } from "../utils/permissions";
import { addFigures, emptyFigures, Figures, expensesTotal, collectionsTotal, revenueTotal, pct, toFigures } from "../utils/aggregate";
import { escalateStaleRocks } from "../utils/rockAutoStatus";

/**
 * The Reports engine: a filterable, exportable view over the same
 * Targets/Actuals and Rocks data every other page already shows, re-shaped
 * into flat, generically-columned tables suited to spreadsheet/PDF export
 * (see client/src/pages/Reports.tsx). Three report types today — Financial
 * Performance (Target vs Actual per Company), Rocks (the full filtered Rock
 * list), and Executive Summary (a per-Business-Unit rollup of both) — each
 * returns the same { title, scope, columns, rows } shape so the frontend can
 * render/export any of them with one generic table + CSV/print renderer
 * instead of bespoke UI per report.
 *
 * Access gate: Superadmins and Group Integrators can always open Reports
 * (matching Executive Scorecard's default access level). A BU Integrator (or
 * blank-role user) needs a Custom Role that explicitly grants REPORTS view.
 * This is a coarse "can they open the page" check; once inside, the actual
 * rows returned are still masked per the existing REVENUE/COLLECTIONS/
 * EXPENSES/ROCKS grants exactly like everywhere else in the app (dashboard,
 * Scorecard, Rocks) — Reports is a different *shape* on the same data, never
 * a way to see more of it than a Custom Role otherwise allows.
 */
const router = Router();
router.use(requireAuth);
router.use(blockPendingPasswordChange);

router.use(async (req, res, next) => {
  const user = req.user!;
  if (user.role === "SUPERADMIN" || user.role === "GROUP_INTEGRATOR") return next();
  const permRows = await loadUserPermissions(user);
  if (permRows.some((r) => r.resource === "REPORTS" && r.canView)) return next();
  return res.status(403).json({ error: "You don't have access to the Reports engine" });
});

interface ReportColumn {
  key: string;
  label: string;
  // "number" columns are right-aligned and formatted with thousands
  // separators (and, for *Pct columns, a trailing %) by the frontend; "text"
  // columns are left-aligned as-is. Kept out of the row values themselves so
  // the same generic renderer works for every report type.
  type: "text" | "number";
}

interface ReportResult {
  title: string;
  scope: Record<string, string | number | null>;
  columns: ReportColumn[];
  rows: Record<string, string | number>[];
}

function financialColumns(): ReportColumn[] {
  return [
    { key: "businessUnitName", label: "Business Unit", type: "text" },
    { key: "companyName", label: "Company", type: "text" },
    { key: "period", label: "Period", type: "text" },
    { key: "revenueTarget", label: "Revenue Target", type: "number" },
    { key: "revenueActual", label: "Revenue Actual", type: "number" },
    { key: "revenueAttainmentPct", label: "Revenue Attainment %", type: "number" },
    { key: "collectionsTarget", label: "Collections Target", type: "number" },
    { key: "collectionsActual", label: "Collections Actual", type: "number" },
    { key: "collectionsAttainmentPct", label: "Collections Attainment %", type: "number" },
    { key: "expensesTarget", label: "Expenses Target", type: "number" },
    { key: "expensesActual", label: "Expenses Actual", type: "number" },
    { key: "expensesAttainmentPct", label: "Expenses Attainment %", type: "number" },
  ];
}

/**
 * GET /api/reports/financial
 * Query params: yearId (required), quarter (1-4, or "all"/omitted for the
 * full year's sum), businessUnitId, companyId (both optional drill-downs).
 * One row per Company in scope, figures summed across whichever quarter(s)
 * are in scope (same "Annual = sum of Q1-Q4" rule used everywhere else).
 */
router.get("/financial", async (req, res) => {
  const user = req.user!;
  const { yearId, businessUnitId, companyId } = req.query as Record<string, string | undefined>;
  const quarterParam = req.query.quarter as string | undefined;
  const isAllQuarters = quarterParam === "all" || quarterParam === undefined;
  const quarter = isAllQuarters ? 0 : Number(quarterParam);

  if (!yearId) return res.status(400).json({ error: "yearId is required" });
  if (!isAllQuarters && (quarter < 1 || quarter > 4)) {
    return res.status(400).json({ error: 'quarter must be 1-4 or "all"' });
  }

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

  const permRows = await loadUserPermissions(user);
  const financialRoleActive = narrowingApplies(Boolean(user.role), permRows, FINANCIAL_RESOURCES);

  let companies = await prisma.company.findMany({
    where: companyWhere,
    include: { businessUnit: { select: { name: true } } },
    orderBy: [{ businessUnit: { name: "asc" } }, { name: "asc" }],
  });
  if (financialRoleActive) {
    companies = companies.filter((c) =>
      canAnyOf(permRows, "view", FINANCIAL_RESOURCES, { businessUnitId: c.businessUnitId, companyId: c.id })
    );
  }

  function isCatAllowed(c: { businessUnitId: string; id: string }, resource: "REVENUE" | "COLLECTIONS" | "EXPENSES") {
    if (!financialRoleActive) return true;
    return can(permRows, "view", resource, { businessUnitId: c.businessUnitId, companyId: c.id });
  }

  const companyIds = companies.map((c) => c.id);
  const [targets, actuals] = await Promise.all([
    companyIds.length ? prisma.quarterTarget.findMany({ where: { yearId, companyId: { in: companyIds } } }) : [],
    companyIds.length ? prisma.quarterActual.findMany({ where: { yearId, companyId: { in: companyIds } } }) : [],
  ]);
  const targetByCq = new Map<string, Figures>();
  for (const t of targets) targetByCq.set(`${t.companyId}:${t.quarter}`, toFigures(t));
  const actualByCq = new Map<string, Figures>();
  for (const a of actuals) actualByCq.set(`${a.companyId}:${a.quarter}`, toFigures(a));

  const quartersInScope = isAllQuarters ? [1, 2, 3, 4] : [quarter];
  const periodLabel = isAllQuarters ? "Annual" : `Q${quarter}`;

  const rows = companies.map((c) => {
    let target = emptyFigures();
    let actual = emptyFigures();
    for (const q of quartersInScope) {
      target = addFigures(target, targetByCq.get(`${c.id}:${q}`) || emptyFigures());
      actual = addFigures(actual, actualByCq.get(`${c.id}:${q}`) || emptyFigures());
    }
    const revenueOk = isCatAllowed(c, "REVENUE");
    const collectionsOk = isCatAllowed(c, "COLLECTIONS");
    const expensesOk = isCatAllowed(c, "EXPENSES");
    const revenueTargetV = revenueOk ? revenueTotal(target) : 0;
    const revenueActualV = revenueOk ? revenueTotal(actual) : 0;
    const collectionsTargetV = collectionsOk ? collectionsTotal(target) : 0;
    const collectionsActualV = collectionsOk ? collectionsTotal(actual) : 0;
    const expensesTargetV = expensesOk ? expensesTotal(target) : 0;
    const expensesActualV = expensesOk ? expensesTotal(actual) : 0;
    return {
      businessUnitName: c.businessUnit.name,
      companyName: c.name,
      period: periodLabel,
      revenueTarget: revenueTargetV,
      revenueActual: revenueActualV,
      revenueAttainmentPct: pct(revenueActualV, revenueTargetV),
      collectionsTarget: collectionsTargetV,
      collectionsActual: collectionsActualV,
      collectionsAttainmentPct: pct(collectionsActualV, collectionsTargetV),
      expensesTarget: expensesTargetV,
      expensesActual: expensesActualV,
      expensesAttainmentPct: pct(expensesActualV, expensesTargetV),
    };
  });

  const result: ReportResult = {
    title: "Financial Performance Report",
    scope: {
      yearId,
      period: periodLabel,
      businessUnitId: businessUnitId || null,
      companyId: companyId || null,
    },
    columns: financialColumns(),
    rows,
  };
  res.json(result);
});

function rocksColumns(): ReportColumn[] {
  return [
    { key: "businessUnitName", label: "Business Unit", type: "text" },
    { key: "companyName", label: "Company", type: "text" },
    { key: "period", label: "Quarter", type: "text" },
    { key: "title", label: "Rock", type: "text" },
    { key: "businessGoalName", label: "Business Goal", type: "text" },
    { key: "ownerName", label: "Owner", type: "text" },
    { key: "status", label: "Status", type: "text" },
    { key: "progressPct", label: "Progress %", type: "number" },
    { key: "remarks", label: "Remarks", type: "text" },
  ];
}

const ROCK_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  ON_TRACK: "On Track",
  AT_RISK: "At Risk",
  TARGET_MET: "Target Met",
};

/**
 * GET /api/reports/rocks
 * Query params: yearId (required), quarter (1-4, optional — omitted means
 * every quarter), businessUnitId, companyId, businessGoalId, status (all
 * optional). One row per Rock, same scoping/masking rules as GET /api/rocks.
 */
router.get("/rocks", async (req, res) => {
  const user = req.user!;
  const { yearId, quarter, businessUnitId, companyId, businessGoalId, status } = req.query as Record<
    string,
    string | undefined
  >;
  if (!yearId) return res.status(400).json({ error: "yearId is required" });

  const permRows = await loadUserPermissions(user);

  try {
    if (companyId) {
      const buId = await resolveCompanyBusinessUnit(companyId);
      assertBusinessUnitAccess(user, buId);
      if (narrowingApplies(Boolean(user.role), permRows, ["ROCKS"])) assertPermission(permRows, "view", "ROCKS", { businessUnitId: buId, companyId });
    }
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  const where: any = { yearId };
  if (businessGoalId) where.businessGoalId = businessGoalId;
  if (quarter) where.quarter = Number(quarter);
  if (status) where.status = status;

  if (companyId) {
    where.companyId = companyId;
  } else {
    let buFilter: string | { in: string[] } | undefined;
    try {
      buFilter = scopedBusinessUnitFilter(user, businessUnitId);
    } catch (err: any) {
      return res.status(err.status || 500).json({ error: err.message });
    }

    if (narrowingApplies(Boolean(user.role), permRows, ["ROCKS"])) {
      const companyWhere: any = {};
      if (buFilter) companyWhere.businessUnitId = buFilter;
      const candidates = await prisma.company.findMany({ where: companyWhere, select: { id: true, businessUnitId: true } });
      const permittedIds = candidates
        .filter((c) => can(permRows, "view", "ROCKS", { businessUnitId: c.businessUnitId, companyId: c.id }))
        .map((c) => c.id);
      where.companyId = { in: permittedIds };
    } else if (buFilter) {
      where.company = { businessUnitId: buFilter };
    }
  }

  // Same auto-escalation every other Rocks read does (see utils/rockAutoStatus.ts).
  await escalateStaleRocks({ ...where });

  const rocks = await prisma.rock.findMany({
    where,
    include: {
      company: { select: { name: true, businessUnit: { select: { name: true } } } },
      businessGoal: { select: { name: true } },
    },
    orderBy: [{ quarter: "asc" }, { createdAt: "asc" }],
  });

  const rows = rocks.map((r) => ({
    businessUnitName: r.company.businessUnit.name,
    companyName: r.company.name,
    period: `Q${r.quarter}`,
    title: r.title,
    businessGoalName: r.businessGoal?.name || "",
    ownerName: r.ownerName || "",
    status: ROCK_STATUS_LABELS[r.status] || r.status,
    progressPct: r.progressPct,
    remarks: r.remarks || "",
  }));

  const result: ReportResult = {
    title: "Rocks Report",
    scope: {
      yearId,
      period: quarter ? `Q${quarter}` : "All Quarters",
      businessUnitId: businessUnitId || null,
      companyId: companyId || null,
      businessGoalId: businessGoalId || null,
      status: status || null,
    },
    columns: rocksColumns(),
    rows,
  };
  res.json(result);
});

function executiveSummaryColumns(): ReportColumn[] {
  return [
    { key: "businessUnitName", label: "Business Unit", type: "text" },
    { key: "revenueTarget", label: "Revenue Target", type: "number" },
    { key: "revenueActual", label: "Revenue Actual", type: "number" },
    { key: "revenueAttainmentPct", label: "Revenue Attainment %", type: "number" },
    { key: "rocksTotal", label: "Total Rocks", type: "number" },
    { key: "rocksTargetMet", label: "Target Met", type: "number" },
    { key: "rocksOnTrack", label: "On Track", type: "number" },
    { key: "rocksAtRiskPending", label: "At Risk / Pending", type: "number" },
    { key: "rocksAvgProgressPct", label: "Avg Progress %", type: "number" },
  ];
}

/**
 * GET /api/reports/executive-summary
 * Query params: yearId (required), quarter (1-4, or "all"/omitted for the
 * full year), businessUnitId (optional drill-down; no Company-level
 * drill-down, same as the Executive Scorecard this mirrors). One row per
 * Business Unit, combining Revenue attainment and Rocks completion.
 */
router.get("/executive-summary", async (req, res) => {
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
  const financialRoleActive = narrowingApplies(Boolean(user.role), permRows, FINANCIAL_RESOURCES);
  const rocksRoleActive = narrowingApplies(Boolean(user.role), permRows, ["ROCKS"]);

  let businessUnits = await prisma.businessUnit.findMany({ where: buWhere, orderBy: { name: "asc" } });
  const companies = await prisma.company.findMany({ where: companyWhere, orderBy: { name: "asc" } });

  let revenueCompanies = companies;
  if (financialRoleActive) {
    revenueCompanies = companies.filter((c) =>
      canAnyOf(permRows, "view", FINANCIAL_RESOURCES, { businessUnitId: c.businessUnitId, companyId: c.id })
    );
  }
  let rockCompanies = companies;
  if (rocksRoleActive) {
    rockCompanies = companies.filter((c) => can(permRows, "view", "ROCKS", { businessUnitId: c.businessUnitId, companyId: c.id }));
  }

  if (financialRoleActive || rocksRoleActive) {
    const permittedBuIds = new Set<string>();
    for (const c of revenueCompanies) permittedBuIds.add(c.businessUnitId);
    for (const c of rockCompanies) permittedBuIds.add(c.businessUnitId);
    for (const bu of businessUnits) {
      if (financialRoleActive && canAnyOf(permRows, "view", FINANCIAL_RESOURCES, { businessUnitId: bu.id })) permittedBuIds.add(bu.id);
      if (rocksRoleActive && can(permRows, "view", "ROCKS", { businessUnitId: bu.id })) permittedBuIds.add(bu.id);
    }
    businessUnits = businessUnits.filter((bu) => permittedBuIds.has(bu.id));
  }

  const revenueCompanyIds = revenueCompanies.map((c) => c.id);
  const rockCompanyIds = rockCompanies.map((c) => c.id);

  const [targets, actuals] = await Promise.all([
    revenueCompanyIds.length ? prisma.quarterTarget.findMany({ where: { yearId, companyId: { in: revenueCompanyIds } } }) : [],
    revenueCompanyIds.length ? prisma.quarterActual.findMany({ where: { yearId, companyId: { in: revenueCompanyIds } } }) : [],
  ]);
  const targetByCq = new Map<string, Figures>();
  for (const t of targets) targetByCq.set(`${t.companyId}:${t.quarter}`, toFigures(t));
  const actualByCq = new Map<string, Figures>();
  for (const a of actuals) actualByCq.set(`${a.companyId}:${a.quarter}`, toFigures(a));

  const revenueCompaniesByBu = new Map<string, typeof revenueCompanies>();
  for (const c of revenueCompanies) {
    const list = revenueCompaniesByBu.get(c.businessUnitId) || [];
    list.push(c);
    revenueCompaniesByBu.set(c.businessUnitId, list);
  }

  if (rockCompanyIds.length) {
    await escalateStaleRocks({ yearId, companyId: { in: rockCompanyIds } });
  }
  const rockWhere: any = { yearId };
  if (!isAllQuarters) rockWhere.quarter = quarter;
  if (rockCompanyIds.length) rockWhere.companyId = { in: rockCompanyIds };
  const rocks = rockCompanyIds.length
    ? await prisma.rock.findMany({
        where: rockWhere,
        select: { status: true, progressPct: true, company: { select: { businessUnitId: true } } },
      })
    : [];
  const rocksByBu = new Map<string, typeof rocks>();
  for (const r of rocks) {
    const list = rocksByBu.get(r.company.businessUnitId) || [];
    list.push(r);
    rocksByBu.set(r.company.businessUnitId, list);
  }

  const rows = businessUnits.map((bu) => {
    const buCompanies = revenueCompaniesByBu.get(bu.id) || [];
    let target = emptyFigures();
    let actual = emptyFigures();
    for (const c of buCompanies) {
      for (const q of quartersInScope) {
        target = addFigures(target, targetByCq.get(`${c.id}:${q}`) || emptyFigures());
        actual = addFigures(actual, actualByCq.get(`${c.id}:${q}`) || emptyFigures());
      }
    }
    const revenueTargetV = revenueTotal(target);
    const revenueActualV = revenueTotal(actual);

    const buRocks = rocksByBu.get(bu.id) || [];
    const rocksTotal = buRocks.length;
    const rocksTargetMet = buRocks.filter((r) => r.status === "TARGET_MET").length;
    const rocksOnTrack = buRocks.filter((r) => r.status === "ON_TRACK").length;
    const rocksAtRiskPending = buRocks.filter((r) => r.status === "AT_RISK" || r.status === "PENDING").length;
    const rocksAvgProgressPct = rocksTotal ? Math.round(buRocks.reduce((sum, r) => sum + r.progressPct, 0) / rocksTotal) : 0;

    return {
      businessUnitName: bu.name,
      revenueTarget: revenueTargetV,
      revenueActual: revenueActualV,
      revenueAttainmentPct: pct(revenueActualV, revenueTargetV),
      rocksTotal,
      rocksTargetMet,
      rocksOnTrack,
      rocksAtRiskPending,
      rocksAvgProgressPct,
    };
  });

  const result: ReportResult = {
    title: "Executive Summary Report",
    scope: {
      yearId,
      period: isAllQuarters ? "All Quarters" : `Q${quarter}`,
      businessUnitId: businessUnitId || null,
    },
    columns: executiveSummaryColumns(),
    rows,
  };
  res.json(result);
});

export default router;
