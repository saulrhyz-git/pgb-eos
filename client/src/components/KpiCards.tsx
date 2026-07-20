import { PhilippinePeso, Wallet, Receipt, TrendingUp, CalendarRange } from "lucide-react";
import type { Kpis } from "../api/types";
import { attainmentColor, formatCurrency, formatCurrencyShort, formatPct } from "../utils/format";

type Category = "REVENUE" | "COLLECTIONS" | "EXPENSES";

interface Props {
  kpis: Kpis;
  quarter: number;
  // Which category's cards to show — each Financials sub-tab renders just
  // its own category now (see FinancialsLayout.tsx), rather than one big
  // component showing all three categories at once like before.
  category?: Category;
}

// Consistent per-category colors so a card can be matched at a glance across
// the Annual row and the Quarterly row below it — Revenue is blue,
// Collections is emerald/green, Expenses is amber. Cards that aren't tied to
// one category (Actual/YTD) stay neutral.
type Tone = "revenue" | "collections" | "expenses" | "neutral";
const TONES: Record<Tone, { bg: string; border: string; icon: string; value: string }> = {
  revenue: { bg: "bg-blue-50", border: "border-blue-200", icon: "text-blue-600", value: "text-blue-900" },
  collections: { bg: "bg-emerald-50", border: "border-emerald-200", icon: "text-emerald-600", value: "text-emerald-900" },
  expenses: { bg: "bg-amber-50", border: "border-amber-200", icon: "text-amber-600", value: "text-amber-900" },
  neutral: { bg: "bg-white", border: "border-slate-200", icon: "text-slate-500", value: "text-slate-800" },
};

// Per-category config: which Kpis fields feed the cards, the tone/icon, and
// the display label. Collections/Expenses have no Annual/YTD counterpart
// beyond what's listed here (see the Kpis type comment in api/types.ts).
const CATEGORY_CONFIG: Record<
  Category,
  { label: string; tone: Tone; icon: React.ReactNode; annualTarget: keyof Kpis; quarterTarget: keyof Kpis; quarterActual: keyof Kpis; attainmentPct: keyof Kpis }
> = {
  REVENUE: {
    label: "Revenue",
    tone: "revenue",
    icon: <PhilippinePeso className="h-4 w-4" />,
    annualTarget: "annualRevenueTarget",
    quarterTarget: "quarterTarget",
    quarterActual: "quarterActual",
    attainmentPct: "attainmentPct",
  },
  COLLECTIONS: {
    label: "Collections",
    tone: "collections",
    icon: <Wallet className="h-4 w-4" />,
    annualTarget: "annualCollectionsTarget",
    quarterTarget: "quarterCollectionsTarget",
    quarterActual: "quarterCollectionsActual",
    attainmentPct: "collectionsAttainmentPct",
  },
  EXPENSES: {
    label: "Expenses",
    tone: "expenses",
    icon: <Receipt className="h-4 w-4" />,
    annualTarget: "annualExpensesTarget",
    quarterTarget: "quarterExpensesTarget",
    quarterActual: "quarterExpensesActual",
    attainmentPct: "expensesAttainmentPct",
  },
};

function Card({
  icon,
  label,
  value,
  fullValue,
  sub,
  subColor,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  // Full, non-abbreviated value shown as a tooltip on hover — lets the card
  // itself stay shorthand (e.g. "₱6.512B") while the exact figure is still
  // one hover away.
  fullValue?: string;
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
      <div className={`mt-2 text-2xl font-semibold ${t.value}`} title={fullValue}>
        {value}
      </div>
      {sub && <div className={`mt-1 text-sm font-medium ${subColor || "text-slate-500"}`}>{sub}</div>}
    </div>
  );
}

export default function KpiCards({ kpis, quarter, category = "REVENUE" }: Props) {
  // quarter === 0 means "All Quarters" (full year) was selected in the filter bar.
  const periodLabel = quarter === 0 ? "Full Year" : `Q${quarter}`;
  const cfg = CATEGORY_CONFIG[category];
  const annualTarget = kpis[cfg.annualTarget] as number;
  const quarterTarget = kpis[cfg.quarterTarget] as number;
  const quarterActual = kpis[cfg.quarterActual] as number;
  const attainmentPct = kpis[cfg.attainmentPct] as number;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card
          tone={cfg.tone}
          icon={cfg.icon}
          label={`Annual ${cfg.label} Target`}
          value={formatCurrencyShort(annualTarget)}
          fullValue={formatCurrency(annualTarget)}
        />
        <Card
          tone={cfg.tone}
          icon={cfg.icon}
          label={`${periodLabel} ${cfg.label} Target`}
          value={formatCurrencyShort(quarterTarget)}
          fullValue={formatCurrency(quarterTarget)}
        />
        <Card
          icon={<TrendingUp className="h-4 w-4" />}
          label={`${periodLabel} Actual`}
          value={formatCurrencyShort(quarterActual)}
          fullValue={formatCurrency(quarterActual)}
          sub={`${formatPct(attainmentPct)} attainment`}
          subColor={attainmentColor(attainmentPct)}
        />
      </div>

      {/* Revenue is the only category with a Year-to-Date figure — Collections
          and Expenses only ever have the Quarter Target/Actual/Attainment set
          above (see the Kpis type comment in api/types.ts). */}
      {category === "REVENUE" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card
            icon={<CalendarRange className="h-4 w-4" />}
            label="Year-to-Date Actual"
            value={formatCurrencyShort(kpis.ytdActual)}
            fullValue={formatCurrency(kpis.ytdActual)}
            sub={`${formatPct(kpis.ytdAttainmentPct)} of YTD target`}
            subColor={attainmentColor(kpis.ytdAttainmentPct)}
          />
        </div>
      )}
    </div>
  );
}
