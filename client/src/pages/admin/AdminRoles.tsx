import { FormEvent, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2, X } from "lucide-react";
import { api } from "../../api/client";
import type { BusinessUnit, CustomRole, Resource, RolePermission } from "../../api/types";

const RESOURCES: Resource[] = ["TARGETS", "REVENUE", "COLLECTIONS", "EXPENSES", "ROCKS", "SCORECARD"];
const RESOURCE_LABELS: Record<Resource, string> = {
  TARGETS: "Targets",
  REVENUE: "Revenue",
  COLLECTIONS: "Collections",
  EXPENSES: "Expenses",
  ROCKS: "Rocks",
  SCORECARD: "Executive Scorecard",
};

type Grants = Record<Resource, { canView: boolean; canEdit: boolean; canDelete: boolean }>;

function emptyGrants(): Grants {
  const g = {} as Grants;
  for (const r of RESOURCES) g[r] = { canView: false, canEdit: false, canDelete: false };
  return g;
}

// One row of the "which BUs/Companies does this role touch" working set —
// either a whole Business Unit (companyId undefined) or one specific Company
// within it. Each carries its own independent 5-resource x View/Edit/Delete
// matrix.
interface ScopeEntry {
  key: string;
  businessUnitId: string;
  businessUnitName: string;
  companyId?: string;
  companyName?: string;
  grants: Grants;
}

function scopeKey(businessUnitId: string, companyId?: string) {
  return companyId ? `${businessUnitId}::${companyId}` : businessUnitId;
}

const emptyForm = { id: "" as string | null, name: "", description: "" };

