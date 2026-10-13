import { FormEvent, useEffect, useMemo, useState } from "react";
import { Check, Layers, Loader2, Pencil, Plus, Power, Trash2, X } from "lucide-react";
import { api } from "../api/client";
import type { BusinessUnit, Company, FinancialStream, StreamCategory } from "../api/types";
import { STREAM_CATEGORIES, STREAM_CATEGORY_LABEL, STREAM_FIELDS } from "../utils/streams";

// Financial Streams setup — labeled Revenue / Collections / Expenses /
// Disbursements lines, defined either for a whole Business Unit (every
// Company in it records its own amount) or for a single Company. Amounts are
// entered on the Data Entry page and ADD to the category totals everywhere.
//
// Who can add / rename / deactivate / delete is decided on the server (role
// matrix resource "Financial Streams (manage)"; without one, base roles can
// manage streams in their own Business Units). This page just reflects the
// per-stream canEdit / canDelete flags it gets back.

const inputClass = "rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-3 py-2 text-sm";

function splitHint(category: StreamCategory): string {
  const f = STREAM_FIELDS[category];
  if (category === "REVENUE") return "Recorded as Internal / External";
  if (category === "COLLECTIONS") return "Recorded as Internal / External × Earned / Unearned / Others";
  return f.length === 1 ? "Recorded as a single amount" : "";
}

