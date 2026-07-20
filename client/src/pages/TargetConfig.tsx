import { Dispatch, FormEvent, SetStateAction, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Lock, LockOpen, Plus, Save } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import type { BusinessUnit, Company, TargetLockEntry, Year } from "../api/types";

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

// Revenue is the only category that still has a plain Internal/External
// pair, so it's the only one that keeps the Combined-vs-Split toggle below.
const FIELD_GROUPS: { title: string; internal: FigureKey; external: FigureKey }[] = [
  { title: "Revenue", internal: "revenueInternal", external: "revenueExternal" },
];

// Collections is Internal/External, each broken into three recognition
// types (Earned/Unearned/Others). There's no single Internal/External
// *number* to toggle Combined-vs-Split on the way Revenue does — instead
// each side gets its own Combined-vs-Split toggle: "Combined" here means
// entering ONE total for that side, which is then split evenly across its
// 3 breakdowns (so Earned/Unearned/Others each contribute an equal share of
// the side's target) rather than Revenue's "dump it all into Internal"
// convenience. See CollectionsFieldsEditor below.
const COLLECTIONS_GROUPS: { title: string; earned: FigureKey; unearned: FigureKey; others: FigureKey }[] = [
  { title: "Internal", earned: "collectionsInternalEarned", unearned: "collectionsInternalUnearned", others: "collectionsInternalOthers" },
  { title: "External", earned: "collectionsExternalEarned", unearned: "collectionsExternalUnearned", others: "collectionsExternalOthers" },
];

// Expenses has no Internal/External split at all — three single-value
// breakdowns instead, each treated as one group for the same
// Combined-vs-Split even-split behavior as Collections above.
const EXPENSES_FIELDS: { key: FigureKey; label: string }[] = [
  { key: "expensesInterest", label: "Interest" },
  { key: "expensesDepreciation", label: "Depreciation" },
  { key: "expensesOtherNonCash", label: "Other Non-Cash Expenses" },
];
const EXPENSES_GROUP = { title: "Expenses", a: "expensesInterest" as FigureKey, b: "expensesDepreciation" as FigureKey, c: "expensesOtherNonCash" as FigureKey };

// Splits a total evenly across 3 fields so they sum back to exactly the
// original total (unlike a plain total/3, which can lose or gain a cent to
// rounding) — the third share absorbs whatever the first two's rounding
// left over.
function splitEvenlyThree(total: number): [number, number, number] {
  const share = Math.round((total / 3) * 100) / 100;
  const remainder = Math.round((total - share * 2) * 100) / 100;
  return [share, share, remainder];
}

// Combined-vs-Split defaults/inference for Collections' two sides and
// Expenses' one group — "Combined" is inferred whenever the 3 underlying
// values are exactly equal (which is what entering a Combined total always
// produces, including the all-zero/blank starting state).
const emptyThreeWayFieldModes: Record<string, FieldMode> = { Internal: "combined", External: "combined", Expenses: "combined" };

function threeWayFieldModesFrom(existing: Record<string, any>, groups: { title: string; a: FigureKey; b: FigureKey; c: FigureKey }[]): Record<string, FieldMode> {
  const modes: Record<string, FieldMode> = {};
  for (const group of groups) {
    const a = Number(existing[group.a] ?? 0);
    const b = Number(existing[group.b] ?? 0);
    const c = Number(existing[group.c] ?? 0);
    modes[group.title] = a === b && b === c ? "combined" : "split";
  }
  return modes;
}

const COLLECTIONS_THREEWAY_GROUPS = COLLECTIONS_GROUPS.map((g) => ({ title: g.title, a: g.earned, b: g.unearned, c: g.others }));

// A target's total is always Internal + External under the hood — "Combined"
// is purely a data-entry convenience that writes the whole figure into the
// Internal field and zeroes External, so no schema/API change is needed to
// support it. Only ever applies to Revenue now (see FIELD_GROUPS above).
type FieldMode = "split" | "combined";
const emptyFieldModes: Record<string, FieldMode> = { Revenue: "combined" };

