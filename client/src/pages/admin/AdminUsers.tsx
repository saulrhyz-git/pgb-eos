import { FormEvent, useEffect, useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { api } from "../../api/client";
import { useAuth } from "../../contexts/AuthContext";
import type { AdminUser, BusinessUnit, CustomRole, Role } from "../../api/types";

const ROLE_LABELS: Record<Role, string> = {
  SUPERADMIN: "Superadmin",
  GROUP_INTEGRATOR: "Group Integrator",
  BU_INTEGRATOR: "BU Integrator",
};

// "" represents a "blank" role (Custom Role only, no base-role access) —
// translated to `null` on submit. Kept distinct from a real Role string so
// the <select> can offer it as its own option.
const emptyForm = {
  id: "" as string | null,
  email: "",
  username: "",
  name: "",
  role: "" as Role | "",
  // Superadmin-authored note about this user, shown in the app header in
  // place of the role label. Not editable by the user themselves.
  description: "",
  password: "",
  businessUnitIds: [] as string[],
  customRoleId: "" as string,
};

export default function AdminUsers() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function refresh() {
    api.adminUsers().then(setUsers);
    api.businessUnits().then(setBusinessUnits);
    api.customRoles().then(setCustomRoles);
  }

  useEffect(refresh, []);

  function startCreate() {
    setForm(emptyForm);
    setError("");
    setShowForm(true);
  }

  function startEdit(u: AdminUser) {
    setForm({
      id: u.id,
      email: u.email,
      username: u.username || "",
      name: u.name,
      role: u.role ?? "",
      description: u.description || "",
      password: "",
      businessUnitIds: u.businessUnits.map((b) => b.id),
      customRoleId: u.customRole?.id || "",
    });
    setError("");
    setShowForm(true);
  }

  function toggleBu(id: string) {
    setForm((f) => ({
      ...f,
      businessUnitIds: f.businessUnitIds.includes(id)
        ? f.businessUnitIds.filter((x) => x !== id)
        : [...f.businessUnitIds, id],
    }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (form.role === "BU_INTEGRATOR" && form.businessUnitIds.length === 0) {
      setError("A BU Integrator must be assigned to at least one Business Unit");
      return;
    }
    setSaving(true);
    try {
      const role = form.role === "" ? null : form.role;
      if (form.id) {
        const payload: any = {
          email: form.email,
          username: form.username || null,
          name: form.name,
          role,
          description: form.description,
          businessUnitIds: form.businessUnitIds,
          customRoleId: form.customRoleId || null,
        };
        if (form.password) payload.password = form.password;
        await api.adminUpdateUser(form.id, payload);
      } else {
        await api.adminCreateUser({
          email: form.email,
          username: form.username || undefined,
          name: form.name,
          role,
          description: form.description,
          password: form.password,
          businessUnitIds: form.businessUnitIds,
          customRoleId: form.customRoleId || null,
        });
      }
      setShowForm(false);
      refresh();
    } catch (err: any) {
      setError(err.message || "Failed to save user");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(u: AdminUser) {
    if (!confirm(`Delete user "${u.name}"? This cannot be undone.`)) return;
    try {
      await api.adminDeleteUser(u.id);
      refresh();
    } catch (err: any) {
      alert(err.message || "Failed to delete user");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-slate-800">Users</h3>
        <button
          onClick={startCreate}
          className="flex items-center gap-2 rounded-md bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600"
        >
          <Plus className="h-4 w-4" /> Add User
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-700">{form.id ? "Edit User" : "New User"}</div>
            <button type="button" onClick={() => setShowForm(false)} className="text-slate-500 hover:text-slate-600">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Name</label>
              <input
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Email</label>
              <input
                type="email"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Username (optional)</label>
              <input
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Role</label>
              <select
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role | "" }))}
              >
                <option value="">No base role (Custom Role only)</option>
                {Object.entries(ROLE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              {form.role === "" && (
                <span className="text-xs text-slate-500">
                  This user has no base-role access at all — assign a Custom Role below so they can see anything.
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1 sm:col-span-2">
              <label className="text-xs font-medium text-slate-500">Description (optional)</label>
              <textarea
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                rows={2}
                placeholder="e.g. their title or team — shown in the app header instead of their role"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1 sm:col-span-2">
              <label className="text-xs font-medium text-slate-500">
                {form.id ? "Reset password (leave blank to keep current)" : "Password"}
              </label>
              <input
                type="password"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                minLength={8}
                required={!form.id}
              />
              <span className="text-xs text-slate-500">
                {form.id
                  ? "Setting a new password will require the user to change it again on next login."
                  : "User will be required to change this password on first login."}
              </span>
            </div>
          </div>

          {(form.role === "BU_INTEGRATOR" || form.role === "GROUP_INTEGRATOR") && (
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-slate-500">
                {form.role === "BU_INTEGRATOR" ? "Assigned Business Units (required)" : "Assigned Business Units (optional)"}
              </label>
              <div className="flex flex-wrap gap-2">
                {businessUnits.map((bu) => (
                  <label
                    key={bu.id}
                    className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium ${
                      form.businessUnitIds.includes(bu.id)
                        ? "border-brand-500 bg-brand-50 text-brand-700"
                        : "border-slate-200 text-slate-600"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={form.businessUnitIds.includes(bu.id)}
                      onChange={() => toggleBu(bu.id)}
                    />
                    {bu.name}
                  </label>
                ))}
              </div>
              <span className="text-xs text-slate-500">
                {form.role === "BU_INTEGRATOR"
                  ? "A BU Integrator must be tied to at least one Business Unit."
                  : "Leave none selected for global access to all Business Units, or select one or more to scope this Group Integrator to just those."}
              </span>
            </div>
          )}

          {form.role !== "SUPERADMIN" && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Custom Role (optional)</label>
              <select
                className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:w-1/2"
                value={form.customRoleId}
                onChange={(e) => setForm((f) => ({ ...f, customRoleId: e.target.value }))}
              >
                <option value="">None — use the default Business Unit access above</option>
                {customRoles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <span className="text-xs text-slate-500">
                An additional, more granular layer on top of the role above — narrows this user's View/Edit/Delete access to
                exactly the Business Units/Companies and resources (Targets/Revenue/Collections/Expenses/Rocks) the Custom Role
                grants. Manage roles under the Roles tab.
              </span>
            </div>
          )}

          {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save User"}
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
        <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Email / Username</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Custom Role</th>
              <th className="px-4 py-3">Business Units</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3 font-medium text-slate-800">{u.name}</td>
                <td className="px-4 py-3 text-slate-500">
                  <span className="line-clamp-2 max-w-xs">{u.description || "—"}</span>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  <div>{u.email}</div>
                  {u.username && <div className="text-xs text-slate-500">@{u.username}</div>}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {u.role ? (
                    ROLE_LABELS[u.role]
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      No base role
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">{u.customRole?.name || "—"}</td>
                <td className="px-4 py-3 text-slate-600">
                  {u.businessUnits.length
                    ? u.businessUnits.map((b) => b.name).join(", ")
                    : u.role === "GROUP_INTEGRATOR"
                    ? "All (global)"
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  {u.mustChangePassword ? (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                      Pending password change
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Active</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => startEdit(u)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" title="Edit">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(u)}
                      disabled={u.id === me?.id}
                      className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                      title={u.id === me?.id ? "You cannot delete your own account" : "Delete"}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                  No users yet.
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
