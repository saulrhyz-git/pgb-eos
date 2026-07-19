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
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-semibold text-slate-700">Quarterly Revenue vs Target</h3>
        <div className="flex rounded-md border border-slate-200 p-0.5 text-xs">
          <button
            onClick={() => setBreakdown("combined")}
            className={`flex-1 rounded px-2 py-1 ${breakdown === "combined" ? "bg-brand-500 text-white" : "text-slate-500"}`}
          >
            Combined
          </button>
          <button
            onClick={() => setBreakdown("internal-external")}
            className={`flex-1 rounded px-2 py-1 ${breakdown === "internal-external" ? "bg-brand-500 text-white" : "text-slate-500"}`}
          >
            Internal vs External
          </button>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={280} minWidth={0}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={(v) => formatCurrency(v)} tick={{ fontSize: 10 }} width={64} />
          <Tooltip formatter={(v: number) => formatCurrency(v)} />
          <Legend />
          {breakdown === "combined" ? (
            <>
              <Bar dataKey="Actual" fill="#2563eb" radius={[4, 4, 0, 0]} barSize={36} />
              <Line type="monotone" dataKey="Target" stroke="#ea580c" strokeWidth={2.5} dot={{ r: 4 }} />
            </>
          ) : (
            <>
              <Bar dataKey="Actual (Internal)" stackId="actual" fill="#2563eb" radius={[4, 4, 0, 0]} barSize={36} />
              <Bar dataKey="Actual (External)" stackId="actual" fill="#93c5fd" radius={[4, 4, 0, 0]} barSize={36} />
              {/* Internal/External target lines use clearly distinct hues (not
                  just lighter/darker shades of the same orange) so they stay
                  readable against each other and against the blue bars. */}
              <Line type="monotone" dataKey="Target (Internal)" stroke="#ea580c" strokeWidth={2.5} dot={{ r: 3 }} />
              <Line
                type="monotone"
                dataKey="Target (External)"
                stroke="#a21caf"
                strokeWidth={2.5}
                strokeDasharray="5 3"
                dot={{ r: 3 }}
              />
            </>
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
