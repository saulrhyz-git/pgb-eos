import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, Save } from "lucide-react";
import { api } from "../api/client";
import type { BusinessUnit, Company, DisbursementCategory, Year } from "../api/types";
import { useAuth } from "../contexts/AuthContext";

type FigureKey =
  | "revenueInternal"
  | "revenueExternal"
  | "collectionsInternalEarned"
  | "collectionsInternalUnearned"
  | "collectionsInternalOthers"
  | "collectionsExternalEarned"
  | "collectionsExternalUnearned"
  | "collectionsExternalOthers"
  | "expensesInterest"
  | "expensesDepreciation"
  | "expensesOtherNonCash";

type RemarksKey =
  | "revenueRemarks"
  | "collectionsInternalEarnedRemarks"
  | "collectionsInternalUnearnedRemarks"
  | "collectionsInternalOthersRemarks"
  | "collectionsExternalEarnedRemarks"
  | "collectionsExternalUnearnedRemarks"
  | "collectionsExternalOthersRemarks"
  | "expensesInterestRemarks"
  | "expensesDepreciationRemarks"
  | "expensesOtherNonCashRemarks";

// Revenue is the only category still shaped as a plain Internal/External
// pair with one Remarks field — Collections and Expenses each have their own
// dedicated layout below instead of reusing this group shape (see
// COLLECTIONS_GROUPS/EXPENSES_FIELDS).
const REVENUE_GROUP = { title: "Revenue", internal: "revenueInternal" as FigureKey, external: "revenueExternal" as FigureKey, remarks: "revenueRemarks" as RemarksKey };

// Collections is Internal/External, each broken into three recognition
// types (Earned/Unearned/Others) — one Remarks field per breakdown, same
// granularity as Disbursements' per-category Remarks.
const COLLECTIONS_GROUPS: { title: string; fields: { key: FigureKey; remarksKey: RemarksKey; label: string }[] }[] = [
  {
    title: "Internal",
    fields: [
      { key: "collectionsInternalEarned", remarksKey: "collectionsInternalEarnedRemarks", label: "Revenue - Earned" },
      { key: "collectionsInternalUnearned", remarksKey: "collectionsInternalUnearnedRemarks", label: "Advance Payments - Unearned" },
      { key: "collectionsInternalOthers", remarksKey: "collectionsInternalOthersRemarks", label: "Others" },
    ],
  },
  {
    title: "External",
    fields: [
      { key: "collectionsExternalEarned", remarksKey: "collectionsExternalEarnedRemarks", label: "Revenue - Earned" },
      { key: "collectionsExternalUnearned", remarksKey: "collectionsExternalUnearnedRemarks", label: "Advance Payments - Unearned" },
      { key: "collectionsExternalOthers", remarksKey: "collectionsExternalOthersRemarks", label: "Others" },
    ],
  },
];

// Expenses has no Internal/External split at all — three single-value
// breakdowns instead, each with its own Remarks field.
const EXPENSES_FIELDS: { key: FigureKey; remarksKey: RemarksKey; label: string }[] = [
  { key: "expensesInterest", remarksKey: "expensesInterestRemarks", label: "Interest" },
  { key: "expensesDepreciation", remarksKey: "expensesDepreciationRemarks", label: "Depreciation" },
  { key: "expensesOtherNonCash", remarksKey: "expensesOtherNonCashRemarks", label: "Other Non-Cash Expenses" },
];

const emptyForm: Record<FigureKey, string> = {
  revenueInternal: "",
  revenueExternal: "",
  collectionsInternalEarned: "",
  collectionsInternalUnearned: "",
  collectionsInternalOthers: "",
  collectionsExternalEarned: "",
  collectionsExternalUnearned: "",
  collectionsExternalOthers: "",
  expensesInterest: "",
  expensesDepreciation: "",
  expensesOtherNonCash: "",
};

const emptyRemarks: Record<RemarksKey, string> = {
  revenueRemarks: "",
  collectionsInternalEarnedRemarks: "",
  collectionsInternalUnearnedRemarks: "",
  collectionsInternalOthersRemarks: "",
  collectionsExternalEarnedRemarks: "",
  collectionsExternalUnearnedRemarks: "",
  collectionsExternalOthersRemarks: "",
  expensesInterestRemarks: "",
  expensesDepreciationRemarks: "",
  expensesOtherNonCashRemarks: "",
};

