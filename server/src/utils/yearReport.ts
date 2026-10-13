import { prisma } from "../lib/prisma";
import {
  addFigures,
  collectionsTotal,
  emptyFigures,
  expensesTotal,
  Figures,
  n,
  pct,
  revenueTotal,
  toFigures,
} from "./aggregate";
import { addStreamActuals, addStreamDisbursements, buildStreamBreakdown, StreamBreakdown, STREAM_CATEGORIES } from "./streams";
import { quarterDateRange } from "./quarterDates";

// ---------------------------------------------------------------------------
// The full-year report generated when a Year is wrapped up (routes/years.ts).
//
// Built once, over EVERY Business Unit and Company (no per-user masking —
// only Group Integrators/Superadmins can wrap up or view it), then stored as
// JSON on Year.wrapUpReport so it never changes afterwards, even if names or
// data are edited later. scopeYearReport() narrows a stored report to the
// Business Units a viewer can see, recomputing every total from the parts.
//
// Net Income here is Revenue − Expenses (before tax), same as the
// Scorecard/Financials pages. NIAT isn't included: it depends on per-Company
// tax inputs that aren't stored as part of the Year's data.
// ---------------------------------------------------------------------------

export interface PeriodFigures {
  revenueTarget: number;
  revenueActual: number;
  revenueAttainmentPct: number;
  collectionsTarget: number;
  collectionsActual: number;
  collectionsAttainmentPct: number;
  expensesTarget: number;
  expensesActual: number;
  expensesAttainmentPct: number;
  netIncomeTarget: number;
  netIncomeActual: number;
  disbursementsActual: number;
}

export interface CompanyReport {
  companyId: string;
  companyName: string;
  annual: PeriodFigures;
  quarters: PeriodFigures[]; // index 0 = Q1 … 3 = Q4
}

export interface BusinessUnitReport {
  businessUnitId: string;
  businessUnitName: string;
  annual: PeriodFigures;
  quarters: PeriodFigures[];
  companies: CompanyReport[];
  // Original figures + each labeled Financial Stream, full year. Optional:
  // reports generated before streams existed don't have it.
  streams?: StreamBreakdown[];
}

export interface RockReportItem {
  id: string;
  rolledFromId: string | null;
  businessUnitId: string;
  businessUnitName: string;
  companyName: string;
  quarter: number;
  title: string;
  businessGoalName: string;
  ownerName: string;
  status: string;
  progressPct: number;
  remarks: string;
}

export interface RockSummary {
  total: number;
  targetMet: number;
  onTrack: number;
  atRisk: number;
  pending: number;
  rolledOver: number;
  avgProgressPct: number;
  completionPct: number;
}

export interface YearReport {
  version: 1;
  year: number;
  generatedAt: string;
  generatedBy: { id: string; name: string };
  // Effective deadline per quarter (custom Quarter End Date, else calendar).
  quarterEndDates: string[];
  annual: PeriodFigures;
  quarters: PeriodFigures[];
  businessUnits: BusinessUnitReport[];
  // Group-wide stream breakdown (sum of the BUs' — see mergeStreamBreakdowns).
  streams?: StreamBreakdown[];
  rocks: {
    summary: RockSummary;
    byQuarter: RockSummary[];
    byBusinessUnit: (RockSummary & { businessUnitId: string; businessUnitName: string })[];
    byGoal: (RockSummary & { businessGoalName: string })[];
    items: RockReportItem[];
  };
}

// ---------- financial helpers ----------

function emptyPeriod(): PeriodFigures {
  return finalize({
    revenueTarget: 0,
    revenueActual: 0,
    collectionsTarget: 0,
    collectionsActual: 0,
    expensesTarget: 0,
    expensesActual: 0,
    disbursementsActual: 0,
  });
}

type RawPeriod = Pick<
  PeriodFigures,
  "revenueTarget" | "revenueActual" | "collectionsTarget" | "collectionsActual" | "expensesTarget" | "expensesActual" | "disbursementsActual"
>;

function finalize(r: RawPeriod): PeriodFigures {
  return {
    ...r,
    revenueAttainmentPct: pct(r.revenueActual, r.revenueTarget),
    collectionsAttainmentPct: pct(r.collectionsActual, r.collectionsTarget),
    expensesAttainmentPct: pct(r.expensesActual, r.expensesTarget),
    netIncomeTarget: r.revenueTarget - r.expensesTarget,
    netIncomeActual: r.revenueActual - r.expensesActual,
  };
}

function fromFigures(target: Figures, actual: Figures, disbursements: number): PeriodFigures {
  return finalize({
    revenueTarget: revenueTotal(target),
    revenueActual: revenueTotal(actual),
    collectionsTarget: collectionsTotal(target),
    collectionsActual: collectionsTotal(actual),
    expensesTarget: expensesTotal(target),
    expensesActual: expensesTotal(actual),
    disbursementsActual: disbursements,
  });
}

