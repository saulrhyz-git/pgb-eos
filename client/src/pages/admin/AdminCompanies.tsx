import { FormEvent, useEffect, useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { api } from "../../api/client";
import type { BusinessUnit, Company } from "../../api/types";

export default function AdminCompanies() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [newName, setNewName] = useState("");
  const [newBuId, setNewBuId] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingBuId, setEditingBuId] = useState("");
  const [editingDescription, setEditingDescription] = useState("");
  const [error, setError] = useState("");

  function refresh() {
    api.companies().then(setCompanies);
    api.businessUnits().then((bus) => {
      setBusinessUnits(bus);
      if (!newBuId && bus.length) setNewBuId(bus[0].id);
    });
  }
  useEffect(refresh, []);

  const buName = (id: string) => businessUnits.find((b) => b.id === id)?.name || "—";

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim() || !newBuId) return;
    setError("");
    try {
      await api.createCompany(newName.trim(), newBuId, newDescription.trim());
      setNewName("");
      setNewDescription("");
      refresh();
    } catch (err: any) {
      setError(err.message || "Failed to add company");
    }
  }

  function startEdit(c: Company) {
    setEditingId(c.id);
    setEditingName(c.name);
    setEditingBuId(c.businessUnitId);
    setEditingDescription(c.description || "");
    setError("");
  }

  async function saveEdit(id: string) {
    if (!editingName.trim() || !editingBuId) return;
    try {
      await api.adminUpdateCompany(id, {
        name: editingName.trim(),
        businessUnitId: editingBuId,
        description: editingDescription.trim(),
      });
      setEditingId(null);
      refresh();
    } catch (err: any) {
      setError(err.message || "Failed to update company");
    }
  }

  async function handleDelete(c: Company) {
    if (!confirm(`Delete company "${c.name}"? This also deletes all its targets and actuals.`)) return;
    try {
      await api.adminDeleteCompany(c.id);
      refresh();
    } catch (err: any) {
      alert(err.message || "Failed to delete company");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">Companies</h3>
      </div>

      <form onSubmit={handleAdd} className="flex flex-col items-stretch gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm sm:flex-row sm:flex-wrap sm:items-start">
        <input
          className="w-full rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-3 py-2 text-sm sm:max-w-xs"
          placeholder="Company name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <select
          className="w-full rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-3 py-2 text-sm sm:w-auto"
          value={newBuId}
          onChange={(e) => setNewBuId(e.target.value)}
        >
          {businessUnits.map((bu) => (
            <option key={bu.id} value={bu.id}>
              {bu.name}
            </option>
          ))}
        </select>
        <input
          className="w-full rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-3 py-2 text-sm sm:max-w-sm"
          placeholder="Description (optional)"
          value={newDescription}
          onChange={(e) => setNewDescription(e.target.value)}
        />
        <button className="flex items-center justify-center gap-2 rounded-md bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600">
          <Plus className="h-4 w-4" /> Add
        </button>
      </form>

      {error && <div className="rounded-md bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-600 dark:text-red-400">{error}</div>}

      <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-50 dark:bg-slate-950 text-left text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Business Unit</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {companies.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">
                  {editingId === c.id ? (
                    <input
                      autoFocus
                      className="rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-2 py-1 text-sm"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                    />
                  ) : (
                    c.name
                  )}
                </td>
                <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                  {editingId === c.id ? (
                    <input
                      className="w-full max-w-xs rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-2 py-1 text-sm"
                      placeholder="Description (optional)"
                      value={editingDescription}
                      onChange={(e) => setEditingDescription(e.target.value)}
                    />
                  ) : (
                    <span className="line-clamp-2 max-w-xs">{c.description || "—"}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                  {editingId === c.id ? (
                    <select
                      className="rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-2 py-1 text-sm"
                      value={editingBuId}
                      onChange={(e) => setEditingBuId(e.target.value)}
                    >
                      {businessUnits.map((bu) => (
                        <option key={bu.id} value={bu.id}>
                          {bu.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    buName(c.businessUnitId)
                  )}
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
            {companies.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-500 dark:text-slate-400">
                  No companies yet.
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
