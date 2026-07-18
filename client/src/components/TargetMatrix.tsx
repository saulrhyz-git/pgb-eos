import type { TargetMatrixRow } from "../api/types";
import { formatCurrency } from "../utils/format";

interface Props {
  rows: TargetMatrixRow[];
}

export default function TargetMatrix({ rows }: Props) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold text-slate-700">Target Distribution Matrix (Quarter targets per Business Unit)</h3>
      <p className="mb-4 text-xs text-slate-500">
        Annual Target is always the sum of Q1-Q4 — it's no longer a separate entry.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase text-slate-500">
              <th className="py-2 pr-3">Business Unit</th>
              <th className="py-2 pr-3 text-right">Q1</th>
              <th className="py-2 pr-3 text-right">Q2</th>
              <th className="py-2 pr-3 text-right">Q3</th>
              <th className="py-2 pr-3 text-right">Q4</th>
              <th className="py-2 text-right">Annual Target</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.businessUnitId} className="border-b border-slate-100 last:border-0">
                <td className="py-2 pr-3 font-medium text-slate-700">{row.businessUnitName}</td>
                {row.quarterTargets.map((q) => (
                  <td key={q.quarter} className="py-2 pr-3 text-right text-slate-600">
                    {formatCurrency(q.total)}
                  </td>
                ))}
                <td className="py-2 text-right font-medium text-slate-700">{formatCurrency(row.annualTarget)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-slate-500">
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
