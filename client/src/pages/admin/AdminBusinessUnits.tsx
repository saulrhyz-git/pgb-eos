import { FormEvent, useEffect, useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { api } from "../../api/client";
import type { BusinessUnit } from "../../api/types";

export default function AdminBusinessUnits() {
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [error, setError] = useState("");

  function refresh() {
    api.businessUnits().then(setBusinessUnits);
  }
  useEffect(refresh, []);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setError("");
    try {
      await api.createBusinessUnit(newName.trim());
      setNewName("");
      refresh();
    } catch (err: any) {
      setError(err.message || "Failed to add business unit");
    }
  }

  function startEdit(bu: BusinessUnit) {
    setEditingId(bu.id);
    setEditingName(bu.name);
    setError("");
  }

  async function saveEdit(id: string) {
    if (!editingName.trim()) return;
    try {
      await api.adminUpdateBusinessUnit(id, editingName.trim());
      setEditingId(null);
      refresh();
    } catch (err: any) {
      setError(err.message || "Failed to update business unit");
    }
  }

  async function handleDelete(bu: BusinessUnit) {
    if (!confirm(`Delete business unit "${bu.name}"? This also deletes its companies and all associated data.`)) return;
    try {
      await api.adminDeleteBusinessUnit(bu.id);
      refresh();
    } catch (err: any) {
      alert(err.message || "Failed to delete business unit");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">Business Units</h3>
      </div>

      <form onSubmit={handleAdd} className="flex flex-col gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm xs:flex-row">
        <input
          className="w-full max-w-xs rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-3 py-2 text-sm"
          placeholder="e.g. Retail"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
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
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Companies</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {businessUnits.map((bu) => (
              <tr key={bu.id}>
                <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">
                  {editingId === bu.id ? (
                    <input
                      autoFocus
                      className="rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-2 py-1 text-sm"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                    />
                  ) : (
                    bu.name
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{bu.companies?.length ?? 0}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    {editingId === bu.id ? (
                      <>
                        <button onClick={() => saveEdit(bu.id)} className="rounded-md p-1.5 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/40" title="Save">
                          <Check className="h-4 w-4" />
                        </button>
                        <button onClick={() => setEditingId(null)} className="rounded-md p-1.5 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700" title="Cancel">
                          <X className="h-4 w-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => startEdit(bu)} className="rounded-md p-1.5 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700" title="Edit">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(bu)}
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
            {businessUnits.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-slate-500 dark:text-slate-400">
                  No business units yet.
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