function addPeriods(a: PeriodFigures, b: PeriodFigures): PeriodFigures {
  return finalize({
    revenueTarget: a.revenueTarget + b.revenueTarget,
    revenueActual: a.revenueActual + b.revenueActual,
    collectionsTarget: a.collectionsTarget + b.collectionsTarget,
    collectionsActual: a.collectionsActual + b.collectionsActual,
    expensesTarget: a.expensesTarget + b.expensesTarget,
    expensesActual: a.expensesActual + b.expensesActual,
    disbursementsActual: a.disbursementsActual + b.disbursementsActual,
  });
}

function sumPeriods(list: PeriodFigures[]): PeriodFigures {
  return list.reduce(addPeriods, emptyPeriod());
}

function sumQuarterArrays(lists: PeriodFigures[][]): PeriodFigures[] {
  return [0, 1, 2, 3].map((i) => sumPeriods(lists.map((q) => q[i])));
}

// ---------- rock helpers ----------

// Same rule as utils/rockRollover.ts: when both a Rock and its rolled-over
// copy are in the set, only the copy (latest version) counts.
export function summarizeRocks(items: RockReportItem[]): RockSummary {
  const superseded = new Set(items.map((r) => r.rolledFromId).filter(Boolean));
  const counted = items.filter((r) => !superseded.has(r.id));
  const total = counted.length;
  const targetMet = counted.filter((r) => r.status === "TARGET_MET").length;
  return {
    total,
    targetMet,
    onTrack: counted.filter((r) => r.status === "ON_TRACK").length,
    atRisk: counted.filter((r) => r.status === "AT_RISK").length,
    pending: counted.filter((r) => r.status === "PENDING").length,
    rolledOver: counted.filter((r) => r.status === "ROLLED_OVER").length,
    avgProgressPct: total ? Math.round(counted.reduce((s, r) => s + r.progressPct, 0) / total) : 0,
    completionPct: total ? Math.round((targetMet / total) * 1000) / 10 : 0,
  };
}

function rockBreakdowns(items: RockReportItem[], businessUnits: { businessUnitId: string; businessUnitName: string }[]) {
  const goalNames = Array.from(new Set(items.map((r) => r.businessGoalName || "(No Business Goal)"))).sort((a, b) => a.localeCompare(b));
  return {
    summary: summarizeRocks(items),
    byQuarter: [1, 2, 3, 4].map((q) => summarizeRocks(items.filter((r) => r.quarter === q))),
    byBusinessUnit: businessUnits.map((bu) => ({ ...bu, ...summarizeRocks(items.filter((r) => r.businessUnitId === bu.businessUnitId)) })),
    byGoal: goalNames.map((g) => ({
      businessGoalName: g,
      ...summarizeRocks(items.filter((r) => (r.businessGoalName || "(No Business Goal)") === g)),
    })),
    items,
  };
}

// ---------- builder ----------

