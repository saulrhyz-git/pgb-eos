import { Layers } from "lucide-react";
import type { StreamBreakdown, StreamCategory } from "../api/types";
import { formatCurrency, formatCurrencyShort, formatPct } from "../utils/format";
import { fieldShortLabel, STREAM_CATEGORY_LABEL, STREAM_FIELDS } from "../utils/streams";

// "Where does this total come from?" — the category total for the current
// Financials scope, split into the original figures plus each labeled
// Financial Stream, with each line's share and its own Internal/External (or
// Earned/Unearned/Others) split. Data comes from the dashboard response's
// streamBreakdown (server/src/utils/streams.ts), already masked per category.
// Hidden when no stream has any amount in scope, so pages look exactly as
// before until streams are actually used.
export default function StreamBreakdownCard({ breakdown, category }: { breakdown?: StreamBreakdown[]; category: StreamCategory }) {
  const b = breakdown?.find((x) => x.category === category);
  if (!b || b.lines.length <= 1) return null;

  const fields = STREAM_FIELDS[category];
  const showSplit = fields.length > 1;
  const label = STREAM_CATEGORY_LABEL[category];

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 shadow-sm sm:p-4">
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
        <Layers className="h-4 w-4" /> {label} by Stream
      </div>
      <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
        How the {label.toLowerCase()} total above is made up: the original figures plus each labeled stream. Streams are included in every
        total and attainment figure.
      </p>

      {/* Share bar */}
      {b.total > 0 && (
        <div className="mb-4 flex h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden>
          {b.lines.map((l, i) =>
            l.total > 0 ? (
              <div
                key={l.streamId ?? "base"}
                title={`${l.label}: ${formatPct((l.total / b.total) * 100)}`}
                style={{ width: `${(l.total / b.total) * 100}%` }}
                className={i === 0 ? "bg-slate-400 dark:bg-slate-500" : i % 2 ? "bg-brand-500" : "bg-brand-300 dark:bg-brand-400"}
              />
            ) : null
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className={`w-full text-sm ${showSplit ? "min-w-[640px]" : "min-w-[420px]"}`}>
          <thead className="border-b border-slate-200 dark:border-slate-700 text-left text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
            <tr>
              <th className="px-3 py-2">Stream</th>
              <th className="px-3 py-2">Defined for</th>
              {showSplit && fields.map((f) => <th key={f.key} className="px-3 py-2 text-right">{fieldShortLabel(category, f.key)}</th>)}
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2 text-right">Share</th>
            </tr>
          </thead>
          <tbody className="text-slate-700 dark:text-slate-200">
            {b.lines.map((l) => (
              <tr key={l.streamId ?? "base"} className="border-b border-slate-100 dark:border-slate-800 last:border-0">
                <td className="px-3 py-2 font-medium">
                  {l.label}
                  {!l.active && <span className="ml-1.5 text-xs font-normal text-slate-400">(inactive)</span>}
                </td>
                <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                  {l.scope === "BASE" ? "—" : l.scope === "BUSINESS_UNIT" ? `All of ${l.scopeName}` : l.scopeName}
                </td>
                {showSplit &&
                  fields.map((f) => (
                    <td key={f.key} className="px-3 py-2 text-right tabular-nums" title={formatCurrency(l.parts[f.key] || 0)}>
                      {formatCurrencyShort(l.parts[f.key] || 0)}
                    </td>
                  ))}
                <td className="px-3 py-2 text-right font-semibold tabular-nums" title={formatCurrency(l.total)}>
                  {formatCurrencyShort(l.total)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{b.total ? formatPct((l.total / b.total) * 100) : "—"}</td>
              </tr>
            ))}
            <tr className="bg-slate-50 dark:bg-slate-800/60 font-semibold">
              <td className="px-3 py-2">Total {label}</td>
              <td />
              {showSplit &&
                fields.map((f) => (
                  <td key={f.key} className="px-3 py-2 text-right tabular-nums">
                    {formatCurrencyShort(b.lines.reduce((s, l) => s + (l.parts[f.key] || 0), 0))}
                  </td>
                ))}
              <td className="px-3 py-2 text-right tabular-nums" title={formatCurrency(b.total)}>
                {formatCurrencyShort(b.total)}
              </td>
              <td className="px-3 py-2 text-right">100%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
