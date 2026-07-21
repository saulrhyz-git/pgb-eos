import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { api } from "../api/client";
import type { NoteCategoryType, NoteEntry } from "../api/types";
import { formatCurrency } from "../utils/format";

interface Props {
  title: string;
  type: NoteCategoryType;
  yearId: string;
  quarter: number;
  businessUnitId?: string;
  companyId?: string;
}

// Read-only listing of every notable Expense/Disbursement line item logged
// for the current Financials scope — the growable, informational-only
// record-keeping facility entered on the Data Entry page (see
// IntegratorPortal.tsx's NotableItemsCard). Purely a lookup: nothing here
// feeds any KPI/attainment/AI Analysis figure, and there's no add/edit/
// delete UI here — that only happens on Data Entry. Shared between
// ExpensesTab.tsx and DisbursementsTab.tsx, which just pick a different
// `type` and title.
export default function NotableItemsList({ title, type, yearId, quarter, businessUnitId, companyId }: Props) {
  const [notes, setNotes] = useState<NoteEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!yearId) return;
    setLoading(true);
    setError("");
    const fetcher = type === "EXPENSE" ? api.expenseNotes : api.disbursementNotes;
    fetcher({ yearId, quarter: quarter || undefined, businessUnitId: businessUnitId || undefined, companyId: companyId || undefined })
      .then(setNotes)
      .catch((err) => setError(err.message || "Failed to load notable items"))
      .finally(() => setLoading(false));
  }, [type, yearId, quarter, businessUnitId, companyId]);

  // quarter === 0 means "All Quarters" (full year) — show a Quarter column
  // in that case, since rows can then span more than one.
  const isAllQuarters = quarter === 0;

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 shadow-sm sm:p-4">
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
        <FileText className="h-4 w-4" /> {title}
      </div>
      <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
        Informational only — logged for record-keeping on the Data Entry page. Never included in any total, target, or
        attainment figure above.
      </p>

      {error && <div className="mb-3 rounded-md bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs text-red-600 dark:text-red-400">{error}</div>}

      {loading ? (
        <div className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">Loading...</div>
      ) : notes.length === 0 ? (
        <div className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">No notable items logged for this scope.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-xs font-medium uppercase text-slate-500 dark:text-slate-400">
                <th className="py-2 pr-3">Company</th>
                {isAllQuarters && <th className="py-2 pr-3">Quarter</th>}
                <th className="py-2 pr-3">Category</th>
                <th className="py-2 pr-3 text-right">Amount</th>
                <th className="py-2 pr-3">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {notes.map((n) => (
                <tr key={n.id}>
                  <td className="py-2 pr-3 font-medium text-slate-700 dark:text-slate-200">{n.company?.name ?? "—"}</td>
                  {isAllQuarters && <td className="py-2 pr-3 text-slate-600 dark:text-slate-300">Q{n.quarter}</td>}
                  <td className="py-2 pr-3 text-slate-600 dark:text-slate-300">{n.category.label}</td>
                  <td className="py-2 pr-3 text-right text-slate-700 dark:text-slate-200">{formatCurrency(n.amount)}</td>
                  <td className="py-2 pr-3 text-slate-500 dark:text-slate-400">{n.remarks || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
