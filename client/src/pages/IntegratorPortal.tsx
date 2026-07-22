import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, Plus, Save, Trash2, Upload } from "lucide-react";
import { api } from "../api/client";
import type { BusinessUnit, Company, NoteCategory, NoteEntry, Year } from "../api/types";
import { useAuth } from "../contexts/AuthContext";
import BulkDataEntryUpload from "../components/BulkDataEntryUpload";

type FigureKey =
  | "revenueInternal"
  | "revenueExternal"
  | "collectionsInternalEarned"
  | "collectionsInternalUnearned"
  | "collectionsInternalOthers"
  | "collectionsExternalEarned"
  | "collectionsExternalUnearned"
  | "collectionsExternalOthers"
  | "expenses";

type RemarksKey =
  | "revenueRemarks"
  | "collectionsInternalEarnedRemarks"
  | "collectionsInternalUnearnedRemarks"
  | "collectionsInternalOthersRemarks"
  | "collectionsExternalEarnedRemarks"
  | "collectionsExternalUnearnedRemarks"
  | "collectionsExternalOthersRemarks"
  | "expensesRemarks";

// Revenue and Expenses are both a single amount + one Remarks field —
// Collections is the only category with its own dedicated multi-breakdown
// layout below (see COLLECTIONS_GROUPS). Expenses used to have a 3-way
// breakdown (Interest/Depreciation/Other Non-Cash) here too; that's been
// collapsed to one plain amount, with any significant breakdown items now
// logged separately via the growable "notable line items" list further down
// (see NOTE_CATEGORY_TYPE usage / ExpenseNote), which is purely
// informational and never rolled into this figure.
const REVENUE_GROUP = { title: "Revenue", value: "revenueInternal" as FigureKey, remarks: "revenueRemarks" as RemarksKey };
const EXPENSES_GROUP = { title: "Expenses", value: "expenses" as FigureKey, remarks: "expensesRemarks" as RemarksKey };

// Collections is Internal/External, each broken into three recognition
// types (Earned/Unearned/Others) — one Remarks field per breakdown, same
// granularity as Disbursements' per-category Remarks used to be.
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

const emptyForm: Record<FigureKey, string> = {
  revenueInternal: "",
  revenueExternal: "",
  collectionsInternalEarned: "",
  collectionsInternalUnearned: "",
  collectionsInternalOthers: "",
  collectionsExternalEarned: "",
  collectionsExternalUnearned: "",
  collectionsExternalOthers: "",
  expenses: "",
};

const emptyRemarks: Record<RemarksKey, string> = {
  revenueRemarks: "",
  collectionsInternalEarnedRemarks: "",
  collectionsInternalUnearnedRemarks: "",
  collectionsInternalOthersRemarks: "",
  collectionsExternalEarnedRemarks: "",
  collectionsExternalUnearnedRemarks: "",
  collectionsExternalOthersRemarks: "",
  expensesRemarks: "",
};

// Disbursements now live on the same single-amount-plus-Remarks shape as
// Expenses — used to be three sub-categories (Advances/Loan Repayments/
// Interests) each split Internal/External; collapsed the same way, with any
// significant items now logged via the growable notable line items list
// below instead. Recorded — not targeted — so there's no Target-side
// counterpart to enter alongside it.
interface DisbFields {
  amount: string;
  remarks: string;
}
const emptyDisbForm: DisbFields = { amount: "", remarks: "" };

// One numeric field + its own Remarks input, stacked — the shape reused for
// every Collections breakdown (6) below.
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

