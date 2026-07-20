import { Fragment, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Minus, ShieldAlert } from "lucide-react";
import { api } from "../api/client";
import FilterBar, { DashboardFilters } from "../components/FilterBar";
import { formatCurrency, formatCurrencyShort, formatPct } from "../utils/format";
import type { ComparisonScope, ComparisonSnapshot } from "../api/types";

type MetricType = "currency" | "pct" | "count";

type MetricKey =
  | "revenueTarget"
  | "revenueActual"
  | "revenueAttainmentPct"
  | "collectionsTarget"
  | "collectionsActual"
  | "collectionsAttainmentPct"
  | "expensesTarget"
  | "expensesActual"
  | "expensesAttainmentPct"
  | "rocksTotal"
  | "rocksTargetMet"
  | "rocksOnTrack"
  | "rocksAtRisk"
  | "rocksPending"
  | "rocksAvgProgressPct"
  | "advancesActual"
  | "loansActual"
  | "interestsActual";

interface MetricDef {
  key: MetricKey;
  label: string;
  type: MetricType;
}

// Grouped the same way the underlying figures are gated (Revenue/
// Collections/Expenses independently, Rocks and Disbursements each as one
// combined block) — see server/src/routes/comparison.ts.
const SECTIONS: { title: string; metrics: MetricDef[] }[] = [
  {
    title: "Revenue",
    metrics: [
      { key: "revenueTarget", label: "Target", type: "currency" },
      { key: "revenueActual", label: "Actual", type: "currency" },
      { key: "revenueAttainmentPct", label: "Attainment", type: "pct" },
    ],
  },
  {
    title: "Collections",
    metrics: [
      { key: "collectionsTarget", label: "Target", type: "currency" },
      { key: "collectionsActual", label: "Actual", type: "currency" },
      { key: "collectionsAttainmentPct", label: "Attainment", type: "pct" },
    ],
  },
  {
    title: "Expenses",
    metrics: [
      { key: "expensesTarget", label: "Target", type: "currency" },
      { key: "expensesActual", label: "Actual", type: "currency" },
      { key: "expensesAttainmentPct", label: "Attainment", type: "pct" },
    ],
  },
  {
    title: "Rocks",
    metrics: [
      { key: "rocksTotal", label: "Total", type: "count" },
      { key: "rocksTargetMet", label: "Target Met", type: "count" },
      { key: "rocksOnTrack", label: "On Track", type: "count" },
      { key: "rocksAtRisk", label: "At Risk", type: "count" },
      { key: "rocksPending", label: "Pending", type: "count" },
      { key: "rocksAvgProgressPct", label: "Avg Progress", type: "pct" },
    ],
  },
  {
    title: "Disbursements",
    metrics: [
      { key: "advancesActual", label: "Advances", type: "currency" },
      { key: "loansActual", label: "Loan Repayments", type: "currency" },
      { key: "interestsActual", label: "Interests", type: "currency" },
    ],
  },
];

function formatMetric(type: MetricType, value: number): { text: string; title?: string } {
  if (type === "currency") return { text: formatCurrencyShort(value), title: formatCurrency(value) };
  if (type === "pct") return { text: formatPct(value) };
  return { text: String(value) };
}

function computeDelta(type: MetricType, a: number, b: number): { primary: string; secondary?: string; direction: "up" | "down" | "flat" } {
  const diff = b - a;
  const direction: "up" | "down" | "flat" = diff > 0 ? "up" : diff < 0 ? "down" : "flat";

  if (type === "pct") {
    return { primary: `${diff > 0 ? "+" : ""}${diff.toFixed(1)} pts`, direction };
  }

  const pctChange = a !== 0 ? (diff / Math.abs(a)) * 100 : b !== 0 ? 100 : 0;
  const sign = diff > 0 ? "+" : "";
  const primary = type === "currency" ? `${sign}${formatCurrencyShort(diff)}` : `${sign}${diff}`;
  const secondary = `${pctChange > 0 ? "+" : ""}${pctChange.toFixed(1)}%`;
  return { primary, secondary, direction };
}

function scopeLabel(s: ComparisonScope): string {
  const period = s.allQuarters ? `${s.year} Full Year` : `${s.year} Q${s.quarter}`;
  const place = s.companyName || s.businessUnitName || "All Business Units";
  return `${period} — ${place}`;
}

const emptyFilters = (): DashboardFilters => ({ yearId: "", quarter: 0, businessUnitId: "", companyId: "" });

