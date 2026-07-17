import { DollarSign, Target, TrendingUp, CalendarRange } from "lucide-react";
import type { Kpis } from "../api/types";
import { attainmentColor, formatCurrency, formatPct } from "../utils/format";

interface Props {
  kpis: Kpis;
  quarter: number;
}

function Card({
  icon,
  label,
  value,
  sub,
  subColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  subColor?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-slate-400">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold text-slate-800">{value}</div>
      {sub && <div className={`mt-1 text-sm font-medium ${subColor || "text-slate-500"}`}>{sub}</div>}
    </div>
  );
}

export default function KpiCards({ kpis, quarter }: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card
        icon={<DollarSign className="h-4 w-4" />}
        label="Total Revenue (YTD)"
        value={formatCurrency(kpis.ytdActual)}
        sub={`${formatPct(kpis.ytdAttainmentPct)} of YTD target`}
        subColor={attainmentColor(kpis.ytdAttainmentPct)}
      />
      <Card icon={<Target className="h-4 w-4" />} label={`Q${quarter} Target`} value={formatCurrency(kpis.quarterTarget)} />
      <Card
        icon={<TrendingUp className="h-4 w-4" />}
        label={`Q${quarter} Actual`}
        value={formatCurrency(kpis.quarterActual)}
        sub={`${formatPct(kpis.attainmentPct)} attainment`}
        subColor={attainmentColor(kpis.attainmentPct)}
      />
      <Card
        icon={<CalendarRange className="h-4 w-4" />}
        label="Year-to-Date Actual"
        value={formatCurrency(kpis.ytdActual)}
        sub={`Annual target ${formatCurrency(kpis.annualTarget)}`}
      />
    </div>
  );
}
