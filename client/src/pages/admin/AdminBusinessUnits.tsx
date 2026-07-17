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
        <h3 className="text-base font-semibold text-slate-800">Business Units</h3>
      </div>

      <form onSubmit={handleAdd} className="flex gap-2 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <input
          className="w-full max-w-xs rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="e.g. Retail"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button className="flex items-center gap-2 rounded-md bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600">
          <Plus className="h-4 w-4" /> Add
        </button>
      </form>

      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Companies</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {businessUnits.map((bu) => (
              <tr key={bu.id}>
                <td className="px-4 py-3 font-medium text-slate-800">
                  {editingId === bu.id ? (
                    <input
                      autoFocus
                      className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                    />
                  ) : (
                    bu.name
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">{bu.companies?.length ?? 0}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    {editingId === bu.id ? (
                      <>
                        <button onClick={() => saveEdit(bu.id)} className="rounded-md p-1.5 text-emerald-600 hover:bg-emerald-50" title="Save">
                          <Check className="h-4 w-4" />
                        </button>
                        <button onClick={() => setEditingId(null)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" title="Cancel">
                          <X className="h-4 w-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => startEdit(bu)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" title="Edit">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(bu)}
                          className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
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
                <td colSpan={3} className="px-4 py-6 text-center text-slate-400">
                  No business units yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
