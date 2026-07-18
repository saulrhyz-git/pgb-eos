import { FormEvent, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ListChecks,
  Loader2,
  Pencil,
  Percent,
  Plus,
  SkipForward,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { attainmentColor } from "../utils/format";
import type { BusinessGoal, BusinessUnit, Company, Rock, RockStatus, Year } from "../api/types";

const STATUS_LABELS: Record<RockStatus, string> = {
  PENDING: "Pending",
  ON_TRACK: "On Track",
  AT_RISK: "At Risk",
  TARGET_MET: "Target Met",
};

const STATUS_BADGE: Record<RockStatus, string> = {
  PENDING: "bg-slate-100 text-slate-600",
  ON_TRACK: "bg-emerald-50 text-emerald-700",
  AT_RISK: "bg-red-50 text-red-700",
  TARGET_MET: "bg-brand-50 text-brand-700",
};

const emptyRockForm = {
  id: "" as string | null,
  companyId: "",
  quarter: 1,
  businessGoalId: "",
  title: "",
  description: "",
  remarks: "",
  ownerName: "",
  status: "PENDING" as RockStatus,
  progressPct: 0,
};

const emptyGoalForm = {
  name: "",
  businessUnitIds: [] as string[],
};

function KpiCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-slate-500">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold text-slate-800">{value}</div>
      {sub && <div className="mt-1 text-sm font-medium text-slate-500">{sub}</div>}
    </div>
  );
}

