import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Layers, Loader2, Save } from "lucide-react";
import { api } from "../api/client";
import type { StreamActualRow, StreamCategory } from "../api/types";
import { formatCurrency } from "../utils/format";
import { STREAM_CATEGORY_LABEL, STREAM_FIELDS } from "../utils/streams";

// Data Entry for one category's labeled Financial Streams (Revenue,
// Collections, Expenses or Disbursements) for the selected Company and
// quarter. Sits under that category's original figures. It saves on its own
// (its button is type="button", so it never submits the page's main "Save
// All Figures" form), and only sends the streams that actually changed.
// Stream amounts ADD to the category total.

type Draft = Record<string, { amounts: Record<string, string>; remarks: string }>;

function toDraft(rows: StreamActualRow[]): Draft {
  const d: Draft = {};
  for (const r of rows) {
    d[r.streamId] = {
      amounts: Object.fromEntries(Object.entries(r.amounts).map(([k, v]) => [k, v ? String(v) : ""])),
      remarks: r.remarks,
    };
  }
  return d;
}

function num(v: string): number {
  const x = Number(v);
  return Number.isFinite(x) && x >= 0 ? Math.round(x * 100) / 100 : 0;
}

export default function StreamEntryCard({
  category,
  rows,
  loading,
  locked,
  yearId,
  quarter,
  companyId,
  onSaved,
}: {
  category: StreamCategory;
  rows: StreamActualRow[];
  loading: boolean;
  locked: boolean;
  yearId: string;
  quarter: number;
  companyId: string;
  onSaved: () => void;
}) {
  const label = STREAM_CATEGORY_LABEL[category];
  const fields = STREAM_FIELDS[category];
  const [draft, setDraft] = useState<Draft>(() => toDraft(rows));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setDraft(toDraft(rows));
    setSaved(false);
    setError("");
  }, [rows]);

  const changed = useMemo(
    () =>
      rows.filter((r) => {
        const d = draft[r.streamId];
        if (!d) return false;
        if (d.remarks !== r.remarks) return true;
        return fields.some((f) => num(d.amounts[f.key] ?? "") !== (r.amounts[f.key] || 0));
      }),
    [rows, draft, fields]
  );

  const streamsTotal = rows.reduce((sum, r) => sum + fields.reduce((s, f) => s + num(draft[r.streamId]?.amounts[f.key] ?? ""), 0), 0);

  async function handleSave() {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await api.saveStreamActuals({
        yearId,
        quarter,
        companyId,
        entries: changed.map((r) => ({
          streamId: r.streamId,
          amounts: Object.fromEntries(fields.map((f) => [f.key, num(draft[r.streamId].amounts[f.key] ?? "")])),
          remarks: draft[r.streamId].remarks,
        })),
      });
      setSaved(true);
      onSaved();
    } catch (err: any) {
      setError(err.message || "Failed to save stream amounts");
    } finally {
      setSaving(false);
    }
  }

  function setAmount(streamId: string, key: string, value: string) {
    setSaved(false);
    setDraft((d) => ({ ...d, [streamId]: { ...d[streamId], amounts: { ...d[streamId].amounts, [key]: value } } }));
  }
  function setRemarks(streamId: string, value: string) {
    setSaved(false);
    setDraft((d) => ({ ...d, [streamId]: { ...d[streamId], remarks: value } }));
  }

  return (
    <div className="rounded-md border border-brand-100 dark:border-brand-900/60 bg-white dark:bg-slate-900 p-3 sm:p-4">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <Layers className="h-4 w-4" /> {label} Streams
        </div>
        {rows.length > 0 && (
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Streams total: <span className="font-semibold text-slate-700 dark:text-slate-200">{formatCurrency(streamsTotal)}</span>
          </div>
        )}
      </div>
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
        Labeled {label.toLowerCase()} lines on top of the figures above — they add to the {label.toLowerCase()} total.{" "}
        <Link to="/streams" className="font-medium text-brand-600 dark:text-brand-400 hover:underline">
          Manage streams
        </Link>
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading streams...
        </div>
      ) : rows.length === 0 ? (
        <div className="text-xs text-slate-400 dark:text-slate-500">No {label.toLowerCase()} streams set up for this Company yet.</div>
      ) : (
        <div className="flex flex-col gap-4">
          {rows.map((r) => {
            const d = draft[r.streamId];
            if (!d) return null;
            const disabled = locked || !r.canEdit;
            const rowTotal = fields.reduce((s, f) => s + num(d.amounts[f.key] ?? ""), 0);
            return (
              <div key={r.streamId} className="rounded-md border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 p-3">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{r.label}</span>
                    <span className="ml-2 text-[11px] text-slate-400 dark:text-slate-500">
                      {r.scope === "BUSINESS_UNIT" ? `All of ${r.scopeName}` : "This Company only"}
                      {!r.active && " · inactive"}
                      {!r.canEdit && " · view only"}
                    </span>
                    {r.description && <div className="text-xs text-slate-500 dark:text-slate-400">{r.description}</div>}
                  </div>
                  {fields.length > 1 && <div className="text-xs text-slate-500 dark:text-slate-400">Total {formatCurrency(rowTotal)}</div>}
                </div>
                <div className={`grid grid-cols-1 gap-3 ${fields.length === 6 ? "xs:grid-cols-3" : fields.length === 2 ? "xs:grid-cols-2" : "sm:max-w-xs"}`}>
                  {fields.map((f) => (
                    <div key={f.key} className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-slate-500 dark:text-slate-400">{f.group ? `${f.group} — ${f.label}` : f.label}</label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        disabled={disabled}
                        className="rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-3 py-2 text-sm disabled:opacity-60"
                        value={d.amounts[f.key] ?? ""}
                        onChange={(e) => setAmount(r.streamId, f.key, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
                <input
                  disabled={disabled}
                  className="mt-2 w-full rounded-md border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 px-2 py-1 text-xs disabled:opacity-60"
                  placeholder="Remarks..."
                  value={d.remarks}
                  onChange={(e) => setRemarks(r.streamId, e.target.value)}
                />
              </div>
            );
          })}

          {error && <div className="rounded-md bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs text-red-600 dark:text-red-400">{error}</div>}

          <div className="flex items-center justify-end gap-3">
            {saved && changed.length === 0 && (
              <span className="flex items-center gap-1 text-xs text-green-700 dark:text-green-400">
                <CheckCircle2 className="h-3.5 w-3.5" /> Saved
              </span>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || locked || changed.length === 0}
              className="flex items-center gap-2 rounded-md border border-brand-500 px-3 py-1.5 text-sm font-medium text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save {label} Streams{changed.length > 0 ? ` (${changed.length})` : ""}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
