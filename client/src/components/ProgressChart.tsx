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
import { useTheme } from "../contexts/ThemeContext";

type Breakdown = "combined" | "internal-external";

interface Props {
  chart: ChartPoint[];
}

export default function ProgressChart({ chart }: Props) {
  const [breakdown, setBreakdown] = useState<Breakdown>("combined");
  // Recharts renders its grid/axis text as raw SVG attributes, not Tailwind
  // classes, so dark: variants can't reach them — they need an explicit
  // color picked in JS based on the active theme instead. The light-mode
  // colors (#e2e8f0 grid, #64748b tick text) are Tailwind slate-200/slate-500;
  // the dark-mode ones are slate-700/slate-400, so the grid/labels stay at
  // the same relative contrast against the card background in both themes.
  const { theme } = useTheme();
  const gridColor = theme === "dark" ? "#334155" : "#e2e8f0";
  const tickColor = theme === "dark" ? "#94a3b8" : "#64748b";

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
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 shadow-sm sm:p-4">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Quarterly Revenue vs Target</h3>
        <div className="flex rounded-md border border-slate-200 dark:border-slate-700 p-0.5 text-xs">
          <button
            onClick={() => setBreakdown("combined")}
            className={`flex-1 rounded px-2 py-1 ${breakdown === "combined" ? "bg-brand-500 text-white" : "text-slate-500 dark:text-slate-400"}`}
          >
            Combined
          </button>
          <button
            onClick={() => setBreakdown("internal-external")}
            className={`flex-1 rounded px-2 py-1 ${breakdown === "internal-external" ? "bg-brand-500 text-white" : "text-slate-500 dark:text-slate-400"}`}
          >
            Internal vs External
          </button>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={280} minWidth={0}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: tickColor }} />
          <YAxis tickFormatter={(v) => formatCurrency(v)} tick={{ fontSize: 10, fill: tickColor }} width={64} />
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
