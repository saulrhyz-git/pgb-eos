import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, Save } from "lucide-react";
import { api } from "../api/client";
import type { BusinessUnit, Company, DisbursementCategory, Year } from "../api/types";
import { useAuth } from "../contexts/AuthContext";

// Shared entry form for all three Disbursement sub-tabs (Advances/Loans/
// Interests) — each is the same page, parameterized by category (see
// App.tsx's three /disbursements/* routes). Mirrors IntegratorPortal.tsx's
// single-category-at-a-time submission, but Disbursements are recorded, not
// targeted, so there's no Target-side counterpart to fill in alongside it.
interface Props {
  category: DisbursementCategory;
  title: string;
}

export default function DisbursementEntry({ category, title }: Props) {
  const { user } = useAuth();
  const [years, setYears] = useState<Year[]>([]);
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);

  const [yearId, setYearId] = useState("");
  const [quarter, setQuarter] = useState(1);
  const [businessUnitId, setBusinessUnitId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [internal, setInternal] = useState("");
  const [external, setExternal] = useState("");
  const [remarks, setRemarks] = useState("");

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!businessUnitId) return;
    api.companies(businessUnitId).then((cs) => {
      setCompanies(cs);
      setCompanyId(cs[0]?.id || "");
    });
  }, [businessUnitId]);

  // Pre-fill with any existing figures for this scope + category so the
  // integrator is editing, not blindly overwriting — the other two
  // categories on the same underlying row are never touched here.
  useEffect(() => {
    if (!yearId || !companyId) return;
    setSaved(false);
    api
      .disbursements({ yearId, quarter, companyId })
      .then((rows) => {
        const existing = rows[0] || null;
        if (existing && category === "ADVANCES") {
          setInternal(String(existing.advancesInternal ?? ""));
          setExternal(String(existing.advancesExternal ?? ""));
          setRemarks(existing.advancesRemarks || "");
        } else if (existing && category === "LOANS") {
          setInternal(String(existing.loansInternal ?? ""));
          setExternal(String(existing.loansExternal ?? ""));
          setRemarks(existing.loansRemarks || "");
        } else if (existing && category === "INTERESTS") {
          setInternal(String(existing.interestsInternal ?? ""));
          setExternal(String(existing.interestsExternal ?? ""));
          setRemarks(existing.interestsRemarks || "");
        } else {
          setInternal("");
          setExternal("");
          setRemarks("");
        }
      })
      .catch(() => {
        setInternal("");
        setExternal("");
        setRemarks("");
      });
  }, [yearId, quarter, companyId, businessUnitId, category]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    setSaved(false);
    try {
      await api.putDisbursement({
        companyId,
        yearId,
        quarter,
        category,
        internal: Number(internal) || 0,
        external: Number(external) || 0,
        remarks,
      });
      setSaved(true);
    } catch (err: any) {
      setError(err.message || `Failed to save ${title.toLowerCase()}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="mb-1 text-lg font-semibold text-slate-800">Disbursements &middot; {title}</h2>
      <p className="mb-6 text-sm text-slate-500">
        {user?.role === "BU_INTEGRATOR"
          ? `Record ${title.toLowerCase()} for the companies in your assigned Business Unit(s), per Year/Quarter/Company.`
          : `Record or override ${title.toLowerCase()} for any company, per Year/Quarter/Company.`}
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="grid grid-cols-1 gap-4 xs:grid-cols-2 sm:grid-cols-4">
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

        <div className="rounded-md border border-slate-100 bg-slate-50/60 p-3 sm:p-4">
          <div className="mb-2 text-sm font-semibold text-slate-700">{title}</div>
          <div className="grid grid-cols-1 gap-4 xs:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Internal</label>
              <input
                type="number"
                min={0}
                step="0.01"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={internal}
                onChange={(e) => setInternal(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">External</label>
              <input
                type="number"
                min={0}
                step="0.01"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={external}
                onChange={(e) => setExternal(e.target.value)}
              />
            </div>
          </div>
          <div className="mt-3 flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">{title} Remarks</label>
            <textarea
              className="min-h-[60px] rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder={`Notes on this quarter's ${title.toLowerCase()}...`}
            />
          </div>
        </div>

        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

        <button
          type="submit"
          disabled={saving || !companyId || !yearId}
          className="flex items-center justify-center gap-2 rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {saved ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {saving ? "Saving..." : saved ? "Saved" : `Save ${title}`}
        </button>
      </form>
    </div>
  );
}
