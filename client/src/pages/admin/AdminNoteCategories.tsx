import { FormEvent, useEffect, useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { api } from "../../api/client";
import type { NoteCategory, NoteCategoryType } from "../../api/types";

// The master catalog behind the Expenses/Disbursements "notable line items"
// facility on the Data Entry page (see IntegratorPortal.tsx's
// NotableItemsCard) — purely a selectable dropdown of categories, never
// rolled into any total. Two independent catalogs (EXPENSE/DISBURSEMENT),
// shown as two sections on this one page. Deactivating (rather than
// deleting) a category in active use keeps its already-logged notes
// readable; deleting one that's still referenced by a note is rejected by
// the backend (see server/src/routes/noteCategories.ts) — the caller is
// asked to deactivate instead.
function CategorySection({ type, title }: { type: NoteCategoryType; title: string }) {
  const [categories, setCategories] = useState<NoteCategory[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [error, setError] = useState("");

  function refresh() {
    api.noteCategories(type).then(setCategories);
  }
  useEffect(refresh, []);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!newLabel.trim()) return;
    setError("");
    try {
      await api.createNoteCategory({ type, label: newLabel.trim(), sortOrder: categories.length });
      setNewLabel("");
      refresh();
    } catch (err: any) {
      setError(err.message || "Failed to add category");
    }
  }

  function startEdit(c: NoteCategory) {
    setEditingId(c.id);
    setEditingLabel(c.label);
    setError("");
  }

  async function saveEdit(id: string) {
    if (!editingLabel.trim()) return;
    try {
      await api.updateNoteCategory(id, { label: editingLabel.trim() });
      setEditingId(null);
      refresh();
    } catch (err: any) {
      setError(err.message || "Failed to update category");
    }
  }

  async function toggleActive(c: NoteCategory) {
    try {
      await api.updateNoteCategory(c.id, { active: !c.active });
      refresh();
    } catch (err: any) {
      setError(err.message || "Failed to update category");
    }
  }

  async function handleDelete(c: NoteCategory) {
    if (!confirm(`Delete category "${c.label}"? This only works if no notes reference it yet — otherwise deactivate it instead.`)) return;
    try {
      await api.deleteNoteCategory(c.id);
      refresh();
    } catch (err: any) {
      alert(err.message || "Failed to delete category");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">{title}</h3>

      <form onSubmit={handleAdd} className="flex flex-col gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm xs:flex-row">
        <input
          className="w-full max-w-xs rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-3 py-2 text-sm"
          placeholder="e.g. Interest"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
        />
        <button className="flex items-center gap-2 rounded-md bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600">
          <Plus className="h-4 w-4" /> Add
        </button>
      </form>

      {error && <div className="rounded-md bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-600 dark:text-red-400">{error}</div>}

      <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="bg-slate-50 dark:bg-slate-950 text-left text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">Label</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {categories.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">
                    {editingId === c.id ? (
                      <input
                        autoFocus
                        className="rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-2 py-1 text-sm"
                        value={editingLabel}
                        onChange={(e) => setEditingLabel(e.target.value)}
                      />
                    ) : (
                      c.label
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleActive(c)}
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        c.active
                          ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                      }`}
                      title="Click to toggle"
                    >
                      {c.active ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {editingId === c.id ? (
                        <>
                          <button onClick={() => saveEdit(c.id)} className="rounded-md p-1.5 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/40" title="Save">
                            <Check className="h-4 w-4" />
                          </button>
                          <button onClick={() => setEditingId(null)} className="rounded-md p-1.5 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700" title="Cancel">
                            <X className="h-4 w-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startEdit(c)} className="rounded-md p-1.5 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700" title="Edit">
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(c)}
                            className="rounded-md p-1.5 text-slate-500 dark:text-slate-400 hover:bg-red-50 dark:hover:bg-red-900/40 hover:text-red-600 dark:hover:text-red-400"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {categories.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-slate-500 dark:text-slate-400">
                    No categories yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function AdminNoteCategories() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h3 className="mb-1 text-base font-semibold text-slate-800 dark:text-slate-100">Note Categories</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          The dropdown options Business Units pick from when logging notable Expense/Disbursement line items (e.g.
          Interest, Depreciation, Cost of Sales) for record-keeping on the Data Entry page. Purely informational —
          nothing here feeds into any total or attainment calculation.
        </p>
      </div>
      <CategorySection type="EXPENSE" title="Expense Categories" />
      <CategorySection type="DISBURSEMENT" title="Disbursement Categories" />
    </div>
  );
}
