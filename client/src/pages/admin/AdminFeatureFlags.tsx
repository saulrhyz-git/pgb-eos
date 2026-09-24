import { useEffect, useState } from "react";
import { CheckCircle2, ToggleLeft } from "lucide-react";
import { api } from "../../api/client";

// Simple global feature toggles a Superadmin can flip without a deploy —
// see server/src/routes/appSettings.ts. Currently just the NIAT tab; each
// flip saves immediately (no separate Save button) since there's only one
// value per row and nothing to batch.
export default function AdminFeatureFlags() {
  const [niatEnabled, setNiatEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .appSettings()
      .then((s) => setNiatEnabled(s.niatEnabled))
      .finally(() => setLoading(false));
  }, []);

  async function handleToggle(next: boolean) {
    setNiatEnabled(next); // Optimistic — the switch should feel instant.
    setError("");
    setSaving(true);
    setSaved(false);
    try {
      const s = await api.updateAppSettings({ niatEnabled: next });
      setNiatEnabled(s.niatEnabled);
      setSaved(true);
    } catch (err: any) {
      setNiatEnabled(!next); // Roll back on failure.
      setError(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="flex items-center gap-2 text-base font-semibold text-slate-800 dark:text-slate-100">
          <ToggleLeft className="h-4 w-4 text-brand-600 dark:text-brand-400" /> Feature Flags
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">Turn optional/experimental features on or off for everyone.</p>
      </div>

      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm sm:p-6">
        {loading ? (
          <div className="py-4 text-center text-sm text-slate-500 dark:text-slate-400">Loading...</div>
        ) : (
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-slate-700 dark:text-slate-200">NIAT tab</div>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Shows/hides the NIAT (Net Income After Taxes) sub-tab under Financials, for every user. Currently BETA.
              </p>
            </div>
            <label className="inline-flex shrink-0 cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                className="sr-only"
                checked={niatEnabled}
                disabled={saving}
                onChange={(e) => handleToggle(e.target.checked)}
              />
              <span
                className={`relative h-6 w-11 rounded-full transition-colors ${niatEnabled ? "bg-brand-500" : "bg-slate-300 dark:bg-slate-700"} ${saving ? "opacity-60" : ""}`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${niatEnabled ? "translate-x-5" : "translate-x-0.5"}`}
                />
              </span>
            </label>
          </div>
        )}
        {error && <div className="mt-3 rounded-md bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-600 dark:text-red-400">{error}</div>}
        {saved && !error && (
          <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" /> Saved
          </div>
        )}
      </div>
    </div>
  );
}
