import { useEffect, useState } from "react";
import { MessageSquare } from "lucide-react";
import { api } from "../api/client";
import type { DisbursementActual } from "../api/types";
import { formatCurrency } from "../utils/format";

interface Props {
  yearId: string;
  quarter: number;
  businessUnitId?: string;
  companyId?: string;
}

// Read-only listing of Disbursements' own per-Company/Quarter Remarks field
// (DisbursementActual.remarks — entered alongside the amount itself on the
// Data Entry page), filtered to rows that actually have one. Revenue,
// Collections, and Expenses already surface this same kind of remarks
// inline in OperationalGrid.tsx (expand a Business Unit row); Disbursements
// isn't targeted so it has no Operational Grid to expand, and this field
// was otherwise never shown anywhere on the dashboard. Separate from —
// and simpler than — NotableItemsList.tsx's categorized "Notable
// Disbursement Items", which is a different, growable list of ad-hoc line
// items (DisbursementNote) rather than the one plain Remarks field on the
// actual itself.
export default function DisbursementRemarksList({ yearId, quarter, businessUnitId, companyId }: Props) {
  const [rows, setRows] = useState<DisbursementActual[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!yearId) return;
    setLoading(true);
    setError("");
    api
      .disbursements({ yearId, quarter: quarter || undefined, businessUnitId: businessUnitId || undefined, companyId: companyId || undefined })
      .then((all) => setRows(all.filter((r) => r.remarks)))
      .catch((err) => setError(err.message || "Failed to load disbursement remarks"))
      .finally(() => setLoading(false));
  }, [yearId, quarter, businessUnitId, companyId]);

  // quarter === 0 means "All Quarters" (full year) — show a Quarter column
  // in that case, since rows can then span more than one.
  const isAllQuarters = quarter === 0;

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 shadow-sm sm:p-4">
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
        <MessageSquare className="h-4 w-4" /> Disbursement Remarks
      </div>
      <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
        Remarks entered alongside each Company's Disbursements amount on the Data Entry page. Only shown here when
        there's something entered.
      </p>

      {error && <div className="mb-3 rounded-md bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs text-red-600 dark:text-red-400">{error}</div>}

      {loading ? (
        <div className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">Loading...</div>
      ) : rows.length === 0 ? (
        <div className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">No disbursement remarks for this scope.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-xs font-medium uppercase text-slate-500 dark:text-slate-400">
                <th className="py-2 pr-3">Company</th>
                {isAllQuarters && <th className="py-2 pr-3">Quarter</th>}
                <th className="py-2 pr-3 text-right">Amount</th>
                <th className="py-2 pr-3">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="py-2 pr-3 font-medium text-slate-700 dark:text-slate-200">{r.company?.name ?? "—"}</td>
                  {isAllQuarters && <td className="py-2 pr-3 text-slate-600 dark:text-slate-300">Q{r.quarter}</td>}
                  <td className="py-2 pr-3 text-right text-slate-700 dark:text-slate-200">{formatCurrency(r.amount)}</td>
                  <td className="py-2 pr-3 text-slate-500 dark:text-slate-400">{r.remarks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