function fieldModesFrom(existing: Record<string, any>): Record<string, FieldMode> {
  const modes: Record<string, FieldMode> = {};
  for (const group of FIELD_GROUPS) {
    modes[group.title] = Number(existing[group.external] ?? 0) !== 0 ? "split" : "combined";
  }
  return modes;
}

// One group's worth of UI: a "One Total" / "Split" toggle, then either a
// single Total input (whose value is split evenly across the 3 underlying
// fields on every keystroke) or the 3 individual breakdown inputs. Shared by
// both CollectionsFieldsEditor (called once per side) and
// ExpensesFieldsEditor (called once, since Expenses has only one group).
function ThreeWayFieldGroup({
  title,
  modeKey,
  fields,
  form,
  setForm,
  fieldModes,
  setFieldModes,
  disabled,
}: {
  title: string;
  // Key used to look up/store this group's Combined-vs-Split mode — separate
  // from `title` (which is just the display heading) because Collections'
  // two groups are displayed as "Collections — Internal"/"Collections —
  // External" but share mode-tracking with COLLECTIONS_GROUPS' plain
  // "Internal"/"External" titles (used elsewhere for inference).
  modeKey: string;
  fields: { key: FigureKey; label: string }[];
  form: Record<FigureKey, string>;
  setForm: Dispatch<SetStateAction<Record<FigureKey, string>>>;
  fieldModes: Record<string, FieldMode>;
  setFieldModes: Dispatch<SetStateAction<Record<string, FieldMode>>>;
  disabled?: boolean;
}) {
  const [a, b, c] = fields;
  const isCombined = fieldModes[modeKey] !== "split";
  const total = (Number(form[a.key]) || 0) + (Number(form[b.key]) || 0) + (Number(form[c.key]) || 0);

  function applyTotal(rawValue: string) {
    const total = Number(rawValue) || 0;
    const [sa, sb, sc] = splitEvenlyThree(total);
    setForm((prev) => ({
      ...prev,
      [a.key]: rawValue === "" ? "" : String(sa),
      [b.key]: rawValue === "" ? "" : String(sb),
      [c.key]: rawValue === "" ? "" : String(sc),
    }));
  }

  return (
    <div className="rounded-md border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 p-3 sm:p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</div>
        <div className="flex rounded-md border border-slate-200 dark:border-slate-700 p-0.5 text-[11px]">
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              setFieldModes((m) => ({ ...m, [modeKey]: "combined" }));
              applyTotal(total ? String(total) : "");
            }}
            className={`rounded px-2 py-1 font-medium disabled:opacity-50 ${isCombined ? "bg-brand-500 text-white" : "text-slate-500 dark:text-slate-400"}`}
          >
            One Total
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setFieldModes((m) => ({ ...m, [modeKey]: "split" }))}
            className={`rounded px-2 py-1 font-medium disabled:opacity-50 ${!isCombined ? "bg-brand-500 text-white" : "text-slate-500 dark:text-slate-400"}`}
            title={fields.map((f) => f.label).join(" / ")}
          >
            Split
          </button>
        </div>
      </div>
      {isCombined ? (
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Total</label>
          <input
            type="number"
            min={0}
            step="0.01"
            disabled={disabled}
            className="rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-400"
            value={total ? String(total) : ""}
            onChange={(e) => applyTotal(e.target.value)}
          />
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            Split evenly across {fields.map((f) => f.label).join(", ")}.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {fields.map((f) => (
            <div key={f.key} className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">{f.label}</label>
              <input
                type="number"
                min={0}
                step="0.01"
                disabled={disabled}
                className="rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-400"
                value={form[f.key]}
                onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Collections/Expenses entry grids, reused by both the per-Quarter form and
// the Annual Target form. Each group (Collections' Internal, Collections'
// External, and Expenses) has its own independent Combined-vs-Split toggle —
// see ThreeWayFieldGroup above.
function CollectionsFieldsEditor({
  form,
  setForm,
  fieldModes,
  setFieldModes,
  disabled,
}: {
  form: Record<FigureKey, string>;
  setForm: Dispatch<SetStateAction<Record<FigureKey, string>>>;
  fieldModes: Record<string, FieldMode>;
  setFieldModes: Dispatch<SetStateAction<Record<string, FieldMode>>>;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-4">
      {COLLECTIONS_GROUPS.map((group) => (
        <ThreeWayFieldGroup
          key={group.title}
          title={`Collections — ${group.title}`}
          modeKey={group.title}
          fields={[
            { key: group.earned, label: "Revenue - Earned" },
            { key: group.unearned, label: "Advance Payments - Unearned" },
            { key: group.others, label: "Others" },
          ]}
          form={form}
          setForm={setForm}
          fieldModes={fieldModes}
          setFieldModes={setFieldModes}
          disabled={disabled}
        />
      ))}
    </div>
  );
}

function ExpensesFieldsEditor({
  form,
  setForm,
  fieldModes,
  setFieldModes,
  disabled,
}: {
  form: Record<FigureKey, string>;
  setForm: Dispatch<SetStateAction<Record<FigureKey, string>>>;
  fieldModes: Record<string, FieldMode>;
  setFieldModes: Dispatch<SetStateAction<Record<string, FieldMode>>>;
  disabled?: boolean;
}) {
  return (
    <ThreeWayFieldGroup
      title="Expenses"
      modeKey="Expenses"
      fields={EXPENSES_FIELDS}
      form={form}
      setForm={setForm}
      fieldModes={fieldModes}
      setFieldModes={setFieldModes}
      disabled={disabled}
    />
  );
}

// Shared "One Total" vs "Internal / External" figure-entry grid, reused by
// both the per-Quarter form and the Annual Target form below.
function FigureFieldsEditor({
  form,
  setForm,
  fieldModes,
  setFieldModes,
  disabled,
}: {
  form: Record<FigureKey, string>;
  setForm: Dispatch<SetStateAction<Record<FigureKey, string>>>;
  fieldModes: Record<string, FieldMode>;
  setFieldModes: Dispatch<SetStateAction<Record<string, FieldMode>>>;
  disabled?: boolean;
}) {
  function setCombinedMode(title: string, internal: FigureKey, external: FigureKey) {
    setFieldModes((m) => ({ ...m, [title]: "combined" }));
    setForm((f) => {
      const total = (Number(f[internal]) || 0) + (Number(f[external]) || 0);
      return { ...f, [internal]: total ? String(total) : "", [external]: "0" };
    });
  }
  function setSplitMode(title: string) {
    setFieldModes((m) => ({ ...m, [title]: "split" }));
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      {FIELD_GROUPS.map((group) => {
        const isCombined = fieldModes[group.title] !== "split";
        return (
          <div key={group.title} className="rounded-md border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 p-3 sm:p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">{group.title}</div>
              <div className="flex rounded-md border border-slate-200 dark:border-slate-700 p-0.5 text-[11px]">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setCombinedMode(group.title, group.internal, group.external)}
                  className={`rounded px-2 py-1 font-medium disabled:opacity-50 ${
                    isCombined ? "bg-brand-500 text-white" : "text-slate-500 dark:text-slate-400"
                  }`}
                >
                  One Total
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setSplitMode(group.title)}
                  className={`rounded px-2 py-1 font-medium disabled:opacity-50 ${
                    !isCombined ? "bg-brand-500 text-white" : "text-slate-500 dark:text-slate-400"
                  }`}
                >
                  Internal / External
                </button>
              </div>
            </div>
            {isCombined ? (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Total</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  disabled={disabled}
                  className="rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-400"
                  value={form[group.internal]}
                  onChange={(e) => setForm((f) => ({ ...f, [group.internal]: e.target.value, [group.external]: "0" }))}
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 xs:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Internal</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    disabled={disabled}
                    className="rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-400"
                    value={form[group.internal]}
                    onChange={(e) => setForm((f) => ({ ...f, [group.internal]: e.target.value }))}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400">External</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    disabled={disabled}
                    className="rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-400"
                    value={form[group.external]}
                    onChange={(e) => setForm((f) => ({ ...f, [group.external]: e.target.value }))}
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// There is no separately-*stored* Annual Target — it's always the sum of a
// Company's Q1-Q4 Quarter Target, shown read-only on the Revenue dashboard
// (KPI cards, Target Distribution Matrix, Operational Grid). This page has
// two ways to *set* that sum: entering Quarter targets one at a time, or
// entering an Annual Target which splits evenly across the Year's still-
// editable quarters. Editing an editable Quarter redistributes the change
// across that Company's *subsequent* Quarters only, so the Q1-Q4 sum for
// the Year never drifts from what it was before the edit. A Quarter is
// only ever locked if a Group Integrator/Superadmin has explicitly locked
// it via the Target Locks panel below — there's no automatic calendar-based
// lock, so past quarters stay editable indefinitely unless locked by hand.
export default function TargetConfig() {
  const { user } = useAuth();
  const canManageStructure = user?.role === "GROUP_INTEGRATOR" || user?.role === "SUPERADMIN";
  const [years, setYears] = useState<Year[]>([]);
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);

  const [mode, setMode] = useState<"quarter" | "annual">("quarter");

  const [yearId, setYearId] = useState("");
  const [quarter, setQuarter] = useState(1);
  const [businessUnitId, setBusinessUnitId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [fieldModes, setFieldModes] = useState<Record<string, FieldMode>>(emptyFieldModes);
  // Collections' two sides (Internal/External) and Expenses' one group each
  // get their own independent Combined-vs-Split mode — "Internal"/"External"/
  // "Expenses" keys, shared by CollectionsFieldsEditor/ExpensesFieldsEditor.
  const [collectionsFieldModes, setCollectionsFieldModes] = useState<Record<string, FieldMode>>(emptyThreeWayFieldModes);
  const [expensesFieldModes, setExpensesFieldModes] = useState<Record<string, FieldMode>>(emptyThreeWayFieldModes);

  const [annualForm, setAnnualForm] = useState(emptyForm);
  const [annualFieldModes, setAnnualFieldModes] = useState<Record<string, FieldMode>>(emptyFieldModes);
  const [annualCollectionsFieldModes, setAnnualCollectionsFieldModes] = useState<Record<string, FieldMode>>(emptyThreeWayFieldModes);
  const [annualExpensesFieldModes, setAnnualExpensesFieldModes] = useState<Record<string, FieldMode>>(emptyThreeWayFieldModes);

  // The real calendar quarter "right now" (server clock) — used only to
  // default the initial Year/Quarter selection to the current one. It has
  // no bearing on locking: quarters are never auto-locked by the calendar,
  // only by the manual Target Lock mechanism below. null until loaded.
  const [currentReal, setCurrentReal] = useState<{ year: number; quarter: number } | null>(null);

  const [newYear, setNewYear] = useState(new Date().getFullYear() + 1);
  const [newBuName, setNewBuName] = useState("");
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newCompanyDescription, setNewCompanyDescription] = useState("");

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [annualSaving, setAnnualSaving] = useState(false);
  const [annualSaved, setAnnualSaved] = useState(false);
  const [annualError, setAnnualError] = useState("");
  const [annualLockedQuarters, setAnnualLockedQuarters] = useState<number[]>([]);

  // Group Integrator / Superadmin only: a manual, admin-controlled lock per
  // Year+Quarter (applies to every Company at once). This is the *only*
  // way a Quarter's Targets can be locked — there is no automatic
  // calendar-based lock, so a past Quarter stays editable indefinitely
  // unless locked by hand here. See api.targetLocks/lockTarget/
  // unlockTarget and server/src/routes/targets.ts.
  const canLockTargets = canManageStructure;
  const [manualLocks, setManualLocks] = useState<TargetLockEntry[]>([]);
  const [lockActionError, setLockActionError] = useState("");
  const [lockActionBusy, setLockActionBusy] = useState<number | null>(null);

  const selectedYear = years.find((y) => y.id === yearId);

  function manualLockInfo(q: number): TargetLockEntry | undefined {
    return manualLocks.find((l) => l.quarter === q);
  }
  function isQuarterLocked(q: number): boolean {
    return Boolean(manualLockInfo(q));
  }
  const lockedQuarters = selectedYear ? [1, 2, 3, 4].filter(isQuarterLocked) : [];
  const quarterLocked = isQuarterLocked(quarter);
  const allQuartersLocked = selectedYear ? lockedQuarters.length === 4 : false;

  function refreshManualLocks() {
    if (!yearId) {
      setManualLocks([]);
      return;
    }
    api
      .targetLocks(yearId)
      .then(setManualLocks)
      .catch(() => setManualLocks([]));
  }

  useEffect(() => {
    refreshManualLocks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearId]);

  async function handleLockQuarter(q: number) {
    if (!yearId) return;
    setLockActionError("");
    setLockActionBusy(q);
    try {
      await api.lockTarget({ yearId, quarter: q });
      refreshManualLocks();
    } catch (err: any) {
      setLockActionError(err.message || "Failed to lock quarter");
    } finally {
      setLockActionBusy(null);
    }
  }

  async function handleUnlockQuarter(q: number) {
    if (!yearId) return;
    const reason = window.prompt(
      `Reason for unlocking Q${q} ${selectedYear?.year ?? ""} targets (required — recorded in the Audit Log):`
    );
    if (reason === null) return; // cancelled
    if (!reason.trim()) {
      setLockActionError("A reason is required to unlock a quarter.");
      return;
    }
    setLockActionError("");
    setLockActionBusy(q);
    try {
      await api.unlockTarget({ yearId, quarter: q, reason: reason.trim() });
      refreshManualLocks();
    } catch (err: any) {
      setLockActionError(err.message || "Failed to unlock quarter");
    } finally {
      setLockActionBusy(null);
    }
  }

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
    // Default to the real current calendar quarter (server clock) when
    // possible, so Target Setup opens already on "today"'s quarter instead
    // of an arbitrary first-in-list year.
    api.years().then((ys) => {
      setYears(ys);
      api
        .currentQuarter()
        .catch(() => null)
        .then((current) => {
          if (current) setCurrentReal({ year: current.year, quarter: current.quarter });
          if (!yearId && ys.length) {
            if (current?.yearId && ys.some((y) => y.id === current.yearId)) {
              setYearId(current.yearId);
              setQuarter(current.quarter);
            } else {
              setYearId(ys[0].id);
            }
          }
        });
    });
    refreshBUs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!businessUnitId) return;
    api.companies(businessUnitId).then((cs) => {
      setCompanies(cs);
      setCompanyId((prev) => (prev && cs.some((c) => c.id === prev) ? prev : cs[0]?.id || ""));
    });
  }, [businessUnitId]);

  function refreshQuarterForm() {
    if (!yearId || !companyId) return;
    setSaved(false);
    api.quarterTargets({ yearId, quarter, companyId }).then((rows: any[]) => {
      const existing = rows[0];
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
        // Infer how this was originally entered: a nonzero External means it
        // was (or should be treated as) split; otherwise default to the
        // simpler single-total view.
        setFieldModes(fieldModesFrom(existing));
        setCollectionsFieldModes(threeWayFieldModesFrom(existing, COLLECTIONS_THREEWAY_GROUPS));
        setExpensesFieldModes(threeWayFieldModesFrom(existing, [EXPENSES_GROUP]));
      } else {
        setForm(emptyForm);
        setFieldModes(emptyFieldModes);
        setCollectionsFieldModes(emptyThreeWayFieldModes);
        setExpensesFieldModes(emptyThreeWayFieldModes);
      }
    });
  }

  // Quarter targets belong to the Company itself, so there's at most one
  // existing row for the selected Year+Quarter/Company.
  useEffect(() => {
    refreshQuarterForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearId, quarter, companyId]);

  function refreshAnnualForm() {
    if (!yearId || !companyId) return;
    setAnnualSaved(false);
    setAnnualLockedQuarters([]);
    // Pre-fill the Annual form with the Company's *current* annual total
    // (sum of whatever's in Q1-Q4 today) so entering an Annual Target reads
    // as "adjust the year's total" rather than starting from a blank slate.
    api.quarterTargets({ yearId, companyId }).then((rows: any[]) => {
      const totals: Record<FigureKey, number> = {
        revenueInternal: 0,
        revenueExternal: 0,
        collectionsInternalEarned: 0,
        collectionsInternalUnearned: 0,
        collectionsInternalOthers: 0,
        collectionsExternalEarned: 0,
        collectionsExternalUnearned: 0,
        collectionsExternalOthers: 0,
        expensesInterest: 0,
        expensesDepreciation: 0,
        expensesOtherNonCash: 0,
      };
      for (const r of rows) {
        (Object.keys(totals) as FigureKey[]).forEach((k) => {
          totals[k] += Number(r[k] ?? 0);
        });
      }
      const asStrings = Object.fromEntries(
        (Object.keys(totals) as FigureKey[]).map((k) => [k, totals[k] ? String(totals[k]) : ""])
      ) as Record<FigureKey, string>;
      setAnnualForm(asStrings);
      setAnnualFieldModes(fieldModesFrom(totals));
      setAnnualCollectionsFieldModes(threeWayFieldModesFrom(totals, COLLECTIONS_THREEWAY_GROUPS));
      setAnnualExpensesFieldModes(threeWayFieldModesFrom(totals, [EXPENSES_GROUP]));
    });
  }

  // Refresh the Annual form's pre-fill whenever the Company/Year changes, or
  // when the user switches into Annual mode (so it reflects any Quarter
  // edits made in the meantime).
  useEffect(() => {
    if (mode === "annual") refreshAnnualForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, yearId, companyId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    setSaved(false);
    try {
      const figures = {
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
      await api.putQuarterTarget({ companyId, yearId, quarter, ...figures });
      setSaved(true);
    } catch (err: any) {
      setError(err.message || "Failed to save target");
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitAnnual(e: FormEvent) {
    e.preventDefault();
    setAnnualError("");
    setAnnualSaving(true);
    setAnnualSaved(false);
    try {
      const figures = {
        revenueInternal: Number(annualForm.revenueInternal) || 0,
        revenueExternal: Number(annualForm.revenueExternal) || 0,
        collectionsInternalEarned: Number(annualForm.collectionsInternalEarned) || 0,
        collectionsInternalUnearned: Number(annualForm.collectionsInternalUnearned) || 0,
        collectionsInternalOthers: Number(annualForm.collectionsInternalOthers) || 0,
        collectionsExternalEarned: Number(annualForm.collectionsExternalEarned) || 0,
        collectionsExternalUnearned: Number(annualForm.collectionsExternalUnearned) || 0,
        collectionsExternalOthers: Number(annualForm.collectionsExternalOthers) || 0,
        expensesInterest: Number(annualForm.expensesInterest) || 0,
        expensesDepreciation: Number(annualForm.expensesDepreciation) || 0,
        expensesOtherNonCash: Number(annualForm.expensesOtherNonCash) || 0,
      };
      const result = await api.putAnnualTarget({ companyId, yearId, ...figures });
      setAnnualSaved(true);
      setAnnualLockedQuarters(result.lockedQuarters || []);
      refreshQuarterForm();
    } catch (err: any) {
      setAnnualError(err.message || "Failed to save annual target");
    } finally {
      setAnnualSaving(false);
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
    await api.createCompany(newCompanyName.trim(), businessUnitId, newCompanyDescription.trim());
    setNewCompanyName("");
    setNewCompanyDescription("");
    api.companies(businessUnitId).then(setCompanies);
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <div>
        <h2 className="mb-1 text-lg font-semibold text-slate-800 dark:text-slate-100">Target Configuration</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {canManageStructure
            ? "Set Quarter targets one at a time, or set an Annual Target to split it evenly across the year — and manage Years / Business Units / Companies."
            : "Set Quarter targets for the companies in your assigned Business Unit(s), or set an Annual Target to split it evenly across the year."}
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Editing a Quarter automatically adjusts the following quarters so the Q1-Q4 total stays the same. Quarters
          are never locked automatically — they stay editable indefinitely, past or future
          {canLockTargets
            ? ", unless a Group Integrator or Superadmin manually locks one (see Target Locks below); unlocking it always requires a reason, recorded in the Audit Log."
            : ", unless a Group Integrator or Superadmin has manually locked it."}
        </p>
      </div>

      {canManageStructure && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <form onSubmit={handleAddYear} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
            <div className="mb-2 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Add Year</div>
            <div className="flex gap-2">
              <input
                type="number"
                className="w-full rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-2 py-1.5 text-sm"
                value={newYear}
                onChange={(e) => setNewYear(Number(e.target.value))}
              />
              <button className="rounded-md bg-brand-500 p-2 text-white hover:bg-brand-600">
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </form>
          <form onSubmit={handleAddBu} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
            <div className="mb-2 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Add Business Unit</div>
            <div className="flex gap-2">
              <input
                className="w-full rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-2 py-1.5 text-sm"
                placeholder="e.g. Retail"
                value={newBuName}
                onChange={(e) => setNewBuName(e.target.value)}
              />
              <button className="rounded-md bg-brand-500 p-2 text-white hover:bg-brand-600">
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </form>
          <form onSubmit={handleAddCompany} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
            <div className="mb-2 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Add Company (to selected BU)</div>
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <input
                  className="w-full rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-2 py-1.5 text-sm"
                  placeholder="Company name"
                  value={newCompanyName}
                  onChange={(e) => setNewCompanyName(e.target.value)}
                />
                <button className="rounded-md bg-brand-500 p-2 text-white hover:bg-brand-600">
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <input
                className="w-full rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-2 py-1.5 text-sm"
                placeholder="Description (optional)"
                value={newCompanyDescription}
                onChange={(e) => setNewCompanyDescription(e.target.value)}
              />
            </div>
          </form>
        </div>
      )}

      <div className="flex flex-col gap-6 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm sm:p-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Year</label>
            <select className="w-full rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-3 py-2 text-sm" value={yearId} onChange={(e) => setYearId(e.target.value)}>
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.year}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Business Unit</label>
            <select
              className="w-full rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-3 py-2 text-sm"
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
          <div className="col-span-2 flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Company</label>
            <select className="w-full rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-3 py-2 text-sm" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {canLockTargets && selectedYear && (
          <div className="rounded-md border border-slate-200 dark:border-slate-700 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">Target Locks — {selectedYear.year}</div>
              <span className="text-xs text-slate-400 dark:text-slate-500">Locking/unlocking applies to every Company's targets for that quarter</span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[1, 2, 3, 4].map((q) => {
                const manual = manualLockInfo(q);
                const busy = lockActionBusy === q;
                return (
                  <div key={q} className="flex flex-col gap-2 rounded-md border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 p-3">
                    <div className="text-sm font-medium text-slate-700 dark:text-slate-200">Q{q}</div>
                    {manual ? (
                      <>
                        <div className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
                          <Lock className="h-3.5 w-3.5 shrink-0" />
                          Locked{manual.lockedByName ? ` by ${manual.lockedByName}` : ""}
                        </div>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleUnlockQuarter(q)}
                          className="flex items-center justify-center gap-1 rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-2 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50"
                        >
                          <LockOpen className="h-3.5 w-3.5" /> Unlock
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="text-xs text-slate-500 dark:text-slate-400">Open</div>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleLockQuarter(q)}
                          className="flex items-center justify-center gap-1 rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-2 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50"
                        >
                          <Lock className="h-3.5 w-3.5" /> Lock
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            {lockActionError && (
              <div className="mt-3 rounded-md bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs text-red-600 dark:text-red-400">{lockActionError}</div>
            )}
          </div>
        )}

        <div className="flex rounded-md border border-slate-200 dark:border-slate-700 p-0.5 text-sm sm:w-fit">
          <button
            type="button"
            onClick={() => setMode("quarter")}
            className={`flex-1 rounded px-3 py-1.5 font-medium sm:flex-none ${mode === "quarter" ? "bg-brand-500 text-white" : "text-slate-500 dark:text-slate-400"}`}
          >
            Set by Quarter
          </button>
          <button
            type="button"
            onClick={() => setMode("annual")}
            className={`flex-1 rounded px-3 py-1.5 font-medium sm:flex-none ${mode === "annual" ? "bg-brand-500 text-white" : "text-slate-500 dark:text-slate-400"}`}
          >
            Set Annual Target
          </button>
        </div>

        {mode === "quarter" ? (
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <div className="flex flex-col gap-1 sm:w-48">
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Quarter</label>
              <select
                className="w-full rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-3 py-2 text-sm"
                value={quarter}
                onChange={(e) => setQuarter(Number(e.target.value))}
              >
                {[1, 2, 3, 4].map((q) => (
                  <option key={q} value={q}>
                    Q{q}
                    {isQuarterLocked(q) ? " (locked)" : ""}
                  </option>
                ))}
              </select>
            </div>

            {quarterLocked && (
              <div className="flex items-center gap-2 rounded-md bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
                <Lock className="h-4 w-4 shrink-0" />
                {`This quarter was manually locked${
                  manualLockInfo(quarter)?.lockedByName ? ` by ${manualLockInfo(quarter)!.lockedByName}` : ""
                } and can no longer be edited until it's unlocked.`}
              </div>
            )}

            <FigureFieldsEditor
              form={form}
              setForm={setForm}
              fieldModes={fieldModes}
              setFieldModes={setFieldModes}
              disabled={quarterLocked}
            />
            <CollectionsFieldsEditor
              form={form}
              setForm={setForm}
              fieldModes={collectionsFieldModes}
              setFieldModes={setCollectionsFieldModes}
              disabled={quarterLocked}
            />
            <ExpensesFieldsEditor
              form={form}
              setForm={setForm}
              fieldModes={expensesFieldModes}
              setFieldModes={setExpensesFieldModes}
              disabled={quarterLocked}
            />

            {error && <div className="rounded-md bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-600 dark:text-red-400">{error}</div>}

            <button
              type="submit"
              disabled={saving || !companyId || !yearId || quarterLocked}
              className="flex items-center justify-center gap-2 rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
            >
              {saved ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
              {saving ? "Saving..." : saved ? "Saved" : "Save Quarter Target"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmitAnnual} className="flex flex-col gap-6">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Enter the year's total per category — it will split evenly across this Company's still-editable
              quarters. Quarters manually locked by an admin keep their existing values (subtracted from the total
              first).
            </p>

            {allQuartersLocked && (
              <div className="flex items-center gap-2 rounded-md bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Every quarter in this year has been manually locked — there's nothing left to distribute an annual
                target into.
              </div>
            )}
            {!allQuartersLocked && lockedQuarters.length > 0 && (
              <div className="flex items-center gap-2 rounded-md bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-600 dark:text-slate-300">
                <Lock className="h-4 w-4 shrink-0" />
                Q{lockedQuarters.join(", Q")} {lockedQuarters.length === 1 ? "is" : "are"} manually locked and will
                keep {lockedQuarters.length === 1 ? "its" : "their"} current values; the remaining total splits
                across Q{[1, 2, 3, 4].filter((q) => !lockedQuarters.includes(q)).join(", Q")}.
              </div>
            )}

            <FigureFieldsEditor
              form={annualForm}
              setForm={setAnnualForm}
              fieldModes={annualFieldModes}
              setFieldModes={setAnnualFieldModes}
              disabled={allQuartersLocked}
            />
            <CollectionsFieldsEditor
              form={annualForm}
              setForm={setAnnualForm}
              fieldModes={annualCollectionsFieldModes}
              setFieldModes={setAnnualCollectionsFieldModes}
              disabled={allQuartersLocked}
            />
            <ExpensesFieldsEditor
              form={annualForm}
              setForm={setAnnualForm}
              fieldModes={annualExpensesFieldModes}
              setFieldModes={setAnnualExpensesFieldModes}
              disabled={allQuartersLocked}
            />

            {annualError && <div className="rounded-md bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-600 dark:text-red-400">{annualError}</div>}
            {annualSaved && (
              <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
                Saved — split across the editable quarters.
                {annualLockedQuarters.length > 0 && ` Q${annualLockedQuarters.join(", Q")} were left unchanged (locked).`}
              </div>
            )}

            <button
              type="submit"
              disabled={annualSaving || !companyId || !yearId || allQuartersLocked}
              className="flex items-center justify-center gap-2 rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {annualSaving ? "Saving..." : "Save Annual Target"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
