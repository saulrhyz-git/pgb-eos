import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, MessageSquare } from "lucide-react";
import type { OperationalGridCompanyRow, OperationalGridRow } from "../api/types";
import { api } from "../api/client";
import { attainmentColor, formatCurrency, formatPct } from "../utils/format";

type Category = "REVENUE" | "COLLECTIONS" | "EXPENSES";

interface Props {
  rows: OperationalGridRow[];
  yearId: string;
  quarter: number;
  onRemarksSaved?: () => void;
  // Which category this grid is showing — defaults to Revenue so any
  // existing call site that hasn't been updated yet keeps behaving exactly
  // as it did before Collections/Expenses got their own BU-level rollups.
  // Revenue keeps its full Annual/Quarter/YTD headline (it's always had
  // one); Collections/Expenses only ever have a Quarter Target/Actual/
  // Attainment rollup, so their headline is narrower and their expanded
  // detail rows show their own breakdown fields + remarks instead of
  // Revenue's Internal/External.
  category?: Category;
}

type RevenueRemarksField = "revenueRemarks";
type CollectionsRemarksField =
  | "collectionsInternalEarnedRemarks"
  | "collectionsInternalUnearnedRemarks"
  | "collectionsInternalOthersRemarks"
  | "collectionsExternalEarnedRemarks"
  | "collectionsExternalUnearnedRemarks"
  | "collectionsExternalOthersRemarks";
// Expenses collapsed to a single amount + one Remarks field (same shape as
// Revenue) — it used to be a 3-way breakdown (Interest/Depreciation/Other
// Non-Cash), each with its own Remarks. Any significant breakdown items are
// now logged separately via the growable "notable line items" facility on
// the Data Entry page (ExpenseNote), which is purely informational and
// doesn't surface here.
type ExpensesRemarksField = "expensesRemarks";
type RemarksField = RevenueRemarksField | CollectionsRemarksField | ExpensesRemarksField;

const COLLECTIONS_BREAKDOWN: { title: string; value: keyof OperationalGridCompanyRow["quarterActual"]; remarksField: CollectionsRemarksField; label: string }[] = [
  { title: "Internal", value: "collectionsInternalEarned", remarksField: "collectionsInternalEarnedRemarks", label: "Revenue - Earned" },
  { title: "Internal", value: "collectionsInternalUnearned", remarksField: "collectionsInternalUnearnedRemarks", label: "Advance Payments - Unearned" },
  { title: "Internal", value: "collectionsInternalOthers", remarksField: "collectionsInternalOthersRemarks", label: "Others" },
  { title: "External", value: "collectionsExternalEarned", remarksField: "collectionsExternalEarnedRemarks", label: "Revenue - Earned" },
  { title: "External", value: "collectionsExternalUnearned", remarksField: "collectionsExternalUnearnedRemarks", label: "Advance Payments - Unearned" },
  { title: "External", value: "collectionsExternalOthers", remarksField: "collectionsExternalOthersRemarks", label: "Others" },
];

