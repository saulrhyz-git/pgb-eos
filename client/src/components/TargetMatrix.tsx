import { Fragment } from "react";
import type { TargetMatrixRow } from "../api/types";
import { formatCurrency } from "../utils/format";

interface Props {
  rows: TargetMatrixRow[];
}

// Same category → color mapping as the KPI cards (Revenue = blue,
// Collections = emerald, Expenses = amber) so the two are easy to
// cross-reference at a glance.
const CATEGORIES: { key: "revenue" | "collections" | "expenses"; label: string; dot: string; text: string }[] = [
  { key: "revenue", label: "Revenue", dot: "bg-blue-500", text: "text-blue-700" },
  { key: "collections", label: "Collections", dot: "bg-emerald-500", text: "text-emerald-700" },
  { key: "expenses", label: "Expenses", dot: "bg-amber-500", text: "text-amber-700" },
];

export default function TargetMatrix({ rows }: Props) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
      <h3 className="mb-4 text-sm font-semibold text-slate-700">Target Distribution Matrix (Quarter targets per Business Unit)</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase text-slate-500">
              <th className="py-2 pr-3">Business Unit</th>
              <th className="py-2 pr-3">Category</th>
              <th className="py-2 pr-3 text-right">Q1</th>
              <th className="py-2 pr-3 text-right">Q2</th>
              <th className="py-2 pr-3 text-right">Q3</th>
              <th className="py-2 pr-3 text-right">Q4</th>
              <th className="py-2 text-right">Annual Target</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Fragment key={row.businessUnitId}>
                {CATEGORIES.map((cat, i) => (
                  <tr
                    key={`${row.businessUnitId}-${cat.key}`}
                    className={`border-b border-slate-100 ${i === CATEGORIES.length - 1 ? "last:border-0" : ""}`}
                  >
                    {i === 0 && (
                      <td className="py-2 pr-3 align-top font-medium text-slate-700" rowSpan={CATEGORIES.length}>
                        {row.businessUnitName}
                      </td>
                    )}
                    <td className={`py-2 pr-3 font-medium ${cat.text}`}>
                      <span className="inline-flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full ${cat.dot}`} />
                        {cat.label}
                      </span>
                    </td>
                    {row.quarterTargets.map((q) => (
                      <td key={q.quarter} className="py-2 pr-3 text-right text-slate-600">
                        {formatCurrency(q[cat.key])}
                      </td>
                    ))}
                    <td className="py-2 text-right font-medium text-slate-700">{formatCurrency(row.annualTarget[cat.key])}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-slate-500">
                  No target data for this scope yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
