import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, Save } from "lucide-react";
import { api } from "../api/client";
import type { BusinessUnit, Company, Year } from "../api/types";
import { useAuth } from "../contexts/AuthContext";
import { formatQuarterRange } from "../utils/quarterDates";

type FigureKey =
  | "revenueInternal"
  | "revenueExternal"
  | "collectionsInternal"
  | "collectionsExternal"
  | "expensesInternal"
  | "expensesExternal";

type RemarksKey = "revenueRemarks" | "collectionsRemarks" | "expensesRemarks";

const FIELD_GROUPS: { title: string; internal: FigureKey; external: FigureKey; remarks: RemarksKey }[] = [
  { title: "Revenue", internal: "revenueInternal", external: "revenueExternal", remarks: "revenueRemarks" },
  { title: "Collections", internal: "collectionsInternal", external: "collectionsExternal", remarks: "collectionsRemarks" },
  { title: "Expenses", internal: "expensesInternal", external: "expensesExternal", remarks: "expensesRemarks" },
];

const emptyForm: Record<FigureKey, string> = {
  revenueInternal: "",
  revenueExternal: "",
  collectionsInternal: "",
  collectionsExternal: "",
  expensesInternal: "",
  expensesExternal: "",
};

const emptyRemarks: Record<RemarksKey, string> = {
  revenueRemarks: "",
  collectionsRemarks: "",
  expensesRemarks: "",
};

export default function IntegratorPortal() {
  const { user } = useAuth();
  const [years, setYears] = useState<Year[]>([]);
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);

  const [yearId, setYearId] = useState("");
  const [quarter, setQuarter] = useState(1);
  const [businessUnitId, setBusinessUnitId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [remarks, setRemarks] = useState(emptyRemarks);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Default to the real current calendar quarter (server clock) when
    // possible, so Data Entry opens already on "today"'s quarter instead of
    // an arbitrary first-in-list year.
    Promise.all([api.years(), api.currentQuarter().catch(() => null)]).then(([ys, current]) => {
      setYears(ys);
      if (ys.length) {
        if (current?.yearId && ys.some((y) => y.id === current.yearId)) {
          setYearId(current.yearId);
          setQuarter(current.quarter);
        } else {
          setYearId(ys[0].id);
        }
      }
    });
    api.businessUnits().then((bus) => {
      setBusinessUnits(bus);
      if (bus.length) setBusinessUnitId(bus[0].id);
    });
  }, []);

  useEffect(() => {
    if (!businessUnitId) return;
    api.companies(businessUnitId).then((cs) => {
      setCompanies(cs);
      setCompanyId(cs[0]?.id || "");
    });
  }, [businessUnitId]);

  // Pre-fill the form with any existing actual for the selected scope so the
  // integrator is editing, not blindly overwriting.
  useEffect(() => {
    if (!yearId || !companyId) return;
    setSaved(false);
    api
      .actuals({ yearId, quarter, companyId })
      .then((rows) => {
        const existing = rows[0] || null;
        if (existing) {
          setForm({
            revenueInternal: String(existing.revenueInternal ?? ""),
            revenueExternal: String(existing.revenueExternal ?? ""),
            collectionsInternal: String(existing.collectionsInternal ?? ""),
            collectionsExternal: String(existing.collectionsExternal ?? ""),
            expensesInternal: String(existing.expensesInternal ?? ""),
            expensesExternal: String(existing.expensesExternal ?? ""),
          });
          setRemarks({
            revenueRemarks: existing.revenueRemarks || "",
            collectionsRemarks: existing.collectionsRemarks || "",
            expensesRemarks: existing.expensesRemarks || "",
          });
        } else {
          setForm(emptyForm);
          setRemarks(emptyRemarks);
        }
      })
      .catch(() => {
        setForm(emptyForm);
        setRemarks(emptyRemarks);
      });
  }, [yearId, quarter, companyId, businessUnitId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    setSaved(false);
    try {
      const payload = {
        companyId,
        yearId,
        quarter,
        ...remarks,
        revenueInternal: Number(form.revenueInternal) || 0,
        revenueExternal: Number(form.revenueExternal) || 0,
        collectionsInternal: Number(form.collectionsInternal) || 0,
        collectionsExternal: Number(form.collectionsExternal) || 0,
        expensesInternal: Number(form.expensesInternal) || 0,
        expensesExternal: Number(form.expensesExternal) || 0,
      };
      await api.putActual(payload);
      setSaved(true);
    } catch (err: any) {
      setError(err.message || "Failed to save quarterly figures");
    } finally {
      setSaving(false);
    }
  }

  const selectedYear = years.find((y) => y.id === yearId)?.year;
  const quarterRangeLabel = selectedYear != null ? formatQuarterRange(selectedYear, quarter) : null;

  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="mb-1 text-lg font-semibold text-slate-800">Quarterly Data Entry</h2>
      <p className="mb-6 text-sm text-slate-500">
        {user?.role === "BU_INTEGRATOR"
          ? "Submit Revenue, Collections, and Expenses for the companies in your assigned Business Unit(s)."
          : "You can enter or override figures for any company."}
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
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
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Quarter</label>
            <select className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={quarter} onChange={(e) => setQuarter(Number(e.target.value))}>
              {[1, 2, 3, 4].map((q) => (
                <option key={q} value={q}>
                  Q{q}
                </option>
              ))}
            </select>
            {quarterRangeLabel && <span className="text-[11px] text-slate-500">{quarterRangeLabel}</span>}
          </div>
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
              <div className="mt-3 flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-500">{group.title} Remarks</label>
                <textarea
                  className="min-h-[60px] rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={remarks[group.remarks]}
                  onChange={(e) => setRemarks((r) => ({ ...r, [group.remarks]: e.target.value }))}
                  placeholder={`Notes on this quarter's ${group.title.toLowerCase()}...`}
                />
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
          {saving ? "Saving..." : saved ? "Saved" : "Save Quarterly Figures"}
        </button>
      </form>
    </div>
  );
}
