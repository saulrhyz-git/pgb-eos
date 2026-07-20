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
type ExpensesRemarksField = "expensesInterestRemarks" | "expensesDepreciationRemarks" | "expensesOtherNonCashRemarks";
type RemarksField = RevenueRemarksField | CollectionsRemarksField | ExpensesRemarksField;

const COLLECTIONS_BREAKDOWN: { title: string; value: keyof OperationalGridCompanyRow["quarterActual"]; remarksField: CollectionsRemarksField; label: string }[] = [
  { title: "Internal", value: "collectionsInternalEarned", remarksField: "collectionsInternalEarnedRemarks", label: "Revenue - Earned" },
  { title: "Internal", value: "collectionsInternalUnearned", remarksField: "collectionsInternalUnearnedRemarks", label: "Advance Payments - Unearned" },
  { title: "Internal", value: "collectionsInternalOthers", remarksField: "collectionsInternalOthersRemarks", label: "Others" },
  { title: "External", value: "collectionsExternalEarned", remarksField: "collectionsExternalEarnedRemarks", label: "Revenue - Earned" },
  { title: "External", value: "collectionsExternalUnearned", remarksField: "collectionsExternalUnearnedRemarks", label: "Advance Payments - Unearned" },
  { title: "External", value: "collectionsExternalOthers", remarksField: "collectionsExternalOthersRemarks", label: "Others" },
];