export default function Compare() {
  const [leftFilters, setLeftFilters] = useState<DashboardFilters>(emptyFilters());
  const [rightFilters, setRightFilters] = useState<DashboardFilters>(emptyFilters());

  const [leftData, setLeftData] = useState<ComparisonSnapshot | null>(null);
  const [rightData, setRightData] = useState<ComparisonSnapshot | null>(null);
  const [leftError, setLeftError] = useState("");
  const [rightError, setRightError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!leftFilters.yearId) return;
    setLoading(true);
    setLeftError("");
    setForbidden(false);
    api
      .comparisonSnapshot({
        yearId: leftFilters.yearId,
        quarter: leftFilters.quarter,
        businessUnitId: leftFilters.businessUnitId || undefined,
        companyId: leftFilters.companyId || undefined,
      })
      .then(setLeftData)
      .catch((err) => {
        if (err.status === 403) setForbidden(true);
        else setLeftError(err.message || "Failed to load Period A");
      })
      .finally(() => setLoading(false));
  }, [leftFilters.yearId, leftFilters.quarter, leftFilters.businessUnitId, leftFilters.companyId]);

  useEffect(() => {
    if (!rightFilters.yearId) return;
    setLoading(true);
    setRightError("");
    setForbidden(false);
    api
      .comparisonSnapshot({
        yearId: rightFilters.yearId,
        quarter: rightFilters.quarter,
        businessUnitId: rightFilters.businessUnitId || undefined,
        companyId: rightFilters.companyId || undefined,
      })
      .then(setRightData)
      .catch((err) => {
        if (err.status === 403) setForbidden(true);
        else setRightError(err.message || "Failed to load Period B");
      })
      .finally(() => setLoading(false));
  }, [rightFilters.yearId, rightFilters.quarter, rightFilters.businessUnitId, rightFilters.companyId]);

  if (forbidden) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-slate-200 bg-white p-12 text-center shadow-sm">
        <ShieldAlert className="h-10 w-10 text-slate-300" />
        <h2 className="text-lg font-semibold text-slate-700">Comparison access required</h2>
        <p className="max-w-md text-sm text-slate-500">
          You don't currently have access to this page. Ask a Superadmin to grant your account (or a Custom Role assigned to
          you) view access to Comparison.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="mb-1 text-xl font-bold text-slate-800">Side-by-Side Comparison</h2>
        <p className="text-sm text-slate-500">
          Pick a Year/Quarter/Business Unit/Company for each period independently — Revenue, Collections, Expenses, Rocks,
          and Disbursements are compared below.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-slate-700">Period A</h3>
          <FilterBar filters={leftFilters} onChange={setLeftFilters} />
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-slate-700">Period B</h3>
          <FilterBar filters={rightFilters} onChange={setRightFilters} />
        </div>
      </div>

      {leftError && <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-600">{leftError}</div>}
      {rightError && <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-600">{rightError}</div>}

      {leftData && rightData && (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Metric</th>
                  <th className="px-4 py-3">{scopeLabel(leftData.scope)}</th>
                  <th className="w-32 px-4 py-3 text-center sm:w-40">Change</th>
                  <th className="px-4 py-3">{scopeLabel(rightData.scope)}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {SECTIONS.map((section) => (
                  <Fragment key={section.title}>
                    <tr className="bg-slate-50/60">
                      <td colSpan={4} className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                        {section.title}
                      </td>
                    </tr>
                    {section.metrics.map((m) => {
                      const a = leftData[m.key] as number;
                      const b = rightData[m.key] as number;
                      const av = formatMetric(m.type, a);
                      const bv = formatMetric(m.type, b);
                      const delta = computeDelta(m.type, a, b);
                      const DeltaIcon = delta.direction === "up" ? ArrowUp : delta.direction === "down" ? ArrowDown : Minus;
                      const deltaColor =
                        delta.direction === "up" ? "text-emerald-600" : delta.direction === "down" ? "text-rose-600" : "text-slate-400";
                      return (
                        <tr key={m.key}>
                          <td className="px-4 py-3 text-slate-600">{m.label}</td>
                          <td className="px-4 py-3 font-medium text-slate-800" title={av.title}>
                            {av.text}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className={`flex flex-col items-center gap-0.5 ${deltaColor}`}>
                              <span className="inline-flex items-center gap-1 text-xs font-semibold">
                                <DeltaIcon className="h-3 w-3" />
                                {delta.primary}
                              </span>
                              {delta.secondary && <span className="text-[10px] text-slate-400">{delta.secondary}</span>}
                            </div>
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-800" title={bv.title}>
                            {bv.text}
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">
            Change shows Period B minus Period A. Arrows/color indicate direction only — an increase isn't necessarily
            favorable for every metric (e.g. Expenses).
          </div>
        </div>
      )}

      {loading && !leftData && !rightData && <div className="py-12 text-center text-slate-500">Loading comparison...</div>}
    </div>
  );
}
