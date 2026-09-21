import { HandCoins } from "lucide-react";
import type { Kpis } from "../api/types";
import { formatCurrency, formatCurrencyShort } from "../utils/format";

interface Props {
  kpis: Kpis;
  quarter: number;
}

// Disbursements are recorded, not targeted, so — unlike KpiCards.tsx's
// Revenue/Collections/Expenses cards — this is a single running actual
// total rather than a Target/Actual pair. Used to be three sub-category
// cards (Advances/Loan Repayments/Interests); collapsed to one, the same
// way the underlying figure was. Any significant sub-items are now logged
// separately via the growable "notable line items" facility on the Data
// Entry page (DisbursementNote), which doesn't roll up into this card.

export default function DisbursementCards({ kpis, quarter }: Props) {
  // quarter === 0 means "All Quarters" (full year) was selected in the filter bar.
  const periodLabel = quarter === 0 ? "Full Year" : `Q${quarter}`;
  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/40 p-4 shadow-sm">
        <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400">
          <HandCoins className="h-4 w-4" />
          <span className="text-xs font-medium uppercase tracking-wide">{periodLabel} Disbursements</span>
        </div>
        <div className="mt-2 text-2xl font-semibold text-purple-900 dark:text-purple-100" title={formatCurrency(kpis.quarterDisbursementsActual)}>
          {formatCurrencyShort(kpis.quarterDisbursementsActual)}
        </div>
      </div>
    </div>
  );
}