export default function AdminRoles() {
  const [roles, setRoles] = useState<CustomRole[]>([]);
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [scopeEntries, setScopeEntries] = useState<ScopeEntry[]>([]);
  const [expandedBus, setExpandedBus] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function refresh() {
    api.customRoles().then(setRoles);
    api.businessUnits().then(setBusinessUnits);
  }

  useEffect(refresh, []);

  function startCreate() {
    setForm(emptyForm);
    setScopeEntries([]);
    setError("");
    setShowForm(true);
  }

  function startEdit(role: CustomRole) {
    const entries = new Map<string, ScopeEntry>();
    for (const p of role.permissions) {
      const key = scopeKey(p.businessUnitId, p.companyId || undefined);
      let entry = entries.get(key);
      if (!entry) {
        entry = {
          key,
          businessUnitId: p.businessUnitId,
          businessUnitName: p.businessUnitName || "",
          companyId: p.companyId || undefined,
          companyName: p.companyName || undefined,
          grants: emptyGrants(),
        };
        entries.set(key, entry);
      }
      entry.grants[p.resource] = { canView: p.canView, canEdit: p.canEdit, canDelete: p.canDelete };
    }
    setForm({ id: role.id, name: role.name, description: role.description });
    setScopeEntries(Array.from(entries.values()));
    setError("");
    setShowForm(true);
  }

  function toggleBuExpanded(id: string) {
    setExpandedBus((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function isScopeSelected(businessUnitId: string, companyId?: string) {
    return scopeEntries.some((e) => e.key === scopeKey(businessUnitId, companyId));
  }

  function toggleScope(bu: BusinessUnit, companyId?: string) {
    const key = scopeKey(bu.id, companyId);
    setScopeEntries((prev) => {
      if (prev.some((e) => e.key === key)) return prev.filter((e) => e.key !== key);
      const company = companyId ? bu.companies?.find((c) => c.id === companyId) : undefined;
      return [
        ...prev,
        {
          key,
          businessUnitId: bu.id,
          businessUnitName: bu.name,
          companyId,
          companyName: company?.name,
          grants: emptyGrants(),
        },
      ];
    });
  }

  function removeScope(key: string) {
    setScopeEntries((prev) => prev.filter((e) => e.key !== key));
  }

  function toggleGrant(key: string, resource: Resource, action: "canView" | "canEdit" | "canDelete") {
    setScopeEntries((prev) =>
      prev.map((e) =>
        e.key === key
          ? { ...e, grants: { ...e.grants, [resource]: { ...e.grants[resource], [action]: !e.grants[resource][action] } } }
          : e
      )
    );
  }

  const permissionsPayload = useMemo<RolePermission[]>(() => {
    const rows: RolePermission[] = [];
    for (const entry of scopeEntries) {
      for (const resource of RESOURCES) {
        const g = entry.grants[resource];
        if (!g.canView && !g.canEdit && !g.canDelete) continue;
        rows.push({
          businessUnitId: entry.businessUnitId,
          companyId: entry.companyId,
          resource,
          canView: g.canView,
          canEdit: g.canEdit,
          canDelete: g.canDelete,
        });
      }
    }
    return rows;
  }, [scopeEntries]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (permissionsPayload.length === 0) {
      setError("Select at least one Business Unit/Company and check at least one View/Edit/Delete box");
      return;
    }
    setSaving(true);
    try {
      const payload = { name: form.name, description: form.description, permissions: permissionsPayload };
      if (form.id) await api.updateCustomRole(form.id, payload);
      else await api.createCustomRole(payload);
      setShowForm(false);
      refresh();
    } catch (err: any) {
      setError(err.message || "Failed to save role");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(role: CustomRole) {
    if (!confirm(`Delete role "${role.name}"? This cannot be undone.`)) return;
    try {
      await api.deleteCustomRole(role.id);
      refresh();
    } catch (err: any) {
      alert(err.message || "Failed to delete role");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-800">Custom Roles</h3>
          <p className="text-sm text-slate-500">
            Named permission profiles you can assign to any user — pick which Business Units/Companies they can touch, and
            whether they can View, Edit, or Delete each of Targets, Revenue, Collections, Expenses, Rocks, and the Executive
            Scorecard there. Only the View column matters for the Executive Scorecard — it's a read-only summary page, so
            Edit/Delete checkboxes for it are ignored.
          </p>
        </div>
        <button
          onClick={startCreate}
          className="flex shrink-0 items-center gap-2 rounded-md bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600"
        >
          <Plus className="h-4 w-4" /> New Role
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-5 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-700">{form.id ? "Edit Role" : "New Role"}</div>
            <button type="button" onClick={() => setShowForm(false)} className="text-slate-500 hover:text-slate-600">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Role Name</label>
              <input
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={form.name}
                onChange={(ev) => setForm((f) => ({ ...f, name: ev.target.value }))}
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Description (optional)</label>
              <input
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={form.description}
                onChange={(ev) => setForm((f) => ({ ...f, description: ev.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
            {/* Business Unit / Company scope picker */}
            <div className="flex flex-col gap-1 rounded-md border border-slate-200 p-3">
              <div className="mb-1 text-xs font-medium text-slate-500">Business Units &amp; Companies</div>
              <div className="flex max-h-96 flex-col gap-0.5 overflow-y-auto">
                {businessUnits.map((bu) => (
                  <div key={bu.id}>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => toggleBuExpanded(bu.id)}
                        className="rounded p-0.5 text-slate-400 hover:bg-slate-100"
                      >
                        {expandedBus.has(bu.id) ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      </button>
                      <label className="flex flex-1 cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={isScopeSelected(bu.id)}
                          onChange={() => toggleScope(bu)}
                        />
                        <span className="font-medium text-slate-700">{bu.name}</span>
                      </label>
                    </div>
                    {expandedBus.has(bu.id) && (
                      <div className="ml-7 flex flex-col gap-0.5 border-l border-slate-100 pl-2">
                        {(bu.companies || []).map((c) => (
                          <label
                            key={c.id}
                            className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm text-slate-600 hover:bg-slate-50"
                          >
                            <input
                              type="checkbox"
                              checked={isScopeSelected(bu.id, c.id)}
                              onChange={() => toggleScope(bu, c.id)}
                            />
                            {c.name}
                          </label>
                        ))}
                        {(bu.companies || []).length === 0 && (
                          <span className="px-1.5 py-1 text-xs text-slate-400">No companies yet</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {businessUnits.length === 0 && <span className="px-1.5 py-1 text-xs text-slate-400">No Business Units yet</span>}
              </div>
            </div>

            {/* Per-scope permission matrix */}
            <div className="flex flex-col gap-3">
              {scopeEntries.length === 0 && (
                <div className="flex h-full items-center justify-center rounded-md border border-dashed border-slate-300 p-6 text-sm text-slate-400">
                  Select a Business Unit or Company on the left to grant it View/Edit/Delete access.
                </div>
              )}
              {scopeEntries.map((entry) => (
                <div key={entry.key} className="rounded-md border border-slate-200 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-sm font-medium text-slate-700">
                      {entry.companyName ? (
                        <>
                          {entry.businessUnitName} <span className="text-slate-400">/</span> {entry.companyName}
                        </>
                      ) : (
                        <>
                          {entry.businessUnitName} <span className="text-xs font-normal text-slate-400">(whole Business Unit)</span>
                        </>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeScope(entry.key)}
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      title="Remove this scope"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-slate-400">
                        <th className="py-1 font-medium">Resource</th>
                        <th className="py-1 text-center font-medium">View</th>
                        <th className="py-1 text-center font-medium">Edit</th>
                        <th className="py-1 text-center font-medium">Delete</th>
                      </tr>
                    </thead>
                    <tbody>
                      {RESOURCES.map((resource) => (
                        <tr key={resource} className="border-t border-slate-100">
                          <td className="py-1.5 text-slate-600">{RESOURCE_LABELS[resource]}</td>
                          {(["canView", "canEdit", "canDelete"] as const).map((action) => (
                            <td key={action} className="py-1.5 text-center">
                              <input
                                type="checkbox"
                                checked={entry.grants[resource][action]}
                                onChange={() => toggleGrant(entry.key, resource, action)}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </div>

          {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Role"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Scopes</th>
              <th className="px-4 py-3">Users</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {roles.map((role) => {
              const scopeCount = new Set(role.permissions.map((p) => scopeKey(p.businessUnitId, p.companyId || undefined))).size;
              return (
                <tr key={role.id}>
                  <td className="px-4 py-3 font-medium text-slate-800">{role.name}</td>
                  <td className="px-4 py-3 text-slate-600">{role.description || "—"}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {scopeCount} {scopeCount === 1 ? "scope" : "scopes"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{role.userCount}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => startEdit(role)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" title="Edit">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(role)}
                        disabled={role.userCount > 0}
                        className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                        title={role.userCount > 0 ? "Reassign users before deleting" : "Delete"}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {roles.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  No custom roles yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
