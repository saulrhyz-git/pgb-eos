import { useEffect, useState } from "react";
import { AlertTriangle, Clipboard, ClipboardCheck, RefreshCw, ShieldAlert, Sparkles } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import type { AiAnalysisResult, BusinessUnit, Year } from "../api/types";

// AI Analysis — an on-demand, AI-generated executive narrative built from
// the exact same dataset the Executive Scorecard shows (Revenue/Collections/
// Expenses attainment, Net Income, Rocks status, Disbursements), summarized
// by Google Gemini. Default access is Superadmin; a non-superadmin needs a
// Custom Role that explicitly grants AI_ANALYSIS view (see
// server/src/routes/aiAnalysis.ts) — same "access required" pattern as the
// Executive Scorecard/Audit Log. Nothing is auto-generated on filter change
// (unlike the Scorecard/Revenue dashboards) since each generation is a real
// paid call to an external API — the user explicitly clicks Generate.
export default function AiAnalysis() {
  const { user } = useAuth();
  const canSeeAllBUs = user?.role === "GROUP_INTEGRATOR" || user?.role === "SUPERADMIN";

  const [years, setYears] = useState<Year[]>([]);
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [yearId, setYearId] = useState("");
  const [quarter, setQuarter] = useState(0); // 0 = All Quarters
  const [businessUnitId, setBusinessUnitId] = useState("");

  const [result, setResult] = useState<AiAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notConfigured, setNotConfigured] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    Promise.all([api.years(), api.currentQuarter().catch(() => null)]).then(([ys, current]) => {
      setYears(ys);
      if (!yearId && ys.length > 0) {
        if (current?.yearId && ys.some((y) => y.id === current.yearId)) setYearId(current.yearId);
        else setYearId(ys[0].id);
      }
    });
    api.businessUnits().then((bus) => {
      setBusinessUnits(bus);
      if (!canSeeAllBUs && !businessUnitId && bus.length > 0) setBusinessUnitId(bus[0].id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clear a stale result whenever the scope changes, so it's never
  // misread as reflecting the newly-selected filters until Generate is
  // clicked again for them.
  useEffect(() => {
    setResult(null);
    setError("");
    setNotConfigured("");
  }, [yearId, quarter, businessUnitId]);

  async function handleGenerate() {
    if (!yearId) return;
    setLoading(true);
    setError("");
    setNotConfigured("");
    setForbidden(false);
    setCopied(false);
    try {
      const res = await api.aiAnalysis({ yearId, quarter, businessUnitId: businessUnitId || undefined });
      setResult(res);
    } catch (err: any) {
      if (err.status === 403) setForbidden(true);
      else if (err.status === 400) setNotConfigured(err.message || "AI Analysis hasn't been configured yet.");
      else setError(err.message || "Failed to generate the analysis");
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.analysis);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can fail silently (e.g. permissions) — not worth
      // surfacing as a hard error over a convenience action.
    }
  }

  if (forbidden) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-12 text-center shadow-sm">
        <ShieldAlert className="h-10 w-10 text-slate-300 dark:text-slate-600" />
        <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-200">AI Analysis access required</h2>
        <p className="max-w-md text-sm text-slate-500 dark:text-slate-400">
          You don't currently have access to this page. Ask a Superadmin to grant your account (or a Custom Role assigned to
          you) view access to AI Analysis.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="mb-1 flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-slate-100">
            <Sparkles className="h-5 w-5 text-brand-600 dark:text-brand-400" /> AI Analysis
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            An AI-generated executive analysis of Revenue, Collections, Expenses, Rocks, and Disbursements for the selected
            period, powered by Google Gemini.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 shadow-sm sm:flex sm:flex-wrap sm:items-end sm:gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Year</label>
            <select
              className="w-full rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-3 py-1.5 text-sm sm:w-auto"
              value={yearId}
              onChange={(e) => setYearId(e.target.value)}
            >
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.year}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Quarter</label>
            <select
              className="w-full rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-3 py-1.5 text-sm sm:w-auto"
              value={quarter}
              onChange={(e) => setQuarter(Number(e.target.value))}
            >
              <option value={0}>All Quarters</option>
              {[1, 2, 3, 4].map((q) => (
                <option key={q} value={q}>
                  Q{q}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2 flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Business Unit</label>
            <select
              className="w-full rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-3 py-1.5 text-sm sm:min-w-[180px]"
              value={businessUnitId}
              onChange={(e) => setBusinessUnitId(e.target.value)}
            >
              {canSeeAllBUs && <option value="">All Business Units</option>}
              {businessUnits.map((bu) => (
                <option key={bu.id} value={bu.id}>
                  {bu.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            disabled={!yearId || loading}
            onClick={handleGenerate}
            className="col-span-2 flex items-center justify-center gap-2 rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50 sm:col-span-1"
          >
            {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading ? "Generating..." : result ? "Regenerate Analysis" : "Generate Analysis"}
          </button>
        </div>
      </div>

      {notConfigured && (
        <div className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{notConfigured}</span>
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 rounded-md bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && !result && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-12 text-center shadow-sm">
          <RefreshCw className="h-8 w-8 animate-spin text-slate-300 dark:text-slate-600" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Asking Gemini to analyze this period's data — this can take a few seconds.</p>
        </div>
      )}

      {!loading && !result && !notConfigured && !error && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-12 text-center shadow-sm">
          <Sparkles className="h-8 w-8 text-slate-300 dark:text-slate-600" />
          <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">
            Pick a Year, Quarter, and Business Unit above, then click Generate Analysis for an AI-written executive summary
            of that period.
          </p>
        </div>
      )}

      {result && (
        <div className="flex flex-col gap-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="text-sm text-slate-500 dark:text-slate-400">
              {result.scope.yearLabel} — {result.scope.periodLabel} · {result.scope.scopeLabel}
              <span className="mx-1.5">·</span>
              {result.model}
              <span className="mx-1.5">·</span>
              {new Date(result.generatedAt).toLocaleString()}
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 rounded-md border border-slate-300 dark:border-slate-600 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              {copied ? <ClipboardCheck className="h-3.5 w-3.5" /> : <Clipboard className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="flex flex-col gap-4 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
            {result.analysis
              .split(/\n{2,}/)
              .map((s) => s.trim())
              .filter(Boolean)
              .map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
