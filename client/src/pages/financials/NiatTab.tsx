import { Fragment, useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Calculator, FlaskConical, Scale } from "lucide-react";
import { formatCurrency, formatCurrencyShort, formatPct } from "../../utils/format";
import { computeNiat, sumNiat, type NiatResult } from "../../utils/niat";
import type { FinancialsOutletContext } from "./FinancialsLayout";

// NIAT (Net Income After Taxes) sub-tab — see utils/niat.ts for the actual
// Philippine corporate tax computation (RCIT vs MCIT, higher of the two)
// and its remaining approximations. Two views, switched by the same
// Company dropdown in the FilterBar every other Financials sub-tab already
// uses:
//   - "All Companies" (no Company picked): an aggregate, single-pane-of-
//     glass view for executive reporting — every Company in scope computed
//     at default assumptions (assets exceed ₱100M, no Cost of Sales
//     entered), rolled up by Business Unit and as one grand total. Fast,
//     but not adjustable per Company.
//   - A specific Company picked: the detailed, adjustable flow — tick
//     Assets Exceed ₱100M and/or enter that Company's real Cost of Sales,
//     then press Compute.
// Both read Revenue/Expenses from the same data.operationalGrid the other
// 3 sub-tabs already have via FinancialsOutletContext — no separate fetch —
// already masked by whatever REVENUE/EXPENSES view permissions the viewer
// has, same as everywhere else in Financials.
export default function NiatTab() {
  const { data, filters } = useOutletContext<FinancialsOutletContext>();

  if (!data) return null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
        <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          <strong>BETA.</strong> NIAT is computed as the higher of RCIT (25%, or 20% if the asset and income tests both
          pass) and MCIT (2% of Gross Income) applied to Revenue − Expenses, per Philippine corporate tax rules. The
          aggregate view below assumes assets exceed ₱100M and no Cost of Sales split for every Company — pick a
          specific Company in the filter bar above to adjust those and compute its exact figure.
        </span>
      </div>

      {filters.companyId ? <SingleCompanyView data={data} companyId={filters.companyId} scopeKey={`${filters.yearId}:${filters.quarter}:${filters.businessUnitId}:${filters.companyId}`} /> : <AggregateView data={data} />}
    </div>
  );
}

// ---------- Aggregate (All Companies) view ----------

