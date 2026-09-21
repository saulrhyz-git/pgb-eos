import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Calculator, FlaskConical, Scale } from "lucide-react";
import { formatCurrency, formatCurrencyShort, formatPct } from "../../utils/format";
import { computeNiat, type NiatResult } from "../../utils/niat";
import type { FinancialsOutletContext } from "./FinancialsLayout";

// NIAT (Net Income After Taxes) sub-tab — see utils/niat.ts for the actual
// Philippine corporate tax computation (RCIT vs MCIT, higher of the two)
// and its one remaining approximation. Computing tax correctly depends on
// two things this app doesn't record anywhere (whether a Company's total
// assets exceed ₱100M, and its Cost of Sales/OPEX split) — rather than
// guessing at defaults for every Company in a bulk table, this tab asks
// for those two inputs explicitly, once a single Company is selected in
// the FilterBar above, and only computes once the viewer presses Compute.
// Revenue/Expenses come from the same data.operationalGrid the other 3
// sub-tabs already have via FinancialsOutletContext — no separate fetch —
// and are already masked by whatever REVENUE/EXPENSES view permissions
// the viewer has, same as everywhere else in Financials.
export default function NiatTab() {
  const { data, filters } = useOutletContext<FinancialsOutletContext>();

  const selectedCompany = useMemo(() => {
    if (!data || !filters.companyId) return null;
    for (const bu of data.operationalGrid) {
      const c = bu.companies.find((c) => c.companyId === filters.companyId);
      if (c) return { companyName: c.companyName, businessUnitName: bu.businessUnitName, revenue: c.quarterActual.total, expenses: c.quarterActual.expenses };
    }
    return null;
  }, [data, filters.companyId]);

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
  }, [filters.yearId, filters.quarter, filters.businessUnitId, filters.companyId]);

  function handleCompute() {
    if (!selectedCompany) return;
    const n = Number(cogsInput);
    const cogs = cogsInput.trim() !== "" && !Number.isNaN(n) && n >= 0 ? n : undefined;
    setResult(computeNiat(selectedCompany.revenue, selectedCompany.expenses, assetsExceed100M, cogs));
  }

  if (!data) return null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
        <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          <strong>BETA.</strong> NIAT is computed as the higher of RCIT (25%, or 20% if the asset and income tests both
          pass) and MCIT (2% of Gross Income) applied to Revenue − Expenses, per Philippine corporate tax rules — using
          the Assets/Cost of Sales inputs below, which apply only to this one computation and aren't saved anywhere.
        </span>
      </div>

      {!filters.companyId ? (
        <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
          Select a specific Company in the filter bar above to compute its NIAT — tax is owed per legal entity, so NIAT
          isn't computed in aggregate across multiple Companies.
        </div>
      ) : !selectedCompany ? (
        <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
          This Company isn't available in the current scope (it may be outside your Business Unit access, or hidden by
          your Revenue/Expenses view permissions).
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm sm:p-6">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {selectedCompany.businessUnitName}
            </div>
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
      )}
    </div>
  );
}
