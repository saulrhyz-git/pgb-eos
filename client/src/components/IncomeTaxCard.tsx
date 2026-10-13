import { useEffect, useState } from "react";
import { CheckCircle2, Landmark, Loader2, RotateCcw, Save } from "lucide-react";
import { api } from "../api/client";
import type { IncomeTaxEntry } from "../api/types";
import { formatCurrency } from "../utils/format";

// Data Entry: a Company's actual income tax for the selected quarter. The
// NIAT tab uses it as that quarter's tax (NIAT = Net Income − this); with
// nothing entered, NIAT falls back to its RCIT/MCIT estimate for the
// quarter. Shown regardless of the NIAT feature flag — tax can always be
// recorded. Saves on its own (type="button"), separate from "Save All
// Figures". Clearing removes the entry (back to "estimated"); entering 0 is
// a real "no tax this quarter".
export default function IncomeTaxCard({
  yearId,
  quarter,
  companyId,
  locked,
}: {
  yearId: string;
  quarter: number;
  companyId: string;
  locked: boolean;
}) {
  const [entry, setEntry] = useState<IncomeTaxEntry | null>(null);
  const [amount, setAmount] = useState("");
  const [remarks, setRemarks] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  function load() {
    if (!yearId || !companyId) return;
    setLoading(true);
    setError("");
    api
      .incomeTax({ yearId, quarter, companyId })
      .then((e) => {
        setEntry(e);
        setAmount(e.amount === null ? "" : String(e.amount));
        setRemarks(e.remarks);
      })
      .catch((err) => setError(err.message || "Failed to load income tax"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    setSaved(false);
    load();
  }, [yearId, quarter, companyId]);

  if (entry && !entry.canView) return null;

  const entered = entry?.amount ?? null;
  const parsed = Number(amount);
  const valid = amount.trim() !== "" && Number.isFinite(parsed);
  const changed = valid ? Math.round(parsed * 100) / 100 !== entered || remarks !== (entry?.remarks ?? "") : false;
  const disabled = locked || !entry?.canEdit;

  async function handleSave() {
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      await api.saveIncomeTax({ yearId, quarter, companyId, amount: Math.round(parsed * 100) / 100, remarks });
      setSaved(true);
      load();
    } catch (err: any) {
      setError(err.message || "Failed to save income tax");
    } finally {
      setBusy(false);
    }
  }

  async function handleClear() {
    if (!confirm(`Clear Q${quarter} income tax? NIAT will go back to estimating this quarter's tax.`)) return;
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      await api.clearIncomeTax({ yearId, quarter, companyId });
      load();
    } catch (err: any) {
      setError(err.message || "Failed to clear income tax");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 p-3 sm:p-4">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <Landmark className="h-4 w-4" /> Q{quarter} Income Tax
        </div>
        {!loading && entry && (
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
              entered === null
                ? "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300"
                : "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300"
            }`}
          >
            {entered === null ? "Not entered — NIAT estimates it" : `Entered: ${formatCurrency(entered)}`}
          </span>
        )}
      </div>
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
        The actual income tax for this Company and quarter. NIAT uses it in place of the RCIT/MCIT estimate. Enter 0 if no tax is due; use Clear to go back to the
        estimate.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading...
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1 sm:max-w-xs">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Amount</label>
            <input
              type="number"
              step="0.01"
              disabled={disabled}
              placeholder="Not entered"
              className="rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-3 py-2 text-sm disabled:opacity-60"
              value={amount}
              onChange={(e) => {
                setSaved(false);
                setAmount(e.target.value);
              }}
            />
          </div>
          <input
            disabled={disabled}
            className="mt-2 w-full rounded-md border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 px-2 py-1 text-xs disabled:opacity-60"
            placeholder="Remarks (e.g. per filed 1702Q)..."
            value={remarks}
            onChange={(e) => {
              setSaved(false);
              setRemarks(e.target.value);
            }}
          />

          {error && <div className="mt-2 rounded-md bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs text-red-600 dark:text-red-400">{error}</div>}
          {entry && !entry.canEdit && !locked && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Your role can view but not enter income tax here.</p>}

          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
            {saved && !changed && (
              <span className="flex items-center gap-1 text-xs text-green-700 dark:text-green-400">
                <CheckCircle2 className="h-3.5 w-3.5" /> Saved
              </span>
            )}
            {entered !== null && (
              <button
                type="button"
                onClick={handleClear}
                disabled={busy || disabled}
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
              >
                <RotateCcw className="h-4 w-4" /> Clear
              </button>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={busy || disabled || !valid || !changed}
              className="flex items-center gap-2 rounded-md border border-brand-500 px-3 py-1.5 text-sm font-medium text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Income Tax
            </button>
          </div>
        </>
      )}
    </div>
  );
}