// Disbursements (Advances/Loan Repayments/Interests) live on their own
// DisbursementActual row (see server/src/routes/disbursements.ts) — recorded,
// not targeted, so there's no Target-side counterpart to enter alongside
// them. They used to be their own top-level "Disbursements" nav tab with
// three sub-pages; they're now folded into this single Data Entry page as
// three more field groups sharing the same Year/Quarter/Business Unit/
// Company scope picker as Revenue/Collections/Expenses above, so an
// integrator only has one tab and one scope selection to work with instead
// of switching pages per category.
const DISBURSEMENT_GROUPS: { title: string; category: DisbursementCategory }[] = [
  { title: "Advances", category: "ADVANCES" },
  { title: "Loan Repayments", category: "LOANS" },
  { title: "Interests", category: "INTERESTS" },
];

interface DisbFields {
  internal: string;
  external: string;
  remarks: string;
}

const emptyDisbFields: DisbFields = { internal: "", external: "", remarks: "" };
const emptyDisbForm: Record<DisbursementCategory, DisbFields> = {
  ADVANCES: emptyDisbFields,
  LOANS: emptyDisbFields,
  INTERESTS: emptyDisbFields,
};

// One numeric field + its own Remarks input, stacked — the shape reused for
// every Collections breakdown (6) and Expenses breakdown (3) below.
function BreakdownField({
  label,
  value,
  remarks,
  onValueChange,
  onRemarksChange,
}: {
  label: string;
  value: string;
  remarks: string;
  onValueChange: (v: string) => void;
  onRemarksChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</label>
        <input
          type="number"
          min={0}
          step="0.01"
          className="rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-3 py-2 text-sm"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
        />
      </div>
      <input
        className="rounded-md border border-slate-200 dark:border-slate-700 px-2 py-1 text-xs"
        placeholder="Remarks..."
        value={remarks}
        onChange={(e) => onRemarksChange(e.target.value)}
      />
    </div>
  );
}

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
  const [disbForm, setDisbForm] = useState(emptyDisbForm);

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

  // Pre-fill both the actuals form and the disbursements form with any
  // existing figures for the selected scope, so the integrator is editing,
  // not blindly overwriting — fetched together since they now share one
  // scope picker.
  useEffect(() => {
    if (!yearId || !companyId) return;
    setSaved(false);
    Promise.all([
      api.actuals({ yearId, quarter, companyId }).catch(() => []),
      api.disbursements({ yearId, quarter, companyId }).catch(() => []),
    ]).then(([actualRows, disbRows]) => {
      const existing = actualRows[0] || null;
      if (existing) {
        setForm({
          revenueInternal: String(existing.revenueInternal ?? ""),
          revenueExternal: String(existing.revenueExternal ?? ""),
          collectionsInternalEarned: String(existing.collectionsInternalEarned ?? ""),
          collectionsInternalUnearned: String(existing.collectionsInternalUnearned ?? ""),
          collectionsInternalOthers: String(existing.collectionsInternalOthers ?? ""),
          collectionsExternalEarned: String(existing.collectionsExternalEarned ?? ""),
          collectionsExternalUnearned: String(existing.collectionsExternalUnearned ?? ""),
          collectionsExternalOthers: String(existing.collectionsExternalOthers ?? ""),
          expensesInterest: String(existing.expensesInterest ?? ""),
          expensesDepreciation: String(existing.expensesDepreciation ?? ""),
          expensesOtherNonCash: String(existing.expensesOtherNonCash ?? ""),
        });
        setRemarks({
          revenueRemarks: existing.revenueRemarks || "",
          collectionsInternalEarnedRemarks: existing.collectionsInternalEarnedRemarks || "",
          collectionsInternalUnearnedRemarks: existing.collectionsInternalUnearnedRemarks || "",
          collectionsInternalOthersRemarks: existing.collectionsInternalOthersRemarks || "",
          collectionsExternalEarnedRemarks: existing.collectionsExternalEarnedRemarks || "",
          collectionsExternalUnearnedRemarks: existing.collectionsExternalUnearnedRemarks || "",
          collectionsExternalOthersRemarks: existing.collectionsExternalOthersRemarks || "",
          expensesInterestRemarks: existing.expensesInterestRemarks || "",
          expensesDepreciationRemarks: existing.expensesDepreciationRemarks || "",
          expensesOtherNonCashRemarks: existing.expensesOtherNonCashRemarks || "",
        });
      } else {
        setForm(emptyForm);
        setRemarks(emptyRemarks);
      }

      const existingDisb = disbRows[0] || null;
      setDisbForm({
        ADVANCES: existingDisb
          ? { internal: String(existingDisb.advancesInternal ?? ""), external: String(existingDisb.advancesExternal ?? ""), remarks: existingDisb.advancesRemarks || "" }
          : emptyDisbFields,
        LOANS: existingDisb
          ? { internal: String(existingDisb.loansInternal ?? ""), external: String(existingDisb.loansExternal ?? ""), remarks: existingDisb.loansRemarks || "" }
          : emptyDisbFields,
        INTERESTS: existingDisb
          ? { internal: String(existingDisb.interestsInternal ?? ""), external: String(existingDisb.interestsExternal ?? ""), remarks: existingDisb.interestsRemarks || "" }
          : emptyDisbFields,
      });
    });
  }, [yearId, quarter, companyId, businessUnitId]);

  // Saves everything on the page in one go: the combined Revenue/
  // Collections/Expenses actual (one PUT, as before) plus each of the three
  // Disbursement categories (one PUT per category — the backend only ever
  // accepts one category at a time, see routes/disbursements.ts). Uses
  // allSettled rather than all/Promise.race so that, if the user's role has
  // edit access to some categories but not others (REVENUE/COLLECTIONS/
  // EXPENSES and DISBURSEMENTS are independently gate-able Custom Role
  // resources), the categories they ARE allowed to edit still save
  // successfully instead of one 403 aborting everything else.
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    setSaved(false);
    try {
      const actualPayload = {
        companyId,
        yearId,
        quarter,
        ...remarks,
        revenueInternal: Number(form.revenueInternal) || 0,
        revenueExternal: Number(form.revenueExternal) || 0,
        collectionsInternalEarned: Number(form.collectionsInternalEarned) || 0,
        collectionsInternalUnearned: Number(form.collectionsInternalUnearned) || 0,
        collectionsInternalOthers: Number(form.collectionsInternalOthers) || 0,
        collectionsExternalEarned: Number(form.collectionsExternalEarned) || 0,
        collectionsExternalUnearned: Number(form.collectionsExternalUnearned) || 0,
        collectionsExternalOthers: Number(form.collectionsExternalOthers) || 0,
        expensesInterest: Number(form.expensesInterest) || 0,
        expensesDepreciation: Number(form.expensesDepreciation) || 0,
        expensesOtherNonCash: Number(form.expensesOtherNonCash) || 0,
      };

      const results = await Promise.allSettled([
        api.putActual(actualPayload),
        ...DISBURSEMENT_GROUPS.map((g) =>
          api.putDisbursement({
            companyId,
            yearId,
            quarter,
            category: g.category,
            internal: Number(disbForm[g.category].internal) || 0,
            external: Number(disbForm[g.category].external) || 0,
            remarks: disbForm[g.category].remarks,
          })
        ),
      ]);

      const labels = ["Revenue/Collections/Expenses", ...DISBURSEMENT_GROUPS.map((g) => g.title)];
      const failures = results
        .map((r, i) => (r.status === "rejected" ? `${labels[i]}: ${(r.reason as any)?.message || "failed"}` : null))
        .filter((x): x is string => Boolean(x));

      if (failures.length === 0) {
        setSaved(true);
      } else if (failures.length === results.length) {
        setError(failures.join("; "));
      } else {
        setError(`Saved the rest, but couldn't save — ${failures.join("; ")}`);
        setSaved(true);
      }
    } catch (err: any) {
      setError(err.message || "Failed to save quarterly figures");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="mb-1 text-lg font-semibold text-slate-800 dark:text-slate-100">Quarterly Data Entry</h2>
      <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
        {user?.role === "BU_INTEGRATOR"
          ? "Submit Revenue, Collections, Expenses, and Disbursements for the companies in your assigned Business Unit(s)."
          : "You can enter or override Revenue, Collections, Expenses, and Disbursements figures for any company."}
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm sm:p-6">
        <div className="grid grid-cols-1 gap-4 xs:grid-cols-2 sm:grid-cols-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Year</label>
            <select className="rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-3 py-2 text-sm" value={yearId} onChange={(e) => setYearId(e.target.value)}>
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.year}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Quarter</label>
            <select className="rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-3 py-2 text-sm" value={quarter} onChange={(e) => setQuarter(Number(e.target.value))}>
              {[1, 2, 3, 4].map((q) => (
                <option key={q} value={q}>
                  Q{q}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Business Unit</label>
            <select
              className="rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-3 py-2 text-sm"
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
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Company</label>
            <select className="rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-3 py-2 text-sm" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* ---------- Revenue ---------- */}
        <div className="grid grid-cols-1 gap-4">
          <h3 className="-mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Revenue</h3>
          <div className="rounded-md border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 p-3 sm:p-4">
            <div className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">{REVENUE_GROUP.title}</div>
            <div className="grid grid-cols-1 gap-4 xs:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Internal</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className="rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-3 py-2 text-sm"
                  value={form[REVENUE_GROUP.internal]}
                  onChange={(e) => setForm((f) => ({ ...f, [REVENUE_GROUP.internal]: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">External</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className="rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-3 py-2 text-sm"
                  value={form[REVENUE_GROUP.external]}
                  onChange={(e) => setForm((f) => ({ ...f, [REVENUE_GROUP.external]: e.target.value }))}
                />
              </div>
            </div>
            <div className="mt-3 flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Revenue Remarks</label>
              <textarea
                className="min-h-[60px] rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-3 py-2 text-sm"
                value={remarks[REVENUE_GROUP.remarks]}
                onChange={(e) => setRemarks((r) => ({ ...r, [REVENUE_GROUP.remarks]: e.target.value }))}
                placeholder="Notes on this quarter's revenue..."
              />
            </div>
          </div>
        </div>

        {/* ---------- Collections ---------- */}
        <div className="grid grid-cols-1 gap-4">
          <h3 className="-mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Collections</h3>
          {COLLECTIONS_GROUPS.map((group) => (
            <div key={group.title} className="rounded-md border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 p-3 sm:p-4">
              <div className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Collections — {group.title}</div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {group.fields.map((f) => (
                  <BreakdownField
                    key={f.key}
                    label={f.label}
                    value={form[f.key]}
                    remarks={remarks[f.remarksKey]}
                    onValueChange={(v) => setForm((prev) => ({ ...prev, [f.key]: v }))}
                    onRemarksChange={(v) => setRemarks((prev) => ({ ...prev, [f.remarksKey]: v }))}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* ---------- Expenses ---------- */}
        <div className="grid grid-cols-1 gap-4">
          <h3 className="-mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Expenses</h3>
          <div className="rounded-md border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 p-3 sm:p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {EXPENSES_FIELDS.map((f) => (
                <BreakdownField
                  key={f.key}
                  label={f.label}
                  value={form[f.key]}
                  remarks={remarks[f.remarksKey]}
                  onValueChange={(v) => setForm((prev) => ({ ...prev, [f.key]: v }))}
                  onRemarksChange={(v) => setRemarks((prev) => ({ ...prev, [f.remarksKey]: v }))}
                />
              ))}
            </div>
          </div>
        </div>

        {/* ---------- Disbursements ---------- */}
        <div className="grid grid-cols-1 gap-4">
          <h3 className="-mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Disbursements</h3>
          {DISBURSEMENT_GROUPS.map((group) => (
            <div key={group.title} className="rounded-md border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 p-3 sm:p-4">
              <div className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">{group.title}</div>
              <div className="grid grid-cols-1 gap-4 xs:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Internal</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-3 py-2 text-sm"
                    value={disbForm[group.category].internal}
                    onChange={(e) =>
                      setDisbForm((f) => ({ ...f, [group.category]: { ...f[group.category], internal: e.target.value } }))
                    }
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400">External</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-3 py-2 text-sm"
                    value={disbForm[group.category].external}
                    onChange={(e) =>
                      setDisbForm((f) => ({ ...f, [group.category]: { ...f[group.category], external: e.target.value } }))
                    }
                  />
                </div>
              </div>
              <div className="mt-3 flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">{group.title} Remarks</label>
                <textarea
                  className="min-h-[60px] rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-3 py-2 text-sm"
                  value={disbForm[group.category].remarks}
                  onChange={(e) =>
                    setDisbForm((f) => ({ ...f, [group.category]: { ...f[group.category], remarks: e.target.value } }))
                  }
                  placeholder={`Notes on this quarter's ${group.title.toLowerCase()}...`}
                />
              </div>
            </div>
          ))}
        </div>

        {error && <div className="rounded-md bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-600 dark:text-red-400">{error}</div>}

        <button
          type="submit"
          disabled={saving || !companyId || !yearId}
          className="flex items-center justify-center gap-2 rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {saved ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {saving ? "Saving..." : saved ? "Saved" : "Save All Figures"}
        </button>
      </form>
    </div>
  );
}
