import type { TargetMatrixRow } from "../api/types";
import { formatCurrency } from "../utils/format";

interface Props {
  rows: TargetMatrixRow[];
}

export default function TargetMatrix({ rows }: Props) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold text-slate-700">Target Distribution Matrix (Annual vs Quarter, per Business Unit)</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase text-slate-400">
              <th className="py-2 pr-3">Business Unit</th>
              <th className="py-2 pr-3 text-right">Annual Target</th>
              <th className="py-2 pr-3 text-right">Q1</th>
              <th className="py-2 pr-3 text-right">Q2</th>
              <th className="py-2 pr-3 text-right">Q3</th>
              <th className="py-2 pr-3 text-right">Q4</th>
              <th className="py-2 pr-3 text-right">Distributed Total</th>
              <th className="py-2 text-right">Variance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.businessUnitId} className="border-b border-slate-100 last:border-0">
                <td className="py-2 pr-3 font-medium text-slate-700">{row.businessUnitName}</td>
                <td className="py-2 pr-3 text-right">{formatCurrency(row.annualTarget.total)}</td>
                {row.quarterTargets.map((q) => (
                  <td key={q.quarter} className="py-2 pr-3 text-right text-slate-600">
                    {formatCurrency(q.total)}
                  </td>
                ))}
                <td className="py-2 pr-3 text-right text-slate-600">{formatCurrency(row.distributedTotal)}</td>
                <td
                  className={`py-2 text-right font-medium ${
                    Math.abs(row.varianceFromAnnual) < 1 ? "text-slate-400" : "text-amber-600"
                  }`}
                >
                  {row.varianceFromAnnual === 0 ? "—" : formatCurrency(row.varianceFromAnnual)}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="py-6 text-center text-slate-400">
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
