import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, Save, Sparkles } from "lucide-react";
import { api } from "../../api/client";

const DEFAULT_MODEL = "gemini-2.5-flash";

export default function AdminAiSettings() {
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState("");
  const [error, setError] = useState("");

  function refresh() {
    api.getAiSettings().then((s) => {
      if (!s) return;
      setModel(s.model || DEFAULT_MODEL);
      setHasApiKey(s.hasApiKey);
      setUpdatedAt(s.updatedAt);
    });
  }
  useEffect(refresh, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    setSaved(false);
    try {
      await api.putAiSettings({ apiKey: apiKey || undefined, model: model.trim() || DEFAULT_MODEL });
      setApiKey("");
      setSaved(true);
      refresh();
    } catch (err: any) {
      setError(err.message || "Failed to save AI settings");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult("");
    try {
      const res = await api.testAiSettings();
      setTestResult(`Success — Gemini replied: "${res.reply}"`);
    } catch (err: any) {
      setTestResult(err.message || "Failed to reach Gemini.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="flex items-center gap-2 text-base font-semibold text-slate-800 dark:text-slate-100">
          <Sparkles className="h-4 w-4 text-brand-600 dark:text-brand-400" /> AI Settings
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Configures the Google Gemini API key and model used by the AI Analysis tab. Access to the AI Analysis tab itself is
          controlled separately, per user, under Admin → Roles (grant the AI Analysis resource) — non-superadmins get no
          access by default.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm sm:p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Gemini API Key {hasApiKey && <span className="text-slate-500 dark:text-slate-400">(leave blank to keep current)</span>}
            </label>
            <input
              type="password"
              autoComplete="off"
              className="rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-3 py-2 text-sm"
              placeholder={hasApiKey ? "••••••••••••••••" : "Paste your Gemini API key"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Model</label>
            <input
              className="rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-3 py-2 text-sm"
              placeholder={DEFAULT_MODEL}
              value={model}
              onChange={(e) => setModel(e.target.value)}
              required
            />
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              Any current Gemini model name your API key has access to (e.g. {DEFAULT_MODEL}). Check Google AI Studio if
              unsure — this isn't validated until you save or test.
            </p>
          </div>
        </div>

        {error && <div className="rounded-md bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-600 dark:text-red-400">{error}</div>}
        {updatedAt && <div className="text-xs text-slate-500 dark:text-slate-400">Last saved {new Date(updatedAt).toLocaleString()}</div>}

        <button
          type="submit"
          disabled={saving}
          className="flex w-fit items-center justify-center gap-2 rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {saved ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {saving ? "Saving..." : saved ? "Saved" : "Save Settings"}
        </button>
      </form>

      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm sm:p-6">
        <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">Test connection</div>
        <p className="text-xs text-slate-500 dark:text-slate-400">Sends a trivial prompt using the currently saved key and model — save first if you just changed either.</p>
        <button
          onClick={handleTest}
          disabled={testing || !hasApiKey}
          className="flex w-fit items-center justify-center gap-2 rounded-md bg-slate-800 dark:bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 dark:hover:bg-slate-600 disabled:opacity-50"
        >
          <Sparkles className="h-4 w-4" /> {testing ? "Testing..." : "Test Connection"}
        </button>
        {!hasApiKey && <div className="text-xs text-slate-400 dark:text-slate-500">Save an API key above before testing.</div>}
        {testResult && <div className="text-sm text-slate-600 dark:text-slate-300">{testResult}</div>}
      </div>
    </div>
  );
}
