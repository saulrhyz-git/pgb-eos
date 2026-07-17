import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, MessageSquare } from "lucide-react";
import type { OperationalGridCompanyRow, OperationalGridRow } from "../api/types";
import { api } from "../api/client";
import { attainmentColor, formatCurrency, formatPct } from "../utils/format";

interface Props {
  rows: OperationalGridRow[];
  yearId: string;
  quarter: number;
  onRemarksSaved?: () => void;
}

type RemarksField = "revenueRemarks" | "collectionsRemarks" | "expensesRemarks";

export default function OperationalGrid({ rows, yearId, quarter, onRemarksSaved }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

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
          {saving[key] && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold text-slate-700">Business Unit Operational Grid</h3>
      <p className="mb-4 text-xs text-slate-400">
        Annual/Quarter targets are set per Business Unit. Expand a Business Unit to see each Company's own recognized
        actuals and remarks, which roll up into the totals below.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase text-slate-400">
              <th className="py-2 pr-3 w-6"></th>
              <th className="py-2 pr-3">Business Unit</th>
              <th className="py-2 pr-3 text-right">Annual Target</th>
              <th className="py-2 pr-3 text-right">Q{quarter} Target</th>
              <th className="py-2 pr-3 text-right">Q{quarter} Actual</th>
              <th className="py-2 pr-3 text-right">Attainment %</th>
              <th className="py-2 pr-3 text-right">YTD Actual</th>
              <th className="py-2 pr-3 text-right">YTD vs Annual %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isOpen = expanded.has(row.businessUnitId);
              const hasRemarks = row.companies.some((c) => c.revenueRemarks || c.collectionsRemarks || c.expensesRemarks);
              return (
                <Fragment key={row.businessUnitId}>
                  <tr className="border-b border-slate-100">
                    <td className="py-2 pr-3">
                      <button
                        onClick={() => toggle(row.businessUnitId)}
                        className="flex items-center gap-1 text-slate-400 hover:text-slate-700"
                        title={hasRemarks ? "Has remarks" : "Expand for per-company detail & remarks"}
                      >
                        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        {hasRemarks && !isOpen && <MessageSquare className="h-3 w-3 text-brand-500" />}
                      </button>
                    </td>
                    <td className="py-2 pr-3 font-medium text-slate-700">{row.businessUnitName}</td>
                    <td className="py-2 pr-3 text-right">{formatCurrency(row.annualTarget)}</td>
                    <td className="py-2 pr-3 text-right">{formatCurrency(row.quarterTarget)}</td>
                    <td className="py-2 pr-3 text-right">{formatCurrency(row.quarterActual)}</td>
                    <td className={`py-2 pr-3 text-right font-semibold ${attainmentColor(row.quarterAttainmentPct)}`}>
                      {formatPct(row.quarterAttainmentPct)}
                    </td>
                    <td className="py-2 pr-3 text-right">{formatCurrency(row.ytdActual)}</td>
                    <td className={`py-2 pr-3 text-right font-semibold ${attainmentColor(row.ytdVsAnnualPct)}`}>
                      {formatPct(row.ytdVsAnnualPct)}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="border-b border-slate-100 bg-slate-50/60">
                      <td></td>
                      <td colSpan={7} className="py-3 pr-3">
                        {row.companies.length === 0 && (
                          <div className="text-xs text-slate-400">No companies in this Business Unit yet.</div>
                        )}
                        <div className="flex flex-col gap-4">
                          {row.companies.map((c) => (
                            <div key={c.companyId} className="rounded-md border border-slate-200 bg-white p-3">
                              <div className="mb-2 text-xs font-semibold text-slate-600">{c.companyName}</div>
                              <div className="mb-3 grid grid-cols-2 gap-x-8 gap-y-1 text-xs text-slate-600 sm:grid-cols-4">
                                <div>
                                  <span className="font-medium text-slate-500">Revenue Internal:</span>{" "}
                                  {formatCurrency(c.quarterActual.internal)}
                                </div>
                                <div>
                                  <span className="font-medium text-slate-500">Revenue External:</span>{" "}
                                  {formatCurrency(c.quarterActual.external)}
                                </div>
                                <div>
                                  <span className="font-medium text-slate-500">Collections Internal:</span>{" "}
                                  {formatCurrency(c.quarterActual.collectionsInternal)}
                                </div>
                                <div>
                                  <span className="font-medium text-slate-500">Collections External:</span>{" "}
                                  {formatCurrency(c.quarterActual.collectionsExternal)}
                                </div>
                                <div>
                                  <span className="font-medium text-slate-500">Expenses Internal:</span>{" "}
                                  {formatCurrency(c.quarterActual.expensesInternal)}
                                </div>
                                <div>
                                  <span className="font-medium text-slate-500">Expenses External:</span>{" "}
                                  {formatCurrency(c.quarterActual.expensesExternal)}
                                </div>
                                <div>
                                  <span className="font-medium text-slate-500">YTD Actual:</span>{" "}
                                  {formatCurrency(c.ytdActual)}
                                </div>
                              </div>
                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                <RemarksInput row={c} field="revenueRemarks" label="Revenue Remarks" />
                                <RemarksInput row={c} field="collectionsRemarks" label="Collections Remarks" />
                                <RemarksInput row={c} field="expensesRemarks" label="Expenses Remarks" />
                              </div>
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
                <td colSpan={8} className="py-6 text-center text-slate-400">
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
