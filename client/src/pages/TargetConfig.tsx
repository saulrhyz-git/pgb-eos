import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, Plus, Save } from "lucide-react";
import { api } from "../api/client";
import type { BusinessUnit, Company, Year } from "../api/types";

type FigureKey =
  | "revenueInternal"
  | "revenueExternal"
  | "collectionsInternal"
  | "collectionsExternal"
  | "expensesInternal"
  | "expensesExternal";

const emptyForm: Record<FigureKey, string> = {
  revenueInternal: "",
  revenueExternal: "",
  collectionsInternal: "",
  collectionsExternal: "",
  expensesInternal: "",
  expensesExternal: "",
};

const FIELD_GROUPS: { title: string; internal: FigureKey; external: FigureKey }[] = [
  { title: "Revenue", internal: "revenueInternal", external: "revenueExternal" },
  { title: "Collections", internal: "collectionsInternal", external: "collectionsExternal" },
  { title: "Expenses", internal: "expensesInternal", external: "expensesExternal" },
];

type Mode = "annual" | "quarter";

export default function TargetConfig() {
  const [years, setYears] = useState<Year[]>([]);
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);

  const [mode, setMode] = useState<Mode>("annual");
  const [yearId, setYearId] = useState("");
  const [quarter, setQuarter] = useState(1);
  const [businessUnitId, setBusinessUnitId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [form, setForm] = useState(emptyForm);

  const [newYear, setNewYear] = useState(new Date().getFullYear() + 1);
  const [newBuName, setNewBuName] = useState("");
  const [newCompanyName, setNewCompanyName] = useState("");

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  function refreshYears() {
    api.years().then((ys) => {
      setYears(ys);
      if (!yearId && ys.length) setYearId(ys[0].id);
    });
  }
  function refreshBUs() {
    api.businessUnits().then((bus) => {
      setBusinessUnits(bus);
      if (!businessUnitId && bus.length) setBusinessUnitId(bus[0].id);
    });
  }

  useEffect(() => {
    refreshYears();
    refreshBUs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!businessUnitId) return;
    api.companies(businessUnitId).then((cs) => {
      setCompanies(cs);
      setCompanyId(cs[0]?.id || "");
    });
  }, [businessUnitId]);

  useEffect(() => {
    if (!yearId || !companyId) return;
    setSaved(false);
    const loader = mode === "annual" ? api.annualTargets(yearId, businessUnitId) : api.quarterTargets(yearId, quarter, businessUnitId);
    loader.then((rows: any[]) => {
      const existing = rows.find((r) => r.companyId === companyId);
      if (existing) {
        setForm({
          revenueInternal: String(existing.revenueInternal ?? ""),
          revenueExternal: String(existing.revenueExternal ?? ""),
          collectionsInternal: String(existing.collectionsInternal ?? ""),
          collectionsExternal: String(existing.collectionsExternal ?? ""),
          expensesInternal: String(existing.expensesInternal ?? ""),
          expensesExternal: String(existing.expensesExternal ?? ""),
        });
      } else {
        setForm(emptyForm);
      }
    });
  }, [mode, yearId, quarter, companyId, businessUnitId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    setSaved(false);
    try {
      const figures = {
        revenueInternal: Number(form.revenueInternal) || 0,
        revenueExternal: Number(form.revenueExternal) || 0,
        collectionsInternal: Number(form.collectionsInternal) || 0,
        collectionsExternal: Number(form.collectionsExternal) || 0,
        expensesInternal: Number(form.expensesInternal) || 0,
        expensesExternal: Number(form.expensesExternal) || 0,
      };
      if (mode === "annual") {
        await api.putAnnualTarget({ companyId, yearId, ...figures });
      } else {
        await api.putQuarterTarget({ companyId, yearId, quarter, ...figures });
      }
      setSaved(true);
    } catch (err: any) {
      setError(err.message || "Failed to save target");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddYear(e: FormEvent) {
    e.preventDefault();
    await api.createYear(Number(newYear));
    refreshYears();
  }
  async function handleAddBu(e: FormEvent) {
    e.preventDefault();
    if (!newBuName.trim()) return;
    await api.createBusinessUnit(newBuName.trim());
    setNewBuName("");
    refreshBUs();
  }
  async function handleAddCompany(e: FormEvent) {
    e.preventDefault();
    if (!newCompanyName.trim() || !businessUnitId) return;
    await api.createCompany(newCompanyName.trim(), businessUnitId);
    setNewCompanyName("");
    api.companies(businessUnitId).then(setCompanies);
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <div>
        <h2 className="mb-1 text-lg font-semibold text-slate-800">Target Configuration</h2>
        <p className="text-sm text-slate-500">Set up Annual and Quarterly targets at the start of a cycle, and manage Years / Business Units / Companies.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <form onSubmit={handleAddYear} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 text-xs font-semibold uppercase text-slate-400">Add Year</div>
          <div className="flex gap-2">
            <input
              type="number"
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              value={newYear}
              onChange={(e) => setNewYear(Number(e.target.value))}
            />
            <button className="rounded-md bg-brand-500 p-2 text-white hover:bg-brand-600">
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </form>
        <form onSubmit={handleAddBu} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 text-xs font-semibold uppercase text-slate-400">Add Business Unit</div>
          <div className="flex gap-2">
            <input
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              placeholder="e.g. Retail"
              value={newBuName}
              onChange={(e) => setNewBuName(e.target.value)}
            />
            <button className="rounded-md bg-brand-500 p-2 text-white hover:bg-brand-600">
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </form>
        <form onSubmit={handleAddCompany} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 text-xs font-semibold uppercase text-slate-400">Add Company (to selected BU)</div>
          <div className="flex gap-2">
            <input
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              placeholder="Company name"
              value={newCompanyName}
              onChange={(e) => setNewCompanyName(e.target.value)}
            />
            <button className="rounded-md bg-brand-500 p-2 text-white hover:bg-brand-600">
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </form>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex rounded-md border border-slate-200 p-0.5 text-xs w-fit">
          <button
            type="button"
            onClick={() => setMode("annual")}
            className={`rounded px-3 py-1.5 font-medium ${mode === "annual" ? "bg-brand-500 text-white" : "text-slate-500"}`}
          >
            Annual Target
          </button>
          <button
            type="button"
            onClick={() => setMode("quarter")}
            className={`rounded px-3 py-1.5 font-medium ${mode === "quarter" ? "bg-brand-500 text-white" : "text-slate-500"}`}
          >
            Quarter Target
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Year</label>
            <select className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={yearId} onChange={(e) => setYearId(e.target.value)}>
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.year}
                </option>
              ))}
            </select>
          </div>
          {mode === "quarter" && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Quarter</label>
              <select className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={quarter} onChange={(e) => setQuarter(Number(e.target.value))}>
                {[1, 2, 3, 4].map((q) => (
                  <option key={q} value={q}>
                    Q{q}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Business Unit</label>
            <select
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={businessUnitId}
              onChange={(e) => setBusinessUnitId(e.target.value)}
            >
              {businessUnits.map((bu) => (
                <option key={bu.id} value={bu.id}>
                  {bu.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Company</label>
            <select className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {FIELD_GROUPS.map((group) => (
            <div key={group.title} className="rounded-md border border-slate-100 bg-slate-50/60 p-4">
              <div className="mb-2 text-sm font-semibold text-slate-700">{group.title}</div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500">Internal</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={form[group.internal]}
                    onChange={(e) => setForm((f) => ({ ...f, [group.internal]: e.target.value }))}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500">External</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={form[group.external]}
                    onChange={(e) => setForm((f) => ({ ...f, [group.external]: e.target.value }))}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

        <button
          type="submit"
          disabled={saving || !companyId || !yearId}
          className="flex items-center justify-center gap-2 rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {saved ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {saving ? "Saving..." : saved ? "Saved" : `Save ${mode === "annual" ? "Annual" : "Quarter"} Target`}
        </button>
      </form>
    </div>
  );
}