// A single amount + Remarks group, shared by Revenue and Expenses above —
// both are now the same shape.
function AmountRemarksGroup({
  title,
  value,
  remarks,
  onValueChange,
  onRemarksChange,
  helperText,
}: {
  title: string;
  value: string;
  remarks: string;
  onValueChange: (v: string) => void;
  onRemarksChange: (v: string) => void;
  helperText?: string;
}) {
  return (
    <div className="rounded-md border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 p-3 sm:p-4">
      <div className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</div>
      <div className="flex flex-col gap-1 sm:max-w-xs">
        <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Amount</label>
        <input
          type="number"
          min={0}
          step="0.01"
          className="rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-3 py-2 text-sm"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
        />
      </div>
      <div className="mt-3 flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-500 dark:text-slate-400">{title} Remarks</label>
        <textarea
          className="min-h-[60px] rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-3 py-2 text-sm"
          value={remarks}
          onChange={(e) => onRemarksChange(e.target.value)}
          placeholder={`Notes on this quarter's ${title.toLowerCase()}...`}
        />
      </div>
      {helperText && <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">{helperText}</p>}
    </div>
  );
}

// Growable, informational-only "notable line items" list — shared shape for
// both Expenses and Disbursements. Never rolled into any total: purely a
// place to log significant Interest/Depreciation/Other-Non-Cash/Cost-of-
// Sales/OPEX (or Advances/Loans/Interest, for Disbursements) items with
// their own remarks, for record-keeping. Categories come from the
// superadmin-managed catalog (Admin -> Note Categories).
function NotableItemsCard({
  title,
  categories,
  notes,
  loading,
  onAdd,
  onDelete,
  adding,
  deletingId,
}: {
  title: string;
  categories: NoteCategory[];
  notes: NoteEntry[];
  loading: boolean;
  onAdd: (categoryId: string, amount: number, remarks: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  adding: boolean;
  deletingId: string | null;
}) {
  const activeCategories = categories.filter((c) => c.active);
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!categoryId && activeCategories.length) setCategoryId(activeCategories[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategories.length]);

  async function handleAdd() {
    setError("");
    if (!categoryId) {
      setError("Pick a category first");
      return;
    }
    try {
      await onAdd(categoryId, Number(amount) || 0, remarks);
      setAmount("");
      setRemarks("");
    } catch (err: any) {
      setError(err.message || "Failed to add item");
    }
  }

  return (
    <div className="rounded-md border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 p-3 sm:p-4">
      <div className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</div>
      <p className="mb-3 text-[11px] text-slate-400 dark:text-slate-500">
        Informational only — for record-keeping. These items are never added to the figure above or to any dashboard
        total.
      </p>

      {!loading && notes.length > 0 && (
        <div className="mb-3 flex flex-col divide-y divide-slate-200 dark:divide-slate-800 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          {notes.map((n) => (
            <div key={n.id} className="flex items-start justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  {n.category.label} — {Number(n.amount).toLocaleString("en-PH", { style: "currency", currency: "PHP" })}
                </div>
                {n.remarks && <div className="text-[11px] text-slate-500 dark:text-slate-400">{n.remarks}</div>}
              </div>
              <button
                type="button"
                onClick={() => onDelete(n.id)}
                disabled={deletingId === n.id}
                className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                title="Remove"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {activeCategories.length === 0 ? (
        <p className="text-xs text-slate-400 dark:text-slate-500">
          No categories configured yet — ask a Superadmin to add some under Admin -&gt; Note Categories.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_2fr_auto] sm:items-end">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Category</label>
            <select
              className="rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-2 py-1.5 text-xs"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              {activeCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Amount</label>
            <input
              type="number"
              min={0}
              step="0.01"
              className="rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-2 py-1.5 text-xs"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Remarks</label>
            <input
              className="rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-2 py-1.5 text-xs"
              placeholder="Optional notes..."
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={handleAdd}
            disabled={adding}
            className="flex items-center justify-center gap-1 rounded-md bg-slate-700 dark:bg-slate-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800 dark:hover:bg-slate-500 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" /> {adding ? "Adding..." : "Add"}
          </button>
        </div>
      )}
      {error && <div className="mt-2 text-[11px] text-red-600 dark:text-red-400">{error}</div>}
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
  const [disbForm, setDisbForm] = useState<DisbFields>(emptyDisbForm);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Bulk Upload (Superadmin only) — see BulkDataEntryUpload.tsx / the
  // POST /bulk-data-entry route, gated purely on role === "SUPERADMIN"
  // rather than the Custom Role permission system.
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Notable line items — the growable, informational-only record-keeping
  // facility for Expenses and Disbursements (see NotableItemsCard above).
  const [expenseCategories, setExpenseCategories] = useState<NoteCategory[]>([]);
  const [disbursementCategories, setDisbursementCategories] = useState<NoteCategory[]>([]);
  const [expenseNotes, setExpenseNotes] = useState<NoteEntry[]>([]);
  const [disbursementNotes, setDisbursementNotes] = useState<NoteEntry[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [addingExpenseNote, setAddingExpenseNote] = useState(false);
  const [addingDisbursementNote, setAddingDisbursementNote] = useState(false);
  const [deletingExpenseNoteId, setDeletingExpenseNoteId] = useState<string | null>(null);
  const [deletingDisbursementNoteId, setDeletingDisbursementNoteId] = useState<string | null>(null);

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
    // The Note Category catalogs rarely change — loaded once, not
    // re-fetched every time the scope changes.
    api.noteCategories("EXPENSE").then(setExpenseCategories).catch(() => setExpenseCategories([]));
    api.noteCategories("DISBURSEMENT").then(setDisbursementCategories).catch(() => setDisbursementCategories([]));
  }, []);

  useEffect(() => {
    if (!businessUnitId) return;
    api.companies(businessUnitId).then((cs) => {
      setCompanies(cs);
      setCompanyId(cs[0]?.id || "");
    });
  }, [businessUnitId]);

  // Pre-fill the actuals form, the disbursements form, and both notable
  // line items lists with whatever already exists for the selected scope —
  // fetched together since they all share one scope picker.
  useEffect(() => {
    if (!yearId || !companyId) return;
    setSaved(false);
    setNotesLoading(true);
    Promise.all([
      api.actuals({ yearId, quarter, companyId }).catch(() => []),
      api.disbursements({ yearId, quarter, companyId }).catch(() => []),
      api.expenseNotes({ yearId, quarter, companyId }).catch(() => []),
      api.disbursementNotes({ yearId, quarter, companyId }).catch(() => []),
    ]).then(([actualRows, disbRows, expNotes, disbNotes]) => {
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
          expenses: String(existing.expenses ?? ""),
        });
        setRemarks({
          revenueRemarks: existing.revenueRemarks || "",
          collectionsInternalEarnedRemarks: existing.collectionsInternalEarnedRemarks || "",
          collectionsInternalUnearnedRemarks: existing.collectionsInternalUnearnedRemarks || "",
          collectionsInternalOthersRemarks: existing.collectionsInternalOthersRemarks || "",
          collectionsExternalEarnedRemarks: existing.collectionsExternalEarnedRemarks || "",
          collectionsExternalUnearnedRemarks: existing.collectionsExternalUnearnedRemarks || "",
          collectionsExternalOthersRemarks: existing.collectionsExternalOthersRemarks || "",
          expensesRemarks: existing.expensesRemarks || "",
        });
      } else {
        setForm(emptyForm);
        setRemarks(emptyRemarks);
      }

      const existingDisb = disbRows[0] || null;
      setDisbForm(
        existingDisb
          ? { amount: String(existingDisb.amount ?? ""), remarks: existingDisb.remarks || "" }
          : emptyDisbForm
      );

      setExpenseNotes(expNotes);
      setDisbursementNotes(disbNotes);
      setNotesLoading(false);
    });
  }, [yearId, quarter, companyId, businessUnitId, reloadKey]);

  async function handleAddExpenseNote(categoryId: string, amount: number, remarksText: string) {
    setAddingExpenseNote(true);
    try {
      const row = await api.createExpenseNote({ companyId, yearId, quarter, categoryId, amount, remarks: remarksText });
      setExpenseNotes((prev) => [...prev, row]);
    } finally {
      setAddingExpenseNote(false);
    }
  }
  async function handleDeleteExpenseNote(id: string) {
    setDeletingExpenseNoteId(id);
    try {
      await api.deleteExpenseNote(id);
      setExpenseNotes((prev) => prev.filter((n) => n.id !== id));
    } finally {
      setDeletingExpenseNoteId(null);
    }
  }
  async function handleAddDisbursementNote(categoryId: string, amount: number, remarksText: string) {
    setAddingDisbursementNote(true);
    try {
      const row = await api.createDisbursementNote({ companyId, yearId, quarter, categoryId, amount, remarks: remarksText });
      setDisbursementNotes((prev) => [...prev, row]);
    } finally {
      setAddingDisbursementNote(false);
    }
  }
  async function handleDeleteDisbursementNote(id: string) {
    setDeletingDisbursementNoteId(id);
    try {
      await api.deleteDisbursementNote(id);
      setDisbursementNotes((prev) => prev.filter((n) => n.id !== id));
    } finally {
      setDeletingDisbursementNoteId(null);
    }
  }

  // Saves the combined Revenue/Collections/Expenses actual (one PUT) plus
  // the single Disbursements amount (one PUT). Uses allSettled rather than
  // all/Promise.race so that, if the user's role has edit access to one but
  // not the other (REVENUE/COLLECTIONS/EXPENSES and DISBURSEMENTS are
  // independently gate-able Custom Role resources), the one they ARE
  // allowed to edit still saves successfully instead of one 403 aborting
  // everything else. The notable line items lists save independently as
  // each row is added/removed (see handleAdd/DeleteExpenseNote above) —
  // they're not part of this submit.
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
        expenses: Number(form.expenses) || 0,
      };

      const results = await Promise.allSettled([
        api.putActual(actualPayload),
        api.putDisbursement({
          companyId,
          yearId,
          quarter,
          amount: Number(disbForm.amount) || 0,
          remarks: disbForm.remarks,
        }),
      ]);

      const labels = ["Revenue/Collections/Expenses", "Disbursements"];
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

  const currentYear = years.find((y) => y.id === yearId);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Quarterly Data Entry</h2>
        {user?.role === "SUPERADMIN" && (
          <button
            type="button"
            disabled={!yearId}
            onClick={() => setShowBulkUpload(true)}
            className="flex items-center gap-2 rounded-md border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            <Upload className="h-4 w-4" /> Bulk Upload (CSV/Excel)
          </button>
        )}
      </div>
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
                  value={form.revenueInternal}
                  onChange={(e) => setForm((f) => ({ ...f, revenueInternal: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">External</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className="rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-3 py-2 text-sm"
                  value={form.revenueExternal}
                  onChange={(e) => setForm((f) => ({ ...f, revenueExternal: e.target.value }))}
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
          <AmountRemarksGroup
            title="Expenses"
            value={form.expenses}
            remarks={remarks.expensesRemarks}
            onValueChange={(v) => setForm((f) => ({ ...f, expenses: v }))}
            onRemarksChange={(v) => setRemarks((r) => ({ ...r, expensesRemarks: v }))}
          />
          <NotableItemsCard
            title="Notable Expense Items"
            categories={expenseCategories}
            notes={expenseNotes}
            loading={notesLoading}
            onAdd={handleAddExpenseNote}
            onDelete={handleDeleteExpenseNote}
            adding={addingExpenseNote}
            deletingId={deletingExpenseNoteId}
          />
        </div>

        {/* ---------- Disbursements ---------- */}
        <div className="grid grid-cols-1 gap-4">
          <h3 className="-mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Disbursements</h3>
          <AmountRemarksGroup
            title="Disbursements"
            value={disbForm.amount}
            remarks={disbForm.remarks}
            onValueChange={(v) => setDisbForm((f) => ({ ...f, amount: v }))}
            onRemarksChange={(v) => setDisbForm((f) => ({ ...f, remarks: v }))}
          />
          <NotableItemsCard
            title="Notable Disbursement Items"
            categories={disbursementCategories}
            notes={disbursementNotes}
            loading={notesLoading}
            onAdd={handleAddDisbursementNote}
            onDelete={handleDeleteDisbursementNote}
            adding={addingDisbursementNote}
            deletingId={deletingDisbursementNoteId}
          />
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

      {showBulkUpload && yearId && (
        <BulkDataEntryUpload
          yearId={yearId}
          yearLabel={currentYear ? String(currentYear.year) : ""}
          onClose={() => setShowBulkUpload(false)}
          onUploaded={() => setReloadKey((k) => k + 1)}
        />
      )}
    </div>
  );
}