export default function OperationalGrid({ rows, yearId, quarter, onRemarksSaved, category = "REVENUE" }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  // quarter === 0 means "All Quarters" (full year) was selected in the filter bar.
  const isAllQuarters = quarter === 0;
  const periodLabel = isAllQuarters ? "Full Year" : `Q${quarter}`;

  // Revenue's headline has always had Annual/YTD columns alongside Quarter
  // Target/Actual/Attainment; Collections/Expenses only ever roll up a
  // Quarter figure at the BU level, so their headline table is narrower.
  const columnCount = category === "REVENUE" ? 8 : 5;

  function toggle(businessUnitId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(businessUnitId) ? next.delete(businessUnitId) : next.add(businessUnitId);
      return next;
    });
  }

  async function saveRemarks(companyId: string, field: RemarksField, value: string) {
    const key = `${companyId}:${field}`;
    setSaving((s) => ({ ...s, [key]: true }));
    try {
      await api.patchRemarks(companyId, yearId, quarter, { [field]: value });
      onRemarksSaved?.();
    } finally {
      setSaving((s) => ({ ...s, [key]: false }));
    }
  }

  // `label` is optional — omitted when a Remarks box is already paired with
  // its own value row right above it (Collections/Expenses breakdowns), so
  // the breakdown's own label isn't repeated a second time immediately
  // above the input.
  function RemarksInput({ row, field, label }: { row: OperationalGridCompanyRow; field: RemarksField; label?: string }) {
    const key = `${row.companyId}:${field}`;
    const draft = drafts[key] ?? row[field];
    return (
      <div className="flex flex-col gap-1">
        {label && <label className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</label>}
        <div className="flex items-center gap-2">
          <input
            className="w-full min-w-[140px] rounded-md border border-slate-200 dark:border-slate-700 px-2 py-1 text-xs"
            value={draft}
            placeholder="Add remarks..."
            onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
            onBlur={(e) => {
              if (e.target.value !== row[field]) saveRemarks(row.companyId, field, e.target.value);
            }}
          />
          {saving[key] && <Loader2 className="h-3 w-3 animate-spin shrink-0 text-slate-500 dark:text-slate-400" />}
        </div>
      </div>
    );
  }

  function hasAnyRemarks(row: OperationalGridRow): boolean {
    if (category === "REVENUE") return row.companies.some((c) => c.revenueRemarks);
    if (category === "COLLECTIONS")
      return row.companies.some(
        (c) =>
          c.collectionsInternalEarnedRemarks ||
          c.collectionsInternalUnearnedRemarks ||
          c.collectionsInternalOthersRemarks ||
          c.collectionsExternalEarnedRemarks ||
          c.collectionsExternalUnearnedRemarks ||
          c.collectionsExternalOthersRemarks
      );
    return row.companies.some((c) => c.expensesRemarks);
  }

  const title =
    category === "REVENUE" ? "Business Unit Operational Grid" : category === "COLLECTIONS" ? "Collections Operational Grid" : "Expenses Operational Grid";

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 shadow-sm sm:p-4">
      <h3 className="mb-4 text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h3>
      <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
        {category === "REVENUE"
          ? "Annual/Quarter targets are set per Company and roll up into their Business Unit's total. Expand a Business Unit to see each Company's own recognized actuals and remarks, which roll up into the totals below."
          : `Quarter targets are set per Company and roll up into their Business Unit's total. Expand a Business Unit to see each Company's own ${category === "COLLECTIONS" ? "Collections" : "Expenses"} breakdown and remarks.`}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-xs font-medium uppercase text-slate-500 dark:text-slate-400">
              <th className="py-2 pr-3 w-6"></th>
              <th className="py-2 pr-3">Business Unit</th>
              {category === "REVENUE" && <th className="py-2 pr-3 text-right">Annual Target</th>}
              <th className="py-2 pr-3 text-right">{periodLabel} Target</th>
              <th className="py-2 pr-3 text-right">{periodLabel} Actual</th>
              <th className="py-2 pr-3 text-right">Attainment %</th>
              {category === "REVENUE" && (
                <>
                  <th className="py-2 pr-3 text-right">YTD Actual</th>
                  <th className="py-2 pr-3 text-right">YTD vs Annual %</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isOpen = expanded.has(row.businessUnitId);
              const hasRemarks = hasAnyRemarks(row);
              const quarterTarget = category === "REVENUE" ? row.quarterTarget : category === "COLLECTIONS" ? row.collectionsQuarterTarget : row.expensesQuarterTarget;
              const quarterActual = category === "REVENUE" ? row.quarterActual : category === "COLLECTIONS" ? row.collectionsQuarterActual : row.expensesQuarterActual;
              const attainmentPct = category === "REVENUE" ? row.quarterAttainmentPct : category === "COLLECTIONS" ? row.collectionsAttainmentPct : row.expensesAttainmentPct;
              return (
                <Fragment key={row.businessUnitId}>
                  <tr className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-2 pr-3">
                      <button
                        onClick={() => toggle(row.businessUnitId)}
                        className="flex items-center gap-1 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                        title={hasRemarks ? "Has remarks" : "Expand for per-company detail & remarks"}
                      >
                        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        {hasRemarks && !isOpen && <MessageSquare className="h-3 w-3 text-brand-500 dark:text-brand-400" />}
                      </button>
                    </td>
                    <td className="py-2 pr-3 font-medium text-slate-700 dark:text-slate-200">{row.businessUnitName}</td>
                    {category === "REVENUE" && <td className="py-2 pr-3 text-right">{formatCurrency(row.annualTarget)}</td>}
                    <td className="py-2 pr-3 text-right">{formatCurrency(quarterTarget)}</td>
                    <td className="py-2 pr-3 text-right">{formatCurrency(quarterActual)}</td>
                    <td className={`py-2 pr-3 text-right font-semibold ${attainmentColor(attainmentPct)}`}>{formatPct(attainmentPct)}</td>
                    {category === "REVENUE" && (
                      <>
                        <td className="py-2 pr-3 text-right">{formatCurrency(row.ytdActual)}</td>
                        <td className={`py-2 pr-3 text-right font-semibold ${attainmentColor(row.ytdVsAnnualPct)}`}>
                          {formatPct(row.ytdVsAnnualPct)}
                        </td>
                      </>
                    )}
                  </tr>
                  {isOpen && (
                    <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60">
                      <td></td>
                      <td colSpan={columnCount - 1} className="py-3 pr-3">
                        {row.companies.length === 0 && (
                          <div className="text-xs text-slate-500 dark:text-slate-400">No companies in this Business Unit yet.</div>
                        )}
                        <div className="flex flex-col gap-4">
                          {row.companies.map((c) => (
                            <div key={c.companyId} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
                              <div className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">{c.companyName}</div>

                              {category === "REVENUE" && (
                                <>
                                  <div className="mb-3 grid grid-cols-2 gap-x-8 gap-y-1 text-xs text-slate-600 dark:text-slate-300 sm:grid-cols-3">
                                    <div>
                                      <span className="font-medium text-slate-500 dark:text-slate-400">Revenue Internal:</span>{" "}
                                      {formatCurrency(c.quarterActual.internal)}
                                    </div>
                                    <div>
                                      <span className="font-medium text-slate-500 dark:text-slate-400">Revenue External:</span>{" "}
                                      {formatCurrency(c.quarterActual.external)}
                                    </div>
                                    <div>
                                      <span className="font-medium text-slate-500 dark:text-slate-400">YTD Actual:</span>{" "}
                                      {formatCurrency(c.ytdActual)}
                                    </div>
                                  </div>
                                  {isAllQuarters ? (
                                    <p className="text-xs italic text-slate-500 dark:text-slate-400">
                                      Remarks are logged per quarter — select a specific quarter to view or edit them.
                                    </p>
                                  ) : (
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                      <RemarksInput row={c} field="revenueRemarks" label="Revenue Remarks" />
                                    </div>
                                  )}
                                </>
                              )}

                              {/* Collections/Expenses: each breakdown's value is paired directly
                                  with its own Remarks box right underneath, instead of showing all
                                  the values in one grid and all the Remarks boxes in a second,
                                  disconnected grid below (the old layout, which made it hard to
                                  tell which Remarks box belonged to which value). */}
                              {category === "COLLECTIONS" && (
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                  {(["Internal", "External"] as const).map((side) => (
                                    <div key={side} className="rounded-md border border-emerald-100 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/30 p-3">
                                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                                        Collections — {side}
                                      </div>
                                      <div className="flex flex-col divide-y divide-emerald-100 dark:divide-emerald-800">
                                        {COLLECTIONS_BREAKDOWN.filter((b) => b.title === side).map((b) => (
                                          <div key={b.value} className="flex flex-col gap-1.5 py-2 first:pt-0 last:pb-0">
                                            <div className="flex items-baseline justify-between gap-2">
                                              <span className="text-xs text-slate-600 dark:text-slate-300">{b.label}</span>
                                              <span className="whitespace-nowrap text-sm font-semibold text-slate-800 dark:text-slate-100">
                                                {formatCurrency(c.quarterActual[b.value] as number)}
                                              </span>
                                            </div>
                                            {isAllQuarters ? (
                                              <p className="text-[11px] italic text-slate-400 dark:text-slate-500">Select a quarter to view/edit Remarks.</p>
                                            ) : (
                                              <RemarksInput row={c} field={b.remarksField} />
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {category === "EXPENSES" && (
                                <div className="rounded-md border border-amber-100 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/30 p-3">
                                  <div className="mb-2 flex items-baseline justify-between gap-2">
                                    <span className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">Expenses</span>
                                    <span className="whitespace-nowrap text-sm font-semibold text-slate-800 dark:text-slate-100">
                                      {formatCurrency(c.quarterActual.expenses)}
                                    </span>
                                  </div>
                                  {isAllQuarters ? (
                                    <p className="text-[11px] italic text-slate-400 dark:text-slate-500">Select a quarter to view/edit Remarks.</p>
                                  ) : (
                                    <RemarksInput row={c} field="expensesRemarks" />
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columnCount} className="py-6 text-center text-slate-500 dark:text-slate-400">
                  No Business Unit data for this scope yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
