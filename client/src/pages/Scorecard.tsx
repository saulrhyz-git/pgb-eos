import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpDown,
  CalendarRange,
  CheckCircle2,
  Gauge,
  HandCoins,
  ListChecks,
  Mountain,
  PhilippinePeso,
  Scale,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import { attainmentColor, formatCurrency, formatCurrencyShort, formatPct, formatProgressPct } from "../utils/format";
import type { BusinessUnit, ScorecardResponse, Year } from "../api/types";

// Same Orange/Blue/Red/Green convention as the Rocks page.
const STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300",
  ON_TRACK: "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300",
  AT_RISK: "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300",
  TARGET_MET: "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300",
};
const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  ON_TRACK: "On Track",
  AT_RISK: "At Risk",
  TARGET_MET: "Target Met",
};

function attainmentBadge(pct: number) {
  if (pct >= 100) return { label: "Ahead of Target", className: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300" };
  if (pct >= 85) return { label: "On Track", className: "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300" };
  return { label: "Behind Target", className: "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300" };
}

function HeadlineCard({
  icon,
  label,
  value,
  fullValue,
  pct,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  // Full, non-abbreviated value shown as a tooltip on hover.
  fullValue?: string;
  pct: number;
}) {
  const badge = attainmentBadge(pct);
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
          {icon}
          <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badge.className}`}>{badge.label}</span>
      </div>
      <div className="text-3xl font-bold text-slate-800 dark:text-slate-100 sm:text-4xl" title={fullValue}>
        {value}
      </div>
      <div className="flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div
            className={`h-full rounded-full ${pct >= 100 ? "bg-emerald-500" : pct >= 85 ? "bg-amber-500" : "bg-red-500"}`}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
        <span className={`text-sm font-semibold ${attainmentColor(pct)}`}>{formatPct(pct)}</span>
      </div>
    </div>
  );
}

// Net Income has no Target to attain against (there's no "Net Income
// Target" concept in the schema), so it can't reuse HeadlineCard's
// attainment-badge/progress-bar framing — instead it's Profit/Loss colored
// (green if Net Income >= 0, red if negative) with a net margin percentage
// (Net Income / Total Revenue) shown underneath in place of a progress bar.
function NetIncomeCard({ netIncome, revenueActual, periodLabel }: { netIncome: number; revenueActual: number; periodLabel: string }) {
  const isProfit = netIncome >= 0;
  const marginPct = revenueActual > 0 ? (netIncome / revenueActual) * 100 : 0;
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
          <Scale className="h-4 w-4" />
          <span className="text-xs font-semibold uppercase tracking-wide">{periodLabel} Net Income</span>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${isProfit ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300" : "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300"}`}>
          {isProfit ? "Profit" : "Loss"}
        </span>
      </div>
      <div className={`text-3xl font-bold sm:text-4xl ${isProfit ? "text-slate-800 dark:text-slate-100" : "text-red-600 dark:text-red-400"}`} title={formatCurrency(netIncome)}>
        {formatCurrencyShort(netIncome)}
      </div>
      <div className="text-sm font-medium text-slate-500 dark:text-slate-400">
        {formatPct(Math.abs(marginPct))} net margin (Total Revenue − Total Expenses)
      </div>
    </div>
  );
}

type Tone = "revenue" | "collections" | "expenses";
const TONES: Record<Tone, { bg: string; border: string; icon: string; value: string }> = {
  revenue: { bg: "bg-blue-50 dark:bg-blue-950/40", border: "border-blue-200 dark:border-blue-800", icon: "text-blue-600 dark:text-blue-400", value: "text-blue-900 dark:text-blue-100" },
  collections: { bg: "bg-emerald-50 dark:bg-emerald-950/40", border: "border-emerald-200 dark:border-emerald-800", icon: "text-emerald-600 dark:text-emerald-400", value: "text-emerald-900 dark:text-emerald-100" },
  expenses: { bg: "bg-amber-50 dark:bg-amber-950/40", border: "border-amber-200 dark:border-amber-800", icon: "text-amber-600 dark:text-amber-400", value: "text-amber-900 dark:text-amber-100" },
};

