import { PhilippinePeso, Wallet, Receipt, TrendingUp, CalendarRange } from "lucide-react";
import type { Kpis } from "../api/types";
import { attainmentColor, formatCurrency, formatPct } from "../utils/format";

interface Props {
  kpis: Kpis;
  quarter: number;
}

// Consistent per-category colors so a card can be matched at a glance across
// the Annual row and the Quarterly row below it — Revenue is blue,
// Collections is emerald/green, Expenses is amber. Cards that aren't tied to
// one category (the Actual cards) stay neutral.
type Tone = "revenue" | "collections" | "expenses" | "neutral";
const TONES: Record<Tone, { bg: string; border: string; icon: string; value: string }> = {
  revenue: { bg: "bg-blue-50", border: "border-blue-200", icon: "text-blue-600", value: "text-blue-900" },
  collections: { bg: "bg-emerald-50", border: "border-emerald-200", icon: "text-emerald-600", value: "text-emerald-900" },
  expenses: { bg: "bg-amber-50", border: "border-amber-200", icon: "text-amber-600", value: "text-amber-900" },
  neutral: { bg: "bg-white", border: "border-slate-200", icon: "text-slate-500", value: "text-slate-800" },
};

function Card({
  icon,
  label,
  value,
  sub,
  subColor,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  subColor?: string;
  tone?: Tone;
}) {
  const t = TONES[tone];
  return (
    <div className={`rounded-lg border ${t.border} ${t.bg} p-4 shadow-sm`}>
      <div className={`flex items-center gap-2 ${t.icon}`}>
        {icon}
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <div className={`mt-2 text-2xl font-semibold ${t.value}`}>{value}</div>
      {sub && <div className={`mt-1 text-sm font-medium ${subColor || "text-slate-500"}`}>{sub}</div>}
    </div>
  );
}

export default function KpiCards({ kpis, quarter }: Props) {
  // quarter === 0 means "All Quarters" (full year) was selected in the filter bar.
  const periodLabel = quarter === 0 ? "Full Year" : `Q${quarter}`;
  return (
    <div className="flex flex-col gap-4">
      {/* Annual targets by category — a straight sum of every in-scope Company's
          Q1-Q4 Quarter Target, unaffected by the Quarter filter above. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card
          tone="revenue"
          icon={<PhilippinePeso className="h-4 w-4" />}
          label="Annual Revenue Target"
          value={formatCurrency(kpis.annualRevenueTarget)}
        />
        <Card
          tone="collections"
          icon={<Wallet className="h-4 w-4" />}
          label="Annual Collections Target"
          value={formatCurrency(kpis.annualCollectionsTarget)}
        />
        <Card
          tone="expenses"
          icon={<Receipt className="h-4 w-4" />}
          label="Annual Expenses Target"
          value={formatCurrency(kpis.annualExpensesTarget)}
        />
      </div>

      {/* Quarterly targets by category for the selected period — these DO
          change with the Quarter filter above (unlike the Annual row). */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card
          tone="revenue"
          icon={<PhilippinePeso className="h-4 w-4" />}
          label={`${periodLabel} Revenue Target`}
          value={formatCurrency(kpis.quarterTarget)}
        />
        <Card
          tone="collections"
          icon={<Wallet className="h-4 w-4" />}
          label={`${periodLabel} Collections Target`}
          value={formatCurrency(kpis.quarterCollectionsTarget)}
        />
        <Card
          tone="expenses"
          icon={<Receipt className="h-4 w-4" />}
          label={`${periodLabel} Expenses Target`}
          value={formatCurrency(kpis.quarterExpensesTarget)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card
          icon={<TrendingUp className="h-4 w-4" />}
          label={`${periodLabel} Actual`}
          value={formatCurrency(kpis.quarterActual)}
          sub={`${formatPct(kpis.attainmentPct)} attainment`}
          subColor={attainmentColor(kpis.attainmentPct)}
        />
        <Card
          icon={<CalendarRange className="h-4 w-4" />}
          label="Year-to-Date Actual"
          value={formatCurrency(kpis.ytdActual)}
          sub={`${formatPct(kpis.ytdAttainmentPct)} of YTD target`}
          subColor={attainmentColor(kpis.ytdAttainmentPct)}
        />
      </div>
    </div>
  );
}