function AggregateView({ data }: { data: NonNullable<FinancialsOutletContext["data"]> }) {
  const rows = useMemo(() => {
    const out: { companyId: string; companyName: string; businessUnitId: string; businessUnitName: string; result: NiatResult }[] = [];
    for (const bu of data.operationalGrid) {
      for (const c of bu.companies) {
        out.push({
          companyId: c.companyId,
          companyName: c.companyName,
          businessUnitId: bu.businessUnitId,
          businessUnitName: bu.businessUnitName,
          result: computeNiat(c.quarterActual.total, c.quarterActual.expenses, true),
        });
      }
    }
    return out;
  }, [data]);

  const total = useMemo(() => sumNiat(rows.map((r) => r.result)), [rows]);
  const totalMarginPct = total.revenue > 0 ? (total.niat / total.revenue) * 100 : 0;

  const byBu = useMemo(() => {
    const map = new Map<string, { businessUnitName: string; rows: typeof rows }>();
    for (const r of rows) {
      const entry = map.get(r.businessUnitId) ?? { businessUnitName: r.businessUnitName, rows: [] };
      entry.rows.push(r);
      map.set(r.businessUnitId, entry);
    }
    return [...map.entries()]
      .map(([buId, group]) => ({ buId, businessUnitName: group.businessUnitName, rows: group.rows, subtotal: sumNiat(group.rows.map((r) => r.result)) }))
      .sort((a, b) => a.businessUnitName.localeCompare(b.businessUnitName));
  }, [rows]);

  return (
    <>
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
                  <th className="px-4 py-3">Business Unit / Company</th>
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
                {byBu.map((group) => (
                  <Fragment key={group.buId}>
                    <tr className="bg-slate-50/60 dark:bg-slate-950/40 font-medium">
                      <td className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                        {group.businessUnitName}
                      </td>
                      <td className="px-4 py-2 text-right text-xs text-slate-600 dark:text-slate-300">{formatCurrencyShort(group.subtotal.revenue)}</td>
                      <td className="px-4 py-2 text-right text-xs text-slate-600 dark:text-slate-300">{formatCurrencyShort(group.subtotal.expenses)}</td>
                      <td className="px-4 py-2 text-right text-xs text-slate-600 dark:text-slate-300">
                        {formatCurrencyShort(group.subtotal.netIncomeBeforeTax)}
                      </td>
                      <td className="px-4 py-2 text-right text-xs text-slate-600 dark:text-slate-300">{formatCurrencyShort(group.subtotal.rcit)}</td>
                      <td className="px-4 py-2 text-right text-xs text-slate-600 dark:text-slate-300">{formatCurrencyShort(group.subtotal.mcit)}</td>
                      <td className="px-4 py-2 text-right text-xs font-semibold text-amber-700 dark:text-amber-400">
                        {formatCurrencyShort(group.subtotal.taxDue)}
                      </td>
                      <td className="px-4 py-2 text-right text-xs font-semibold text-slate-700 dark:text-slate-200">
                        {formatCurrencyShort(group.subtotal.niat)}
                      </td>
                    </tr>
                    {group.rows.map((r) => (
                      <tr key={r.companyId}>
                        <td className="px-4 py-3 pl-6 font-medium text-slate-800 dark:text-slate-100">{r.companyName}</td>
                        <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">{formatCurrencyShort(r.result.revenue)}</td>
                        <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">{formatCurrencyShort(r.result.expenses)}</td>
                        <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">{formatCurrencyShort(r.result.netIncomeBeforeTax)}</td>
                        <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">{formatCurrencyShort(r.result.rcit)}</td>
                        <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">{formatCurrencyShort(r.result.mcit)}</td>
                        <td className="px-4 py-3 text-right font-medium text-amber-700 dark:text-amber-400">
                          {formatCurrencyShort(r.result.taxDue)}
                          {r.result.usedMcit && <span className="ml-1 text-xs text-slate-400 dark:text-slate-500">(MCIT)</span>}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-semibold ${r.result.niat >= 0 ? "text-slate-800 dark:text-slate-100" : "text-red-600 dark:text-red-400"}`}
                        >
                          {formatCurrencyShort(r.result.niat)}
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
    </>
  );
}

// ---------- Single-Company detail view ----------

function SingleCompanyView({ data, companyId, scopeKey }: { data: NonNullable<FinancialsOutletContext["data"]>; companyId: string; scopeKey: string }) {
  const selectedCompany = useMemo(() => {
    for (const bu of data.operationalGrid) {
      const c = bu.companies.find((c) => c.companyId === companyId);
      if (c) return { companyName: c.companyName, businessUnitName: bu.businessUnitName, revenue: c.quarterActual.total, expenses: c.quarterActual.expenses };
    }
    return null;
  }, [data, companyId]);

  // Assumed true by default per PHI's companies generally exceeding ₱100M
  // in total assets — untick for a specific Company where that's not the
  // case. cogsInput is raw text for smooth editing; neither this nor the
  // tickbox recompute anything on their own (that's what the Compute
  // button below is for) — changing either just clears any prior result so
  // a stale one isn't shown next to inputs that no longer match it.
  const [assetsExceed100M, setAssetsExceed100M] = useState(true);
  const [cogsInput, setCogsInput] = useState("");
  const [result, setResult] = useState<NiatResult | null>(null);

  useEffect(() => {
    // Any scope change — a different Company, or the same Company under a
    // different Year/Quarter/Business Unit — invalidates whatever was
    // previously entered/computed, since Revenue/Expenses (and so the
    // result) no longer match.
    setAssetsExceed100M(true);
    setCogsInput("");
    setResult(null);
  }, [scopeKey]);

  function handleCompute() {
    if (!selectedCompany) return;
    const n = Number(cogsInput);
    const cogs = cogsInput.trim() !== "" && !Number.isNaN(n) && n >= 0 ? n : undefined;
    setResult(computeNiat(selectedCompany.revenue, selectedCompany.expenses, assetsExceed100M, cogs));
  }

  if (!selectedCompany) {
    return (
      <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
        This Company isn't available in the current scope (it may be outside your Business Unit access, or hidden by
        your Revenue/Expenses view permissions).
      </div>
    );
  }

  return (
    <>
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm sm:p-6">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{selectedCompany.businessUnitName}</div>
        <h3 className="mb-4 text-lg font-semibold text-slate-800 dark:text-slate-100">{selectedCompany.companyName}</h3>

        <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Revenue</div>
            <div className="mt-1 text-lg font-semibold text-slate-800 dark:text-slate-100" title={formatCurrency(selectedCompany.revenue)}>
              {formatCurrencyShort(selectedCompany.revenue)}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Expenses</div>
            <div className="mt-1 text-lg font-semibold text-slate-800 dark:text-slate-100" title={formatCurrency(selectedCompany.expenses)}>
              {formatCurrencyShort(selectedCompany.expenses)}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Net Income Before Tax</div>
            <div
              className="mt-1 text-lg font-semibold text-slate-800 dark:text-slate-100"
              title={formatCurrency(selectedCompany.revenue - selectedCompany.expenses)}
            >
              {formatCurrencyShort(selectedCompany.revenue - selectedCompany.expenses)}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 border-t border-slate-100 dark:border-slate-800 pt-4 sm:flex-row sm:flex-wrap sm:items-end sm:gap-6">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500"
              checked={assetsExceed100M}
              onChange={(e) => {
                setAssetsExceed100M(e.target.checked);
                setResult(null);
              }}
            />
            Assets Exceed ₱100M
          </label>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Cost of Sales (optional)</label>
            <input
              type="number"
              min={0}
              placeholder="Leave blank to use Revenue"
              className="w-56 rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-3 py-1.5 text-sm"
              value={cogsInput}
              onChange={(e) => {
                setCogsInput(e.target.value);
                setResult(null);
              }}
            />
          </div>

          <button
            type="button"
            onClick={handleCompute}
            className="flex items-center gap-2 rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
          >
            <Calculator className="h-4 w-4" /> Compute
          </button>
        </div>
      </div>

      {result && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm sm:p-6">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">RCIT</div>
            <div className="mt-2 text-xl font-bold text-slate-800 dark:text-slate-100" title={formatCurrency(result.rcit)}>
              {formatCurrencyShort(result.rcit)}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{result.rcitRate === 0.2 ? "20%" : "25%"} rate</div>
          </div>
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm sm:p-6">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">MCIT</div>
            <div className="mt-2 text-xl font-bold text-slate-800 dark:text-slate-100" title={formatCurrency(result.mcit)}>
              {formatCurrencyShort(result.mcit)}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              2% of Gross Income{result.opex !== undefined ? " (Revenue − Cost of Sales)" : " (≈ Revenue)"}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm sm:p-6">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Tax Due</div>
            <div className="mt-2 text-xl font-bold text-amber-600 dark:text-amber-400" title={formatCurrency(result.taxDue)}>
              {formatCurrencyShort(result.taxDue)}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{result.usedMcit ? "MCIT applied" : "RCIT applied"}</div>
          </div>
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm sm:p-6">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <Scale className="h-3.5 w-3.5" /> NIAT
            </div>
            <div
              className={`mt-2 text-xl font-bold ${result.niat >= 0 ? "text-slate-800 dark:text-slate-100" : "text-red-600 dark:text-red-400"}`}
              title={formatCurrency(result.niat)}
            >
              {formatCurrencyShort(result.niat)}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {formatPct(Math.abs(result.revenue > 0 ? (result.niat / result.revenue) * 100 : 0))} net margin
            </div>
          </div>
        </div>
      )}
    </>
  );
}
