import { HandCoins, Landmark, Percent } from "lucide-react";
import type { Kpis } from "../api/types";
import { formatCurrency, formatCurrencyShort } from "../utils/format";

interface Props {
  kpis: Kpis;
  quarter: number;
}

// Disbursements are recorded, not targeted, so — unlike KpiCards.tsx's
// Revenue/Collections/Expenses cards — these are a single running actual
// total per sub-category rather than a Target/Actual pair. Distinct tones
// (purple/cyan/rose) keep this row visually separate from the Revenue row's
// blue/emerald/amber above it.
type Tone = "advances" | "loans" | "interests";
const TONES: Record<Tone, { bg: string; border: string; icon: string; value: string }> = {
  advances: { bg: "bg-purple-50 dark:bg-purple-950/40", border: "border-purple-200 dark:border-purple-800", icon: "text-purple-600 dark:text-purple-400", value: "text-purple-900 dark:text-purple-100" },
  loans: { bg: "bg-cyan-50 dark:bg-cyan-950/40", border: "border-cyan-200 dark:border-cyan-800", icon: "text-cyan-600 dark:text-cyan-400", value: "text-cyan-900 dark:text-cyan-100" },
  interests: { bg: "bg-rose-50 dark:bg-rose-950/40", border: "border-rose-200 dark:border-rose-800", icon: "text-rose-600 dark:text-rose-400", value: "text-rose-900 dark:text-rose-100" },
};

function Card({
  icon,
  label,
  value,
  fullValue,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  // Full, non-abbreviated value shown as a tooltip on hover — same
  // shorthand-on-card / exact-on-hover convention as KpiCards.tsx.
  fullValue: string;
  tone: Tone;
}) {
  const t = TONES[tone];
  return (
    <div className={`rounded-lg border ${t.border} ${t.bg} p-4 shadow-sm`}>
      <div className={`flex items-center gap-2 ${t.icon}`}>
        {icon}
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <div className={`mt-2 text-2xl font-semibold ${t.value}`} title={fullValue}>
        {value}
      </div>
    </div>
  );
}

export default function DisbursementCards({ kpis, quarter }: Props) {
  // quarter === 0 means "All Quarters" (full year) was selected in the filter bar.
  const periodLabel = quarter === 0 ? "Full Year" : `Q${quarter}`;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <Card
        tone="advances"
        icon={<HandCoins className="h-4 w-4" />}
        label={`${periodLabel} Advances`}
        value={formatCurrencyShort(kpis.quarterAdvancesActual)}
        fullValue={formatCurrency(kpis.quarterAdvancesActual)}
      />
      <Card
        tone="loans"
        icon={<Landmark className="h-4 w-4" />}
        label={`${periodLabel} Loan Repayments`}
        value={formatCurrencyShort(kpis.quarterLoansActual)}
        fullValue={formatCurrency(kpis.quarterLoansActual)}
      />
      <Card
        tone="interests"
        icon={<Percent className="h-4 w-4" />}
        label={`${periodLabel} Interests`}
        value={formatCurrencyShort(kpis.quarterInterestsActual)}
        fullValue={formatCurrency(kpis.quarterInterestsActual)}
      />
    </div>
  );
}