function BuChecklist({
  businessUnits,
  selected,
  onToggle,
}: {
  businessUnits: BusinessUnit[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {businessUnits.map((bu) => (
        <label
          key={bu.id}
          className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium ${
            selected.includes(bu.id) ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600"
          }`}
        >
          <input type="checkbox" className="hidden" checked={selected.includes(bu.id)} onChange={() => onToggle(bu.id)} />
          {bu.name}
        </label>
      ))}
    </div>
  );
}

export default function Rocks() {
  const { user } = useAuth();
  const canManageStructure = user?.role === "GROUP_INTEGRATOR" || user?.role === "SUPERADMIN";
  const canSeeAllBUs = user?.role === "GROUP_INTEGRATOR" || user?.role === "SUPERADMIN";

  const [years, setYears] = useState<Year[]>([]);
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [businessGoals, setBusinessGoals] = useState<BusinessGoal[]>([]);
  const [rocks, setRocks] = useState<Rock[]>([]);

  const [yearId, setYearId] = useState("");
  const [quarter, setQuarter] = useState(0); // 0 = All Quarters
  const [businessUnitId, setBusinessUnitId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [businessGoalId, setBusinessGoalId] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rollingOver, setRollingOver] = useState(false);

  const [showRockForm, setShowRockForm] = useState(false);
  const [rockForm, setRockForm] = useState(emptyRockForm);
  const [formBusinessUnitId, setFormBusinessUnitId] = useState("");
  const [formCompanies, setFormCompanies] = useState<Company[]>([]);
  const [savingRock, setSavingRock] = useState(false);
  const [rockError, setRockError] = useState("");

  const [newGoalForm, setNewGoalForm] = useState(emptyGoalForm);
  const [goalError, setGoalError] = useState("");
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [editGoalForm, setEditGoalForm] = useState(emptyGoalForm);
  const [savingGoal, setSavingGoal] = useState(false);

  function refreshGoals() {
    api.businessGoals().then(setBusinessGoals);
  }

  useEffect(() => {
    // Default the Year to the real current calendar year (server clock) when
    // possible, so the page opens already lined up with "today" instead of
    // an arbitrary first-in-list year. Quarter deliberately stays on "All
    // Quarters" by default — this page is a broad overview — but its
    // selector still shows the real date range once a specific one is picked.
    api.years().then((ys) => {
      setYears(ys);
      if (!yearId && ys.length) {
        api.currentQuarter().catch(() => null).then((current) => {
          if (current?.yearId && ys.some((y) => y.id === current.yearId)) {
            setYearId(current.yearId);
          } else {
            setYearId(ys[0].id);
          }
        });
      }
    });
    api.businessUnits().then((bus) => {
      setBusinessUnits(bus);
      if (user?.role === "BU_INTEGRATOR" && !businessUnitId && bus.length) setBusinessUnitId(bus[0].id);
    });
    refreshGoals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    api.companies(businessUnitId || undefined).then(setCompanies);
  }, [businessUnitId]);

  useEffect(() => {
    api.companies(formBusinessUnitId || undefined).then(setFormCompanies);
  }, [formBusinessUnitId]);

  function loadRocks() {
    if (!yearId) return;
    setLoading(true);
    setError("");
    api
      .rocks({
        yearId,
        quarter: quarter || undefined,
        businessUnitId: businessUnitId || undefined,
        companyId: companyId || undefined,
        businessGoalId: businessGoalId || undefined,
      })
      .then(setRocks)
      .catch((err) => setError(err.message || "Failed to load rocks"))
      .finally(() => setLoading(false));
  }

  useEffect(loadRocks, [yearId, quarter, businessUnitId, companyId, businessGoalId]);

  // Business goals usable for a given Business Unit: global (no BU tags) or explicitly assigned to it.
  function goalsForBu(buId: string) {
    return businessGoals.filter((g) => g.businessUnits.length === 0 || g.businessUnits.some((b) => b.id === buId));
  }

  function startAddRock() {
    setRockForm({ ...emptyRockForm, quarter: quarter || 1, companyId: companyId || "" });
    setFormBusinessUnitId(businessUnitId);
    setRockError("");
    setShowRockForm(true);
  }

  function startEditRock(r: Rock) {
    setRockForm({
      id: r.id,
      companyId: r.companyId,
      quarter: r.quarter,
      businessGoalId: r.businessGoalId || "",
      title: r.title,
      description: r.description,
      remarks: r.remarks || "",
      ownerName: r.ownerName,
      status: r.status,
      progressPct: r.progressPct,
    });
    setFormBusinessUnitId(r.company.businessUnitId);
    setRockError("");
    setShowRockForm(true);
  }

  async function handleRockSubmit(e: FormEvent) {
    e.preventDefault();
    setRockError("");
    if (!rockForm.companyId) {
      setRockError("Company is required");
      return;
    }
    if (!rockForm.title.trim()) {
      setRockError("Title is required");
      return;
    }
    setSavingRock(true);
    try {
      const shared = {
        quarter: rockForm.quarter,
        businessGoalId: rockForm.businessGoalId || null,
        title: rockForm.title.trim(),
        description: rockForm.description,
        remarks: rockForm.remarks,
        ownerName: rockForm.ownerName,
        status: rockForm.status,
        progressPct: rockForm.progressPct,
      };
      if (rockForm.id) {
        await api.updateRock(rockForm.id, shared);
      } else {
        await api.createRock({ companyId: rockForm.companyId, yearId, ...shared });
      }
      setShowRockForm(false);
      loadRocks();
    } catch (err: any) {
      setRockError(err.message || "Failed to save rock");
    } finally {
      setSavingRock(false);
    }
  }

  async function handleDeleteRock(r: Rock) {
    if (!confirm(`Delete rock "${r.title}"?`)) return;
    try {
      await api.deleteRock(r.id);
      loadRocks();
    } catch (err: any) {
      alert(err.message || "Failed to delete rock");
    }
  }

  // Carries every not-yet-complete Rock in the current filter scope forward
  // one quarter. Requires a specific Quarter to be selected (not "All
  // Quarters") since "next quarter" is otherwise ambiguous.
  async function handleRollover() {
    if (!yearId || !quarter) return;
    const currentYear = years.find((y) => y.id === yearId);
    const fromLabel = `Q${quarter}${currentYear ? ` ${currentYear.year}` : ""}`;
    const toLabel =
      quarter === 4
        ? `Q1 ${currentYear ? currentYear.year + 1 : ""}`
        : `Q${quarter + 1}${currentYear ? ` ${currentYear.year}` : ""}`;
    if (
      !confirm(
        `Roll over all incomplete Rocks from ${fromLabel} to ${toLabel}? This creates a copy of each incomplete Rock in ${toLabel} — the originals in ${fromLabel} are left as-is.`
      )
    ) {
      return;
    }
    setRollingOver(true);
    setError("");
    try {
      const result = await api.rolloverRocks({
        yearId,
        quarter,
        businessUnitId: businessUnitId || undefined,
        companyId: companyId || undefined,
        businessGoalId: businessGoalId || undefined,
      });
      alert(`Rolled over ${result.rolledOver} rock${result.rolledOver === 1 ? "" : "s"} to ${toLabel}.`);
      loadRocks();
    } catch (err: any) {
      setError(err.message || "Failed to roll over rocks");
    } finally {
      setRollingOver(false);
    }
  }

  async function quickUpdate(r: Rock, patch: Partial<{ status: RockStatus; progressPct: number }>) {
    setRocks((prev) => prev.map((x) => (x.id === r.id ? { ...x, ...patch } : x)));
    try {
      await api.updateRock(r.id, patch);
    } catch (err: any) {
      alert(err.message || "Failed to update rock");
      loadRocks();
    }
  }

  function toggleNewGoalBu(id: string) {
    setNewGoalForm((f) => ({
      ...f,
      businessUnitIds: f.businessUnitIds.includes(id) ? f.businessUnitIds.filter((x) => x !== id) : [...f.businessUnitIds, id],
    }));
  }

  function toggleEditGoalBu(id: string) {
    setEditGoalForm((f) => ({
      ...f,
      businessUnitIds: f.businessUnitIds.includes(id) ? f.businessUnitIds.filter((x) => x !== id) : [...f.businessUnitIds, id],
    }));
  }

  async function handleAddGoal(e: FormEvent) {
    e.preventDefault();
    if (!newGoalForm.name.trim()) return;
    setGoalError("");
    setSavingGoal(true);
    try {
      await api.createBusinessGoal({ name: newGoalForm.name.trim(), businessUnitIds: newGoalForm.businessUnitIds });
      setNewGoalForm(emptyGoalForm);
      refreshGoals();
    } catch (err: any) {
      setGoalError(err.message || "Failed to add business goal");
    } finally {
      setSavingGoal(false);
    }
  }

  function startEditGoal(g: BusinessGoal) {
    setEditingGoalId(g.id);
    setEditGoalForm({ name: g.name, businessUnitIds: g.businessUnits.map((b) => b.id) });
    setGoalError("");
  }

  async function handleSaveGoalEdit(e: FormEvent) {
    e.preventDefault();
    if (!editingGoalId || !editGoalForm.name.trim()) return;
    setGoalError("");
    setSavingGoal(true);
    try {
      await api.updateBusinessGoal(editingGoalId, {
        name: editGoalForm.name.trim(),
        businessUnitIds: editGoalForm.businessUnitIds,
      });
      setEditingGoalId(null);
      refreshGoals();
    } catch (err: any) {
      setGoalError(err.message || "Failed to update business goal");
    } finally {
      setSavingGoal(false);
    }
  }

  async function handleDeleteGoal(g: BusinessGoal) {
    if (!confirm(`Delete business goal "${g.name}"? Rocks tagged with it will keep their data but lose the tag.`)) return;
    try {
      await api.deleteBusinessGoal(g.id);
      refreshGoals();
      loadRocks();
    } catch (err: any) {
      alert(err.message || "Failed to delete business goal");
    }
  }

  const total = rocks.length;
  const targetMet = rocks.filter((r) => r.status === "TARGET_MET").length;
  const onTrack = rocks.filter((r) => r.status === "ON_TRACK").length;
  const atRiskPending = rocks.filter((r) => r.status === "AT_RISK" || r.status === "PENDING").length;
  const avgProgress = total ? Math.round(rocks.reduce((sum, r) => sum + r.progressPct, 0) / total) : 0;

  const formGoals = goalsForBu(formBusinessUnitId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="mb-1 text-lg font-semibold text-slate-800">Rocks</h2>
        <p className="text-sm text-slate-500">
          Track this quarter's major priorities per company. BU Integrators add and update their own Rocks; progress
          and status roll up into the summary below.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">Year</label>
          <select
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
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
          <label className="text-xs font-medium text-slate-500">Quarter</label>
          <select
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
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
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">Business Unit</label>
          <select
            className="min-w-[180px] rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            value={businessUnitId}
            onChange={(e) => {
              setBusinessUnitId(e.target.value);
              setCompanyId("");
            }}
          >
            {canSeeAllBUs && <option value="">All Business Units</option>}
            {businessUnits.map((bu) => (
              <option key={bu.id} value={bu.id}>
                {bu.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">Company</label>
          <select
            className="min-w-[180px] rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
          >
            <option value="">All Companies</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">Business Goal</label>
          <select
            className="min-w-[180px] rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            value={businessGoalId}
            onChange={(e) => setBusinessGoalId(e.target.value)}
          >
            <option value="">All Business Goals</option>
            {businessGoals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {canManageStructure && (
            <button
              onClick={handleRollover}
              disabled={rollingOver || !yearId || !quarter}
              title={
                !quarter
                  ? "Select a specific Quarter (not All Quarters) to roll over"
                  : "Carry every incomplete Rock in this scope forward to the next quarter"
              }
              className="flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {rollingOver ? <Loader2 className="h-4 w-4 animate-spin" /> : <SkipForward className="h-4 w-4" />}
              {rollingOver ? "Rolling over..." : "Rollover"}
            </button>
          )}
          <button
            onClick={startAddRock}
            className="flex items-center gap-2 rounded-md bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600"
          >
            <Plus className="h-4 w-4" /> Add Rock
          </button>
        </div>
      </div>

      {error && <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard icon={<ListChecks className="h-4 w-4" />} label="Total Rocks" value={String(total)} />
        <KpiCard icon={<CheckCircle2 className="h-4 w-4" />} label="Target Met" value={String(targetMet)} />
        <KpiCard icon={<TrendingUp className="h-4 w-4" />} label="On Track" value={String(onTrack)} />
        <KpiCard icon={<AlertTriangle className="h-4 w-4" />} label="At Risk / Pending" value={String(atRiskPending)} />
        <KpiCard icon={<Percent className="h-4 w-4" />} label="Avg Progress" value={`${avgProgress}%`} />
      </div>

      {canManageStructure && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 text-xs font-semibold uppercase text-slate-500">Manage Business Goals</div>
          <form onSubmit={handleAddGoal} className="mb-3 flex flex-col gap-2">
            <input
              className="w-full max-w-xs rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              placeholder="e.g. Improve Client Retention"
              value={newGoalForm.name}
              onChange={(e) => setNewGoalForm((f) => ({ ...f, name: e.target.value }))}
            />
            <div>
              <div className="mb-1 text-xs text-slate-500">
                Assign to Business Unit(s) — leave blank to make it available everywhere
              </div>
              <BuChecklist businessUnits={businessUnits} selected={newGoalForm.businessUnitIds} onToggle={toggleNewGoalBu} />
            </div>
            <button
              type="submit"
              disabled={savingGoal}
              className="flex w-fit items-center gap-2 rounded-md bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" /> Add Business Goal
            </button>
          </form>
          {goalError && <div className="mb-2 text-sm text-red-600">{goalError}</div>}
          <div className="flex flex-col gap-2">
            {businessGoals.map((g) =>
              editingGoalId === g.id ? (
                <form
                  key={g.id}
                  onSubmit={handleSaveGoalEdit}
                  className="flex flex-col gap-2 rounded-md border border-brand-200 bg-brand-50/40 p-3"
                >
                  <input
                    className="w-full max-w-xs rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    value={editGoalForm.name}
                    onChange={(e) => setEditGoalForm((f) => ({ ...f, name: e.target.value }))}
                  />
                  <BuChecklist businessUnits={businessUnits} selected={editGoalForm.businessUnitIds} onToggle={toggleEditGoalBu} />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={savingGoal}
                      className="rounded-md bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingGoalId(null)}
                      className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div
                  key={g.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2 text-xs"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-700">{g.name}</span>
                    {g.businessUnits.length === 0 ? (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500">Global</span>
                    ) : (
                      g.businessUnits.map((bu) => (
                        <span key={bu.id} className="rounded-full bg-brand-50 px-2 py-0.5 text-brand-700">
                          {bu.name}
                        </span>
                      ))
                    )}
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => startEditGoal(g)} className="rounded-md p-1 text-slate-500 hover:text-brand-600" title="Edit">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteGoal(g)}
                      className="rounded-md p-1 text-slate-500 hover:text-red-600"
                      title="Delete goal"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )
            )}
            {businessGoals.length === 0 && <span className="text-xs text-slate-500">No business goals yet.</span>}
          </div>
        </div>
      )}

      {showRockForm && (
        <form onSubmit={handleRockSubmit} className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-700">{rockForm.id ? "Edit Rock" : "New Rock"}</div>
            <button type="button" onClick={() => setShowRockForm(false)} className="text-slate-500 hover:text-slate-600">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Business Unit</label>
              <select
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={formBusinessUnitId}
                onChange={(e) => {
                  setFormBusinessUnitId(e.target.value);
                  setRockForm((f) => ({ ...f, companyId: "", businessGoalId: "" }));
                }}
                disabled={!!rockForm.id}
              >
                {canSeeAllBUs && <option value="">Select...</option>}
                {businessUnits.map((bu) => (
                  <option key={bu.id} value={bu.id}>
                    {bu.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Company</label>
              <select
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={rockForm.companyId}
                onChange={(e) => setRockForm((f) => ({ ...f, companyId: e.target.value }))}
                disabled={!!rockForm.id}
                required
              >
                <option value="">Select...</option>
                {formCompanies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Quarter</label>
              <select
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={rockForm.quarter}
                onChange={(e) => setRockForm((f) => ({ ...f, quarter: Number(e.target.value) }))}
              >
                {[1, 2, 3, 4].map((q) => (
                  <option key={q} value={q}>
                    Q{q}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Business Goal</label>
              <select
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={rockForm.businessGoalId}
                onChange={(e) => setRockForm((f) => ({ ...f, businessGoalId: e.target.value }))}
              >
                <option value="">No business goal</option>
                {formGoals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Title</label>
            <input
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="e.g. Launch new client onboarding process"
              value={rockForm.title}
              onChange={(e) => setRockForm((f) => ({ ...f, title: e.target.value }))}
              required
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Description (optional)</label>
            <textarea
              className="min-h-[70px] rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={rockForm.description}
              onChange={(e) => setRockForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Remarks (optional)</label>
            <textarea
              className="min-h-[60px] rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Notes on progress, blockers, updates..."
              value={rockForm.remarks}
              onChange={(e) => setRockForm((f) => ({ ...f, remarks: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Owner (optional)</label>
              <input
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="Who's accountable"
                value={rockForm.ownerName}
                onChange={(e) => setRockForm((f) => ({ ...f, ownerName: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Status</label>
              <select
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={rockForm.status}
                onChange={(e) => setRockForm((f) => ({ ...f, status: e.target.value as RockStatus }))}
              >
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Progress %</label>
              <input
                type="number"
                min={0}
                max={100}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={rockForm.progressPct}
                onChange={(e) => setRockForm((f) => ({ ...f, progressPct: Math.max(0, Math.min(100, Number(e.target.value))) }))}
              />
            </div>
          </div>

          {rockError && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{rockError}</div>}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={savingRock}
              className="rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
            >
              {savingRock ? "Saving..." : "Save Rock"}
            </button>
            <button
              type="button"
              onClick={() => setShowRockForm(false)}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1020px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Quarter</th>
                <th className="px-4 py-3">Rock</th>
                <th className="px-4 py-3">Business Goal</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Progress</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rocks.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 font-medium text-slate-800">{r.company.name}</td>
                  <td className="px-4 py-3 text-slate-600">Q{r.quarter}</td>
                  <td className="px-4 py-3 text-slate-700">
                    <div className="max-w-xs font-medium">{r.title}</div>
                    {r.description && <div className="mt-0.5 max-w-xs text-xs text-slate-500 line-clamp-2">{r.description}</div>}
                    {r.remarks && (
                      <div className="mt-0.5 max-w-xs text-xs italic text-slate-500 line-clamp-2">Remarks: {r.remarks}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{r.businessGoal?.name || "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{r.ownerName || "—"}</td>
                  <td className="px-4 py-3">
                    <select
                      className={`rounded-full border-0 px-2 py-1 text-xs font-medium ${STATUS_BADGE[r.status]}`}
                      value={r.status}
                      onChange={(e) => quickUpdate(r, { status: e.target.value as RockStatus })}
                    >
                      {Object.entries(STATUS_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        className="w-16 rounded-md border border-slate-200 px-2 py-1 text-xs"
                        defaultValue={r.progressPct}
                        onBlur={(e) => {
                          const next = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                          if (next !== r.progressPct) quickUpdate(r, { progressPct: next });
                        }}
                      />
                      <span className={`text-xs font-semibold ${attainmentColor(r.progressPct)}`}>{r.progressPct}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => startEditRock(r)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" title="Edit">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteRock(r)}
                        className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {rocks.length === 0 && !loading && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                    No Rocks for this scope yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {loading && (
          <div className="flex items-center justify-center gap-2 py-4 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading...
          </div>
        )}
      </div>
    </div>
  );
}
