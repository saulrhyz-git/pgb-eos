import { useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartPoint } from "../api/types";
import { formatCurrency } from "../utils/format";

type Breakdown = "combined" | "internal-external";

interface Props {
  chart: ChartPoint[];
}

export default function ProgressChart({ chart }: Props) {
  const [breakdown, setBreakdown] = useState<Breakdown>("combined");

  const data = useMemo(
    () =>
      chart.map((c) => ({
        label: c.label,
        Target: c.targetTotal,
        Actual: c.actualTotal,
        "Target (Internal)": c.targetInternal,
        "Target (External)": c.targetExternal,
        "Actual (Internal)": c.actualInternal,
        "Actual (External)": c.actualExternal,
      })),
    [chart]
  );

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">Quarterly Revenue vs Target</h3>
        <div className="flex rounded-md border border-slate-200 p-0.5 text-xs">
          <button
            onClick={() => setBreakdown("combined")}
            className={`rounded px-2 py-1 ${breakdown === "combined" ? "bg-brand-500 text-white" : "text-slate-500"}`}
          >
            Combined
          </button>
          <button
            onClick={() => setBreakdown("internal-external")}
            className={`rounded px-2 py-1 ${breakdown === "internal-external" ? "bg-brand-500 text-white" : "text-slate-500"}`}
          >
            Internal vs External
          </button>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} />
          <YAxis tickFormatter={(v) => formatCurrency(v)} tick={{ fontSize: 11 }} width={90} />
          <Tooltip formatter={(v: number) => formatCurrency(v)} />
          <Legend />
          {breakdown === "combined" ? (
            <>
              <Bar dataKey="Actual" fill="#3b5fe0" radius={[4, 4, 0, 0]} barSize={36} />
              <Line type="monotone" dataKey="Target" stroke="#f97316" strokeWidth={2} dot={{ r: 4 }} />
            </>
          ) : (
            <>
              <Bar dataKey="Actual (Internal)" stackId="actual" fill="#3b5fe0" radius={[4, 4, 0, 0]} barSize={36} />
              <Bar dataKey="Actual (External)" stackId="actual" fill="#93c5fd" radius={[4, 4, 0, 0]} barSize={36} />
              <Line type="monotone" dataKey="Target (Internal)" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="Target (External)" stroke="#fb923c" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 3 }} />
            </>
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