export async function buildYearReport(yearId: string, generatedBy: { id: string; name: string }): Promise<YearReport> {
  const year = await prisma.year.findUniqueOrThrow({ where: { id: yearId } });

  const [businessUnits, targets, actuals, disbursements, rocks] = await Promise.all([
    prisma.businessUnit.findMany({
      include: { companies: { select: { id: true, name: true }, orderBy: { name: "asc" } } },
      orderBy: { name: "asc" },
    }),
    prisma.quarterTarget.findMany({ where: { yearId } }),
    prisma.quarterActual.findMany({ where: { yearId } }),
    prisma.disbursementActual.findMany({ where: { yearId } }),
    prisma.rock.findMany({
      where: { yearId },
      include: {
        company: { select: { name: true, businessUnit: { select: { id: true, name: true } } } },
        businessGoal: { select: { name: true } },
      },
      orderBy: [{ quarter: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  const key = (companyId: string, quarter: number) => `${companyId}:${quarter}`;
  const targetBy = new Map(targets.map((t) => [key(t.companyId, t.quarter), toFigures(t)]));
  const actualBy = new Map(actuals.map((a) => [key(a.companyId, a.quarter), toFigures(a)]));
  const disbAmounts = new Map(disbursements.map((d) => [key(d.companyId, d.quarter), { amount: n(d.amount) }]));
  // Financial Streams add to the original figures (utils/streams.ts).
  const allCompanyIds = businessUnits.flatMap((bu) => bu.companies.map((c) => c.id));
  await addStreamActuals(actualBy, yearId, allCompanyIds);
  await addStreamDisbursements(disbAmounts, yearId, allCompanyIds, () => ({ amount: 0 }));
  const disbBy = new Map([...disbAmounts].map(([k, v]) => [k, v.amount]));

  const buReports: BusinessUnitReport[] = businessUnits.map((bu) => {
    const companies: CompanyReport[] = bu.companies.map((c) => {
      const quarters = [1, 2, 3, 4].map((q) =>
        fromFigures(targetBy.get(key(c.id, q)) || emptyFigures(), actualBy.get(key(c.id, q)) || emptyFigures(), disbBy.get(key(c.id, q)) || 0)
      );
      return { companyId: c.id, companyName: c.name, quarters, annual: sumPeriods(quarters) };
    });
    const quarters = sumQuarterArrays(companies.map((c) => c.quarters));
    return { businessUnitId: bu.id, businessUnitName: bu.name, companies, quarters, annual: sumPeriods(quarters) };
  });

  for (const bu of buReports) {
    const ids = bu.companies.map((c) => c.companyId);
    bu.streams = await buildStreamBreakdown({
      yearId,
      quarters: [1, 2, 3, 4],
      companyIdsByCategory: { REVENUE: ids, COLLECTIONS: ids, EXPENSES: ids, DISBURSEMENTS: ids },
    });
  }

  const quarters = sumQuarterArrays(buReports.map((b) => b.quarters));

  const items: RockReportItem[] = rocks
    .map((r) => ({
      id: r.id,
      rolledFromId: r.rolledFromId,
      businessUnitId: r.company.businessUnit.id,
      businessUnitName: r.company.businessUnit.name,
      companyName: r.company.name,
      quarter: r.quarter,
      title: r.title,
      businessGoalName: r.businessGoal?.name || "",
      ownerName: r.ownerName || "",
      status: r.status,
      progressPct: r.progressPct,
      remarks: r.remarks || "",
    }))
    .sort(
      (a, b) =>
        a.businessUnitName.localeCompare(b.businessUnitName) || a.companyName.localeCompare(b.companyName) || a.quarter - b.quarter
    );

  const quarterEndDates = [1, 2, 3, 4].map((q) => {
    const custom = (year as any)[`q${q}EndDate`] as Date | null;
    return (custom ?? quarterDateRange(year.year, q).end).toISOString();
  });

  return {
    version: 1,
    year: year.year,
    generatedAt: new Date().toISOString(),
    generatedBy,
    quarterEndDates,
    annual: sumPeriods(quarters),
    quarters,
    businessUnits: buReports,
    streams: mergeStreamBreakdowns(buReports.map((b) => b.streams || [])),
    rocks: rockBreakdowns(
      items,
      buReports.map((b) => ({ businessUnitId: b.businessUnitId, businessUnitName: b.businessUnitName }))
    ),
  };
}

// Narrows a stored report to the given Business Units (undefined = all) and
// recomputes every group-level total from what's left.
export function scopeYearReport(report: YearReport, businessUnitIds: string[] | undefined): YearReport {
  if (!businessUnitIds) return report;
  const allowed = new Set(businessUnitIds);
  const businessUnits = report.businessUnits.filter((b) => allowed.has(b.businessUnitId));
  const quarters = sumQuarterArrays(businessUnits.map((b) => b.quarters));
  const items = report.rocks.items.filter((r) => allowed.has(r.businessUnitId));
  return {
    ...report,
    businessUnits,
    quarters,
    annual: sumPeriods(quarters),
    streams: report.streams ? mergeStreamBreakdowns(businessUnits.map((b) => b.streams || [])) : undefined,
    rocks: rockBreakdowns(
      items,
      businessUnits.map((b) => ({ businessUnitId: b.businessUnitId, businessUnitName: b.businessUnitName }))
    ),
  };
}

// Adds several stream breakdowns together line by line (same stream id, or
// the original figures). Used to build the group-wide view from the BUs.
export function mergeStreamBreakdowns(list: StreamBreakdown[][]): StreamBreakdown[] {
  return STREAM_CATEGORIES.map((category) => {
    const lines = new Map<string, StreamBreakdown["lines"][number]>();
    for (const breakdowns of list) {
      const b = breakdowns.find((x) => x.category === category);
      if (!b) continue;
      for (const l of b.lines) {
        const k = l.streamId ?? "__base__";
        const cur = lines.get(k);
        if (!cur) {
          lines.set(k, { ...l, parts: { ...l.parts } });
          continue;
        }
        for (const [f, v] of Object.entries(l.parts)) cur.parts[f] = (cur.parts[f] || 0) + v;
        cur.total += l.total;
      }
    }
    const all = [...lines.values()];
    const base = all.filter((l) => l.streamId === null);
    const rest = all.filter((l) => l.streamId !== null);
    const ordered = [...base, ...rest];
    return { category, total: ordered.reduce((sum, l) => sum + l.total, 0), lines: ordered };
  });
}