function CategoryCard({
  tone,
  icon,
  label,
  value,
  fullValue,
}: {
  tone: Tone;
  icon: React.ReactNode;
  label: string;
  value: string;
  // Full, non-abbreviated value shown as a tooltip on hover.
  fullValue?: string;
}) {
  const t = TONES[tone];
  return (
    <div className={`rounded-lg border ${t.border} ${t.bg} p-4 shadow-sm`}>
      <div className={`flex items-center gap-2 ${t.icon}`}>
        {icon}
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <div className={`mt-2 text-xl font-semibold ${t.value}`} title={fullValue}>
        {value}
      </div>
    </div>
  );
}

function SummaryStat({
  icon,
  label,
  value,
  fullValue,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  // Full, non-abbreviated value shown as a tooltip on hover.
  fullValue?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
      <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold text-slate-800 dark:text-slate-100" title={fullValue}>
        {value}
      </div>
    </div>
  );
}

type RevSortKey = "businessUnitName" | "quarterAttainmentPct" | "ytdVsAnnualPct" | "annualTarget" | "ytdActual";
type RockSortKey = "businessUnitName" | "total" | "avgProgressPct" | "atRisk";
type DisbSortKey = "businessUnitName" | "disbursementsActual";

function SortHeader<T extends string>({
  label,
  sortKey,
  active,
  dir,
  onClick,
}: {
  label: string;
  sortKey: T;
  active: T;
  dir: "asc" | "desc";
  onClick: (key: T) => void;
}) {
  return (
    <th
      className="cursor-pointer select-none px-4 py-3 hover:text-slate-700 dark:hover:text-slate-200"
      onClick={() => onClick(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown className={`h-3 w-3 ${active === sortKey ? "text-brand-600 dark:text-brand-400" : "text-slate-300 dark:text-slate-600"}`} />
        {active === sortKey && <span className="text-[10px] text-brand-600 dark:text-brand-400">{dir === "asc" ? "↑" : "↓"}</span>}
      </span>
    </th>
  );
}

export default function Scorecard() {
  const { user } = useAuth();
  const { theme } = useTheme();
  // See the matching comment in ProgressChart.tsx — recharts' grid/axis
  // text is plain SVG attributes, not Tailwind classes, so it needs an
  // explicit color picked here rather than a dark: variant.
  const gridColor = theme === "dark" ? "#334155" : "#e2e8f0";
  const tickColor = theme === "dark" ? "#94a3b8" : "#64748b";
  const canSeeAllBUs = user?.role === "GROUP_INTEGRATOR" || user?.role === "SUPERADMIN";

  const [years, setYears] = useState<Year[]>([]);
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [yearId, setYearId] = useState("");
  const [quarter, setQuarter] = useState(0); // 0 = All Quarters — board-level view defaults to the full year
  const [businessUnitId, setBusinessUnitId] = useState("");

  const [data, setData] = useState<ScorecardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);

  const [revSort, setRevSort] = useState<{ key: RevSortKey; dir: "asc" | "desc" }>({ key: "businessUnitName", dir: "asc" });
  const [rockSort, setRockSort] = useState<{ key: RockSortKey; dir: "asc" | "desc" }>({ key: "businessUnitName", dir: "asc" });
  const [disbSort, setDisbSort] = useState<{ key: DisbSortKey; dir: "asc" | "desc" }>({ key: "businessUnitName", dir: "asc" });

  useEffect(() => {
    Promise.all([api.years(), api.currentQuarter().catch(() => null)]).then(([ys, current]) => {
      setYears(ys);
      if (!yearId && ys.length > 0) {
        if (current?.yearId && ys.some((y) => y.id === current.yearId)) setYearId(current.yearId);
        else setYearId(ys[0].id);
      }
    });
    api.businessUnits().then((bus) => {
      setBusinessUnits(bus);
      if (!canSeeAllBUs && !businessUnitId && bus.length > 0) setBusinessUnitId(bus[0].id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!yearId) return;
    setLoading(true);
    setError("");
    setForbidden(false);
    api
      .scorecard({ yearId, quarter, businessUnitId: businessUnitId || undefined })
      .then(setData)
      .catch((err) => {
        if (err.status === 403) setForbidden(true);
        else setError(err.message || "Failed to load the Executive Scorecard");
      })
      .finally(() => setLoading(false));
  }, [yearId, quarter, businessUnitId]);

  const chartData = useMemo(
    () => (data ? data.revenue.chart.map((c) => ({ label: c.label, Target: c.targetTotal, Actual: c.actualTotal })) : []),
    [data]
  );

  const sortedRevenueRows = useMemo(() => {
    if (!data) return [];
    const rows = [...data.revenue.businessUnits];
    rows.sort((a, b) => {
      const av = a[revSort.key];
      const bv = b[revSort.key];
      const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return revSort.dir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [data, revSort]);

  const sortedRockRows = useMemo(() => {
    if (!data) return [];
    const rows = [...data.rocks.businessUnits];
    rows.sort((a, b) => {
      const av = a[rockSort.key];
      const bv = b[rockSort.key];
      const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return rockSort.dir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [data, rockSort]);

  const sortedDisbRows = useMemo(() => {
    if (!data) return [];
    const rows = [...data.disbursements.businessUnits];
    rows.sort((a, b) => {
      const av = a[disbSort.key];
      const bv = b[disbSort.key];
      const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return disbSort.dir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [data, disbSort]);

  function toggleRevSort(key: RevSortKey) {
    setRevSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }
  function toggleRockSort(key: RockSortKey) {
    setRockSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }
  function toggleDisbSort(key: DisbSortKey) {
    setDisbSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  const periodLabel = quarter === 0 ? "Full Year" : `Q${quarter}`;
  const rocksCompletionPct = data && data.rocks.summary.total ? Math.round((data.rocks.summary.targetMet / data.rocks.summary.total) * 100) : 0;

  if (forbidden) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-12 text-center shadow-sm">
        <ShieldAlert className="h-10 w-10 text-slate-300 dark:text-slate-600" />
        <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-200">Executive Scorecard access required</h2>
        <p className="max-w-md text-sm text-slate-500 dark:text-slate-400">
          You don't currently have access to this page. Ask a Superadmin to grant your account (or a Custom Role assigned to
          you) view access to the Executive Scorecard.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="mb-1 text-xl font-bold text-slate-800 dark:text-slate-100">Executive Scorecard</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Board-level summary of revenue performance and strategic priorities.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 shadow-sm sm:flex sm:flex-wrap sm:items-end sm:gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Year</label>
            <select
              className="w-full rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-3 py-1.5 text-sm sm:w-auto"
              value={yearId}
              onChange={(e) => setYearId(e.target.value)}
            >
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.year}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Quarter</label>
            <select
              className="w-full rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-3 py-1.5 text-sm sm:w-auto"
              value={quarter}
              onChange={(e) => setQuarter(Number(e.target.value))}
            >
              <option value={0}>All Quarters</option>
              {[1, 2, 3, 4].map((q) => (
                <option key={q} value={q}>
                  Q{q}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2 flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Business Unit</label>
            <select
              className="w-full rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-3 py-1.5 text-sm sm:min-w-[180px]"
              value={businessUnitId}
              onChange={(e) => setBusinessUnitId(e.target.value)}
            >
              {canSeeAllBUs && <option value="">All Business Units</option>}
              {businessUnits.map((bu) => (
                <option key={bu.id} value={bu.id}>
                  {bu.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && <div className="rounded-md bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-600 dark:text-red-400">{error}</div>}

      {data && (
        <>
          {/* ---------- Top-line traffic-light summary ---------- */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <HeadlineCard
              icon={<PhilippinePeso className="h-4 w-4" />}
              label={`${periodLabel} Revenue Attainment`}
              value={formatCurrencyShort(data.revenue.kpis.quarterActual)}
              fullValue={formatCurrency(data.revenue.kpis.quarterActual)}
              pct={data.revenue.kpis.attainmentPct}
            />
            <NetIncomeCard
              netIncome={data.revenue.kpis.netIncome}
              revenueActual={data.revenue.kpis.quarterActual}
              periodLabel={periodLabel}
            />
            <HeadlineCard
              icon={<Mountain className="h-4 w-4" />}
              label="Rocks Completion"
              value={`${data.rocks.summary.targetMet} / ${data.rocks.summary.total} Met`}
              pct={rocksCompletionPct}
            />
          </div>

          {/* ---------- Revenue Performance Summary ---------- */}
          <section className="flex flex-col gap-4">
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">Revenue Performance Summary</h3>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <CategoryCard
                tone="revenue"
                icon={<PhilippinePeso className="h-4 w-4" />}
                label="Annual Revenue Target"
                value={formatCurrencyShort(data.revenue.kpis.annualRevenueTarget)}
                fullValue={formatCurrency(data.revenue.kpis.annualRevenueTarget)}
              />
              <CategoryCard
                tone="collections"
                icon={<PhilippinePeso className="h-4 w-4" />}
                label="Annual Collections Target"
                value={formatCurrencyShort(data.revenue.kpis.annualCollectionsTarget)}
                fullValue={formatCurrency(data.revenue.kpis.annualCollectionsTarget)}
              />
              <CategoryCard
                tone="expenses"
                icon={<PhilippinePeso className="h-4 w-4" />}
                label="Annual Expenses Target"
                value={formatCurrencyShort(data.revenue.kpis.annualExpensesTarget)}
                fullValue={formatCurrency(data.revenue.kpis.annualExpensesTarget)}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <SummaryStat
                icon={<TrendingUp className="h-4 w-4" />}
                label={`${periodLabel} Actual vs Target`}
                value={`${formatCurrencyShort(data.revenue.kpis.quarterActual)} / ${formatCurrencyShort(data.revenue.kpis.quarterTarget)}`}
                fullValue={`${formatCurrency(data.revenue.kpis.quarterActual)} / ${formatCurrency(data.revenue.kpis.quarterTarget)}`}
              />
              <SummaryStat
                icon={<CalendarRange className="h-4 w-4" />}
                label="Year-to-Date Actual"
                value={formatCurrencyShort(data.revenue.kpis.ytdActual)}
                fullValue={formatCurrency(data.revenue.kpis.ytdActual)}
              />
            </div>

            {/* Disbursements card — recorded, not targeted, so no Target/
                Attainment framing like the cards above, just this period's
                running total. Used to be 3 sub-category cards (Advances/
                Loan Repayments/Interests); collapsed to one, the same way
                the underlying figure was. Placed here (above Revenue Trend)
                rather than in its own section further down. */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <SummaryStat
                icon={<HandCoins className="h-4 w-4" />}
                label={`${periodLabel} Disbursements`}
                value={formatCurrencyShort(data.disbursements.summary.disbursementsActual)}
                fullValue={formatCurrency(data.disbursements.summary.disbursementsActual)}
              />
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 shadow-sm sm:p-4">
              <h4 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Revenue Trend (Actual vs Target)</h4>
              <ResponsiveContainer width="100%" height={240} minWidth={0}>
                <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: tickColor }} />
                  <YAxis tickFormatter={(v) => formatCurrency(v)} tick={{ fontSize: 10, fill: tickColor }} width={64} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="Actual" fill="#2563eb" radius={[4, 4, 0, 0]} barSize={36} />
                  <Line type="monotone" dataKey="Target" stroke="#ea580c" strokeWidth={2.5} dot={{ r: 4 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {data.revenue.businessUnits.length > 0 && (
              <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-950 text-left text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                      <tr>
                        <SortHeader label="Business Unit" sortKey="businessUnitName" active={revSort.key} dir={revSort.dir} onClick={toggleRevSort} />
                        <SortHeader label="Annual Target" sortKey="annualTarget" active={revSort.key} dir={revSort.dir} onClick={toggleRevSort} />
                        <SortHeader label={`${periodLabel} Attainment`} sortKey="quarterAttainmentPct" active={revSort.key} dir={revSort.dir} onClick={toggleRevSort} />
                        <SortHeader label="YTD Actual" sortKey="ytdActual" active={revSort.key} dir={revSort.dir} onClick={toggleRevSort} />
                        <SortHeader label="YTD vs Annual" sortKey="ytdVsAnnualPct" active={revSort.key} dir={revSort.dir} onClick={toggleRevSort} />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {sortedRevenueRows.map((bu) => (
                        <tr key={bu.businessUnitId}>
                          <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">{bu.businessUnitName}</td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{formatCurrency(bu.annualTarget)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                                <div
                                  className={`h-full rounded-full ${
                                    bu.quarterAttainmentPct >= 100 ? "bg-emerald-500" : bu.quarterAttainmentPct >= 85 ? "bg-amber-500" : "bg-red-500"
                                  }`}
                                  style={{ width: `${Math.min(100, bu.quarterAttainmentPct)}%` }}
                                />
                              </div>
                              <span className={`text-xs font-semibold ${attainmentColor(bu.quarterAttainmentPct)}`}>
                                {formatPct(bu.quarterAttainmentPct)}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{formatCurrency(bu.ytdActual)}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-semibold ${attainmentColor(bu.ytdVsAnnualPct)}`}>{formatPct(bu.ytdVsAnnualPct)}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          {/* ---------- Disbursements by Business Unit ---------- */}
          {/* The summary card for this section now lives above, right
              before the Revenue Trend chart — this keeps just the
              per-Business-Unit breakdown table. */}
          <section className="flex flex-col gap-4">
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">Disbursements by Business Unit</h3>

            {data.disbursements.businessUnits.length > 0 && (
              <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[360px] text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-950 text-left text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                      <tr>
                        <SortHeader label="Business Unit" sortKey="businessUnitName" active={disbSort.key} dir={disbSort.dir} onClick={toggleDisbSort} />
                        <SortHeader label="Disbursements" sortKey="disbursementsActual" active={disbSort.key} dir={disbSort.dir} onClick={toggleDisbSort} />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {sortedDisbRows.map((bu) => (
                        <tr key={bu.businessUnitId}>
                          <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">{bu.businessUnitName}</td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-300" title={formatCurrency(bu.disbursementsActual)}>
                            {formatCurrencyShort(bu.disbursementsActual)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          {/* ---------- Rocks Performance Summary ---------- */}
          <section className="flex flex-col gap-4">
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">Rocks Performance Summary</h3>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <SummaryStat icon={<ListChecks className="h-4 w-4" />} label="Total Rocks" value={String(data.rocks.summary.total)} />
              <SummaryStat icon={<CheckCircle2 className="h-4 w-4" />} label="Target Met" value={String(data.rocks.summary.targetMet)} />
              <SummaryStat icon={<TrendingUp className="h-4 w-4" />} label="On Track" value={String(data.rocks.summary.onTrack)} />
              <SummaryStat icon={<AlertTriangle className="h-4 w-4" />} label="At Risk / Pending" value={String(data.rocks.summary.atRisk + data.rocks.summary.pending)} />
              <SummaryStat icon={<Gauge className="h-4 w-4" />} label="Avg Progress" value={`${data.rocks.summary.avgProgressPct}%`} />
            </div>

            {data.rocks.businessUnits.length > 0 && (
              <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-950 text-left text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                      <tr>
                        <SortHeader label="Business Unit" sortKey="businessUnitName" active={rockSort.key} dir={rockSort.dir} onClick={toggleRockSort} />
                        <SortHeader label="Total" sortKey="total" active={rockSort.key} dir={rockSort.dir} onClick={toggleRockSort} />
                        <th className="px-4 py-3">Target Met</th>
                        <th className="px-4 py-3">On Track</th>
                        <SortHeader label="At Risk" sortKey="atRisk" active={rockSort.key} dir={rockSort.dir} onClick={toggleRockSort} />
                        <th className="px-4 py-3">Pending</th>
                        <SortHeader label="Avg Progress" sortKey="avgProgressPct" active={rockSort.key} dir={rockSort.dir} onClick={toggleRockSort} />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {sortedRockRows.map((bu) => (
                        <tr key={bu.businessUnitId}>
                          <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">{bu.businessUnitName}</td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{bu.total}</td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{bu.targetMet}</td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{bu.onTrack}</td>
                          <td className="px-4 py-3">
                            <span className={bu.atRisk > 0 ? "font-semibold text-red-600 dark:text-red-400" : "text-slate-600 dark:text-slate-300"}>{bu.atRisk}</span>
                          </td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{bu.pending}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                                <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, bu.avgProgressPct)}%` }} />
                              </div>
                              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{bu.avgProgressPct}%</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
              <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                <AlertTriangle className="h-4 w-4 text-red-500 dark:text-red-400" /> Needs Attention
              </h4>
              {data.rocks.attentionNeeded.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">No At Risk or Pending Rocks in this scope — everything's on track.</p>
              ) : (
                <div className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
                  {data.rocks.attentionNeeded.map((r) => (
                    <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <div className="font-medium text-slate-800 dark:text-slate-100">{r.title}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {r.companyName} &middot; {r.businessUnitName} &middot; Q{r.quarter}
                          {r.ownerName && <> &middot; Owner: {r.ownerName}</>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[r.status]}`}>
                          {STATUS_LABELS[r.status]}
                        </span>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                            <div className="h-full rounded-full bg-red-500" style={{ width: `${Math.min(100, r.progressPct)}%` }} />
                          </div>
                          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{formatProgressPct(r.progressPct)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </>
      )}

      {loading && !data && <div className="py-12 text-center text-slate-500 dark:text-slate-400">Loading Executive Scorecard...</div>}
    </div>
  );
}