const EXPENSES_BREAKDOWN: { value: keyof OperationalGridCompanyRow["quarterActual"]; remarksField: ExpensesRemarksField; label: string }[] = [
  { value: "expensesInterest", remarksField: "expensesInterestRemarks", label: "Interest" },
  { value: "expensesDepreciation", remarksField: "expensesDepreciationRemarks", label: "Depreciation" },
  { value: "expensesOtherNonCash", remarksField: "expensesOtherNonCashRemarks", label: "Other Non-Cash Expenses" },
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

  function RemarksInput({ row, field, label }: { row: OperationalGridCompanyRow; field: RemarksField; label: string }) {
    const key = `${row.companyId}:${field}`;
    const draft = drafts[key] ?? row[field];
    return (
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-500">{label}</label>
        <div className="flex items-center gap-2">
          <input
            className="w-full min-w-[180px] rounded-md border border-slate-200 px-2 py-1 text-xs"
            value={draft}
            placeholder="Add remarks..."
            onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
            onBlur={(e) => {
              if (e.target.value !== row[field]) saveRemarks(row.companyId, field, e.target.value);
            }}
          />
          {saving[key] && <Loader2 className="h-3 w-3 animate-spin text-slate-500" />}
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
    return row.companies.some((c) => c.expensesInterestRemarks || c.expensesDepreciationRemarks || c.expensesOtherNonCashRemarks);
  }

  const title =
    category === "REVENUE" ? "Business Unit Operational Grid" : category === "COLLECTIONS" ? "Collections Operational Grid" : "Expenses Operational Grid";

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
      <h3 className="mb-4 text-sm font-semibold text-slate-700">{title}</h3>
      <p className="mb-4 text-xs text-slate-500">
        {category === "REVENUE"
          ? "Annual/Quarter targets are set per Company and roll up into their Business Unit's total. Expand a Business Unit to see each Company's own recognized actuals and remarks, which roll up into the totals below."
          : `Quarter targets are set per Company and roll up into their Business Unit's total. Expand a Business Unit to see each Company's own ${category === "COLLECTIONS" ? "Collections" : "Expenses"} breakdown and remarks.`}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase text-slate-500">
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
                  <tr className="border-b border-slate-100">
                    <td className="py-2 pr-3">
                      <button
                        onClick={() => toggle(row.businessUnitId)}
                        className="flex items-center gap-1 text-slate-500 hover:text-slate-700"
                        title={hasRemarks ? "Has remarks" : "Expand for per-company detail & remarks"}
                      >
                        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        {hasRemarks && !isOpen && <MessageSquare className="h-3 w-3 text-brand-500" />}
                      </button>
                    </td>
                    <td className="py-2 pr-3 font-medium text-slate-700">{row.businessUnitName}</td>
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
                    <tr className="border-b border-slate-100 bg-slate-50/60">
                      <td></td>
                      <td colSpan={columnCount - 1} className="py-3 pr-3">
                        {row.companies.length === 0 && (
                          <div className="text-xs text-slate-500">No companies in this Business Unit yet.</div>
                        )}
                        <div className="flex flex-col gap-4">
                          {row.companies.map((c) => (
                            <div key={c.companyId} className="rounded-md border border-slate-200 bg-white p-3">
                              <div className="mb-2 text-xs font-semibold text-slate-600">{c.companyName}</div>

                              {category === "REVENUE" && (
                                <>
                                  <div className="mb-3 grid grid-cols-2 gap-x-8 gap-y-1 text-xs text-slate-600 sm:grid-cols-3">
                                    <div>
                                      <span className="font-medium text-slate-500">Revenue Internal:</span>{" "}
                                      {formatCurrency(c.quarterActual.internal)}
                                    </div>
                                    <div>
                                      <span className="font-medium text-slate-500">Revenue External:</span>{" "}
                                      {formatCurrency(c.quarterActual.external)}
                                    </div>
                                    <div>
                                      <span className="font-medium text-slate-500">YTD Actual:</span>{" "}
                                      {formatCurrency(c.ytdActual)}
                                    </div>
                                  </div>
                                  {isAllQuarters ? (
                                    <p className="text-xs italic text-slate-500">
                                      Remarks are logged per quarter — select a specific quarter to view or edit them.
                                    </p>
                                  ) : (
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                      <RemarksInput row={c} field="revenueRemarks" label="Revenue Remarks" />
                                    </div>
                                  )}
                                </>
                              )}

                              {category === "COLLECTIONS" && (
                                <>
                                  <div className="mb-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    {(["Internal", "External"] as const).map((side) => (
                                      <div key={side}>
                                        <div className="mb-1 text-xs font-semibold text-slate-500">Collections — {side}</div>
                                        <div className="grid grid-cols-1 gap-1 text-xs text-slate-600 xs:grid-cols-3">
                                          {COLLECTIONS_BREAKDOWN.filter((b) => b.title === side).map((b) => (
                                            <div key={b.value}>
                                              <span className="font-medium text-slate-500">{b.label}:</span>{" "}
                                              {formatCurrency(c.quarterActual[b.value] as number)}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                  {isAllQuarters ? (
                                    <p className="text-xs italic text-slate-500">
                                      Remarks are logged per quarter — select a specific quarter to view or edit them.
                                    </p>
                                  ) : (
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                      {COLLECTIONS_BREAKDOWN.map((b) => (
                                        <RemarksInput
                                          key={b.remarksField}
                                          row={c}
                                          field={b.remarksField}
                                          label={`${b.title} — ${b.label}`}
                                        />
                                      ))}
                                    </div>
                                  )}
                                </>
                              )}

                              {category === "EXPENSES" && (
                                <>
                                  <div className="mb-3 grid grid-cols-1 gap-1 text-xs text-slate-600 sm:grid-cols-3">
                                    {EXPENSES_BREAKDOWN.map((b) => (
                                      <div key={b.value}>
                                        <span className="font-medium text-slate-500">{b.label}:</span>{" "}
                                        {formatCurrency(c.quarterActual[b.value] as number)}
                                      </div>
                                    ))}
                                  </div>
                                  {isAllQuarters ? (
                                    <p className="text-xs italic text-slate-500">
                                      Remarks are logged per quarter — select a specific quarter to view or edit them.
                                    </p>
                                  ) : (
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                      {EXPENSES_BREAKDOWN.map((b) => (
                                        <RemarksInput key={b.remarksField} row={c} field={b.remarksField} label={b.label} />
                                      ))}
                                    </div>
                                  )}
                                </>
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
                <td colSpan={columnCount} className="py-6 text-center text-slate-500">
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
