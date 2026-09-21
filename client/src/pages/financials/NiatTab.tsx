import { Fragment, useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import { FlaskConical, Scale } from "lucide-react";
import { formatCurrency, formatCurrencyShort, formatPct } from "../../utils/format";
import { computeNiat, sumNiat, type NiatResult } from "../../utils/niat";
import type { FinancialsOutletContext } from "./FinancialsLayout";

interface CompanyNiatRow extends NiatResult {
  companyId: string;
  companyName: string;
  businessUnitId: string;
  businessUnitName: string;
}

// NIAT (Net Income After Taxes) sub-tab — see utils/niat.ts for the actual
// Philippine corporate tax computation (RCIT vs MCIT, higher of the two)
// and, importantly, the specific simplifications it makes given what this
// app currently tracks. This tab computes entirely from the same
// data.operationalGrid the other 3 sub-tabs already have via
// FinancialsOutletContext — no separate fetch, since Revenue and Expenses
// per Company are already right there (and already masked by whatever
// REVENUE/EXPENSES view permissions the viewer has, same as everywhere
// else in Financials).
export default function NiatTab() {
  const { data } = useOutletContext<FinancialsOutletContext>();

  const rows: CompanyNiatRow[] = useMemo(() => {
    if (!data) return [];
    const out: CompanyNiatRow[] = [];
    for (const bu of data.operationalGrid) {
      for (const c of bu.companies) {
        out.push({
          companyId: c.companyId,
          companyName: c.companyName,
          businessUnitId: bu.businessUnitId,
          businessUnitName: bu.businessUnitName,
          ...computeNiat(c.quarterActual.total, c.quarterActual.expenses),
        });
      }
    }
    return out;
  }, [data]);

  const total = useMemo(() => sumNiat(rows), [rows]);
  const totalMarginPct = total.revenue > 0 ? (total.niat / total.revenue) * 100 : 0;

  const byBu = useMemo(() => {
    const map = new Map<string, { businessUnitName: string; rows: CompanyNiatRow[] }>();
    for (const r of rows) {
      const entry = map.get(r.businessUnitId) ?? { businessUnitName: r.businessUnitName, rows: [] };
      entry.rows.push(r);
      map.set(r.businessUnitId, entry);
    }
    return [...map.entries()].sort((a, b) => a[1].businessUnitName.localeCompare(b[1].businessUnitName));
  }, [rows]);

  if (!data) return null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
        <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          <strong>BETA.</strong> NIAT is computed as the higher of RCIT (25%, or 20% for smaller companies) and MCIT (2% of
          revenue) applied to Revenue − Expenses, per Philippine corporate tax rules — but without a few inputs this app
          doesn't track yet (total assets, a Cost-of-Sales/OPEX split, and each company's years in operation), so treat
          these figures as an approximation rather than a filed return.
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm sm:p-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Net Income Before Tax</div>
          <div className="mt-2 text-2xl font-bold text-slate-800 dark:text-slate-100" title={formatCurrency(total.netIncomeBeforeTax)}>
            {formatCurrencyShort(total.netIncomeBeforeTax)}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm sm:p-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Tax Due</div>
          <div className="mt-2 text-2xl font-bold text-amber-600 dark:text-amber-400" title={formatCurrency(total.taxDue)}>
            {formatCurrencyShort(total.taxDue)}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm sm:p-6">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <Scale className="h-3.5 w-3.5" /> NIAT
          </div>
          <div
            className={`mt-2 text-2xl font-bold ${total.niat >= 0 ? "text-slate-800 dark:text-slate-100" : "text-red-600 dark:text-red-400"}`}
            title={formatCurrency(total.niat)}
          >
            {formatCurrencyShort(total.niat)}
          </div>
          <div className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">{formatPct(Math.abs(totalMarginPct))} net margin</div>
        </div>
      </div>

      {byBu.length === 0 ? (
        <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">No Companies in this scope.</div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead className="bg-slate-50 dark:bg-slate-950 text-left text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3 text-right">Revenue</th>
                  <th className="px-4 py-3 text-right">Expenses</th>
                  <th className="px-4 py-3 text-right">Net Income Before Tax</th>
                  <th className="px-4 py-3 text-right">RCIT</th>
                  <th className="px-4 py-3 text-right">MCIT</th>
                  <th className="px-4 py-3 text-right">Tax Due</th>
                  <th className="px-4 py-3 text-right">NIAT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {byBu.map(([buId, group]) => (
                  <Fragment key={buId}>
                    <tr className="bg-slate-50/60 dark:bg-slate-950/40">
                      <td colSpan={8} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {group.businessUnitName}
                      </td>
                    </tr>
                    {group.rows.map((r) => (
                      <tr key={r.companyId}>
                        <td className="px-4 py-3 pl-6 font-medium text-slate-800 dark:text-slate-100">{r.companyName}</td>
                        <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">{formatCurrencyShort(r.revenue)}</td>
                        <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">{formatCurrencyShort(r.expenses)}</td>
                        <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">{formatCurrencyShort(r.netIncomeBeforeTax)}</td>
                        <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">
                          {formatCurrencyShort(r.rcit)}
                          <span className="ml-1 text-xs text-slate-400 dark:text-slate-500">({r.rcitRate === 0.2 ? "20%" : "25%"})</span>
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">{formatCurrencyShort(r.mcit)}</td>
                        <td className="px-4 py-3 text-right font-medium text-amber-700 dark:text-amber-400">
                          {formatCurrencyShort(r.taxDue)}
                          {r.usedMcit && <span className="ml-1 text-xs text-slate-400 dark:text-slate-500">(MCIT)</span>}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-semibold ${r.niat >= 0 ? "text-slate-800 dark:text-slate-100" : "text-red-600 dark:text-red-400"}`}
                        >
                          {formatCurrencyShort(r.niat)}
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
