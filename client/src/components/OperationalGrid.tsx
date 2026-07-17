import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, MessageSquare } from "lucide-react";
import type { OperationalGridRow } from "../api/types";
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

  function toggle(companyId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(companyId) ? next.delete(companyId) : next.add(companyId);
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

  function RemarksInput({ row, field, label }: { row: OperationalGridRow; field: RemarksField; label: string }) {
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
      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase text-slate-400">
              <th className="py-2 pr-3 w-6"></th>
              <th className="py-2 pr-3">Company</th>
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
              const isOpen = expanded.has(row.companyId);
              const hasRemarks = Boolean(row.revenueRemarks || row.collectionsRemarks || row.expensesRemarks);
              return (
                <Fragment key={row.companyId}>
                  <tr className="border-b border-slate-100">
                    <td className="py-2 pr-3">
                      <button
                        onClick={() => toggle(row.companyId)}
                        className="flex items-center gap-1 text-slate-400 hover:text-slate-700"
                        title={hasRemarks ? "Has remarks" : "Expand for detail & remarks"}
                      >
                        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        {hasRemarks && !isOpen && <MessageSquare className="h-3 w-3 text-brand-500" />}
                      </button>
                    </td>
                    <td className="py-2 pr-3 font-medium text-slate-700">{row.companyName}</td>
                    <td className="py-2 pr-3 text-right">{formatCurrency(row.annualTarget)}</td>
                    <td className="py-2 pr-3 text-right">{formatCurrency(row.quarterTarget)}</td>
                    <td className="py-2 pr-3 text-right">{formatCurrency(row.quarterActual.total)}</td>
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
                        <div className="mb-4 grid grid-cols-2 gap-x-8 gap-y-1 text-xs text-slate-600 sm:grid-cols-4">
                          <div>
                            <span className="font-medium text-slate-500">Revenue Internal:</span>{" "}
                            {formatCurrency(row.quarterActual.internal)}
                          </div>
                          <div>
                            <span className="font-medium text-slate-500">Revenue External:</span>{" "}
                            {formatCurrency(row.quarterActual.external)}
                          </div>
                          <div>
                            <span className="font-medium text-slate-500">Collections Internal:</span>{" "}
                            {formatCurrency(row.quarterActual.collectionsInternal)}
                          </div>
                          <div>
                            <span className="font-medium text-slate-500">Collections External:</span>{" "}
                            {formatCurrency(row.quarterActual.collectionsExternal)}
                          </div>
                          <div>
                            <span className="font-medium text-slate-500">Expenses Internal:</span>{" "}
                            {formatCurrency(row.quarterActual.expensesInternal)}
                          </div>
                          <div>
                            <span className="font-medium text-slate-500">Expenses External:</span>{" "}
                            {formatCurrency(row.quarterActual.expensesExternal)}
                          </div>
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                          <RemarksInput row={row} field="revenueRemarks" label="Revenue Remarks" />
                          <RemarksInput row={row} field="collectionsRemarks" label="Collections Remarks" />
                          <RemarksInput row={row} field="expensesRemarks" label="Expenses Remarks" />
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
                  No company data for this scope yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