export default function Streams() {
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [businessUnitId, setBusinessUnitId] = useState("");
  const [companyFilter, setCompanyFilter] = useState(""); // "" = all in BU
  const [showInactive, setShowInactive] = useState(false);

  const [streams, setStreams] = useState<FinancialStream[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [canManage, setCanManage] = useState(false);

  // Add form
  const [category, setCategory] = useState<StreamCategory>("REVENUE");
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [scopeCompanyId, setScopeCompanyId] = useState(""); // "" = whole BU
  const [adding, setAdding] = useState(false);

  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    api.businessUnits().then((bus) => {
      setBusinessUnits(bus);
      if (bus.length) setBusinessUnitId(bus[0].id);
    });
  }, []);

  useEffect(() => {
    if (!businessUnitId) return;
    setCompanyFilter("");
    setScopeCompanyId("");
    api.companies(businessUnitId).then(setCompanies);
    api
      .canManageStreams(businessUnitId)
      .then((r) => setCanManage(r.canManage))
      .catch(() => setCanManage(false));
  }, [businessUnitId]);

  function load() {
    if (!businessUnitId) return;
    setLoading(true);
    setError("");
    api
      .streams({ businessUnitId, includeInactive: true })
      .then(setStreams)
      .catch((err) => setError(err.message || "Failed to load streams"))
      .finally(() => setLoading(false));
  }
  useEffect(load, [businessUnitId]);

  const visible = useMemo(
    () =>
      streams.filter(
        (s) =>
          (showInactive || s.active) &&
          // With a Company picked, show what applies to it: its own streams + the BU-wide ones.
          (!companyFilter || s.companyId === companyFilter || s.scope === "BUSINESS_UNIT")
      ),
    [streams, showInactive, companyFilter]
  );

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setAdding(true);
    setError("");
    try {
      await api.createStream({
        category,
        label: label.trim(),
        description: description.trim(),
        ...(scopeCompanyId ? { companyId: scopeCompanyId } : { businessUnitId }),
      });
      setLabel("");
      setDescription("");
      load();
    } catch (err: any) {
      setError(err.message || "Failed to add the stream");
    } finally {
      setAdding(false);
    }
  }

  async function run(id: string, fn: () => Promise<unknown>) {
    setBusyId(id);
    setError("");
    try {
      await fn();
      load();
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setBusyId(null);
    }
  }

  function startEdit(s: FinancialStream) {
    setEditingId(s.id);
    setEditLabel(s.label);
    setEditDescription(s.description);
  }

  const buName = businessUnits.find((b) => b.id === businessUnitId)?.name || "";

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold text-slate-800 dark:text-slate-100">
          <Layers className="h-5 w-5" /> Financial Streams
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Labeled Revenue, Collections, Expenses and Disbursements lines, on top of each Company's original figures. Amounts are entered per quarter on
          the Data Entry page and are added to the category totals everywhere: Financials, Scorecard, Compare, Reports and AI Analysis. Streams record
          Actuals only, with no Targets.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-1">
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Business Unit</label>
          <select className={inputClass} value={businessUnitId} onChange={(e) => setBusinessUnitId(e.target.value)}>
            {businessUnits.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Show streams for</label>
          <select className={inputClass} value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}>
            <option value="">Every Company in {buName || "this Business Unit"}</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
          Show inactive streams
        </label>
      </div>

      {canManage && (
        <form onSubmit={handleAdd} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm sm:p-5">
          <div className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-100">Add a stream</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex min-w-0 flex-col gap-1">
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Category</label>
              <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value as StreamCategory)}>
                {STREAM_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {STREAM_CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Label</label>
              <input className={inputClass} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Rental Income" maxLength={120} required />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Defined for</label>
              <select className={inputClass} value={scopeCompanyId} onChange={(e) => setScopeCompanyId(e.target.value)}>
                <option value="">Every Company in {buName || "this Business Unit"}</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} only
                  </option>
                ))}
              </select>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Description (optional)</label>
              <input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-slate-500 dark:text-slate-400">{splitHint(category)}</span>
            <button
              disabled={adding || !label.trim()}
              className="flex items-center gap-2 rounded-md bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
            >
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add stream
            </button>
          </div>
        </form>
      )}

      {error && <div className="rounded-md bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-600 dark:text-red-400">{error}</div>}

      {loading ? (
        <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">Loading streams...</div>
      ) : (
        STREAM_CATEGORIES.map((cat) => {
          const list = visible.filter((s) => s.category === cat);
          return (
            <section key={cat} className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {STREAM_CATEGORY_LABEL[cat]} streams <span className="font-normal normal-case">({list.length})</span>
              </h3>
              {list.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-700 px-4 py-3 text-xs text-slate-400 dark:text-slate-500">
                  None yet — only the original {STREAM_CATEGORY_LABEL[cat].toLowerCase()} figures are recorded.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="border-b border-slate-200 dark:border-slate-700 text-left text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                      <tr>
                        <th className="px-4 py-2">Label</th>
                        <th className="px-4 py-2">Defined for</th>
                        <th className="px-4 py-2">Status</th>
                        <th className="px-4 py-2 text-right">Quarters recorded</th>
                        <th className="px-4 py-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((s) => (
                        <tr key={s.id} className="border-b border-slate-100 dark:border-slate-800 last:border-0 align-top">
                          <td className="px-4 py-2.5">
                            {editingId === s.id ? (
                              <div className="flex flex-col gap-1.5">
                                <input className={`${inputClass} py-1`} value={editLabel} onChange={(e) => setEditLabel(e.target.value)} maxLength={120} />
                                <input
                                  className={`${inputClass} py-1 text-xs`}
                                  value={editDescription}
                                  onChange={(e) => setEditDescription(e.target.value)}
                                  placeholder="Description"
                                  maxLength={1000}
                                />
                              </div>
                            ) : (
                              <>
                                <div className="font-medium text-slate-800 dark:text-slate-100">{s.label}</div>
                                {s.description && <div className="text-xs text-slate-500 dark:text-slate-400">{s.description}</div>}
                              </>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">
                            {s.scope === "BUSINESS_UNIT" ? `Every Company in ${s.businessUnitName}` : s.companyName}
                          </td>
                          <td className="px-4 py-2.5">
                            {s.active ? (
                              <span className="rounded-full bg-green-50 dark:bg-green-950/40 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-300">Active</span>
                            ) : (
                              <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-300">Inactive</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-300">{s.entryCount}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex justify-end gap-1">
                              {editingId === s.id ? (
                                <>
                                  <button
                                    title="Save"
                                    disabled={busyId === s.id || !editLabel.trim()}
                                    onClick={() =>
                                      run(s.id, async () => {
                                        await api.updateStream(s.id, { label: editLabel.trim(), description: editDescription.trim() });
                                        setEditingId(null);
                                      })
                                    }
                                    className="rounded-md p-1.5 text-green-600 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                                  >
                                    <Check className="h-4 w-4" />
                                  </button>
                                  <button title="Cancel" onClick={() => setEditingId(null)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                                    <X className="h-4 w-4" />
                                  </button>
                                </>
                              ) : (
                                <>
                                  {s.canEdit && (
                                    <>
                                      <button title="Rename" onClick={() => startEdit(s)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                                        <Pencil className="h-4 w-4" />
                                      </button>
                                      <button
                                        title={s.active ? "Deactivate (hide from Data Entry, keep history)" : "Reactivate"}
                                        disabled={busyId === s.id}
                                        onClick={() => run(s.id, () => api.updateStream(s.id, { active: !s.active }))}
                                        className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                                      >
                                        <Power className="h-4 w-4" />
                                      </button>
                                    </>
                                  )}
                                  {s.canDelete && (
                                    <button
                                      title={s.entryCount ? "Delete (only possible if no amounts were recorded)" : "Delete"}
                                      disabled={busyId === s.id}
                                      onClick={() => {
                                        if (confirm(`Delete the stream "${s.label}"?`)) run(s.id, () => api.deleteStream(s.id));
                                      }}
                                      className="rounded-md p-1.5 text-red-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          );
        })
      )}

      {!canManage && businessUnitId && (
        <p className="text-xs text-slate-500 dark:text-slate-400">Your role can view these streams but not add or change them here.</p>
      )}
    </div>
  );
}
