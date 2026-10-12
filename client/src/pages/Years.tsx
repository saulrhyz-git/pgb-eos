import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CalendarPlus, FileText, Loader2, Lock, LockOpen, X } from "lucide-react";
import { api } from "../api/client";
import type { Year, YearWrapUpPreview } from "../api/types";
import { useAuth } from "../contexts/AuthContext";

// Year management for Group Integrators and Superadmins:
//   - create a new Year (always a blank slate — nothing is copied over)
//   - wrap up a Year: generate the full-year report and make the Year read-only
//   - view a wrapped-up Year's report
//   - reopen a wrapped-up Year (Superadmin only, reason required)
// The server enforces every one of these rules; this page just drives them.

const cardClass = "rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm sm:p-6";
const inputClass = "rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-3 py-2 text-sm";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function Years() {
  const { user } = useAuth();
  const isSuperadmin = user?.role === "SUPERADMIN";
  const canManage = isSuperadmin || user?.role === "GROUP_INTEGRATOR";
  // Mirrors the server: wrapping up needs group-wide (not BU-narrowed) access.
  const canWrapUp = isSuperadmin || (user?.role === "GROUP_INTEGRATOR" && (user.businessUnitIds?.length ?? 0) === 0);

  const [years, setYears] = useState<Year[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [newYear, setNewYear] = useState<number>(new Date().getFullYear() + 1);
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState("");

  const [wrapTarget, setWrapTarget] = useState<Year | null>(null);
  const [reopenTarget, setReopenTarget] = useState<Year | null>(null);

  function load() {
    setLoading(true);
    api
      .years()
      .then((ys) => {
        setYears(ys);
        const latest = ys.reduce((m, y) => Math.max(m, y.year), 0);
        if (latest) setNewYear(latest + 1);
      })
      .catch((err) => setError(err.message || "Failed to load years"))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateMsg("");
    setError("");
    try {
      const y = await api.createYear(Number(newYear));
      setCreateMsg(`Year ${y.year} created — it's empty and ready for Targets, Actuals and Rocks.`);
      load();
    } catch (err: any) {
      setError(err.message || "Failed to create the year");
    } finally {
      setCreating(false);
    }
  }

  if (!canManage) {
    return <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">Only Group Integrators and Superadmins can manage Years.</div>;
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <h2 className="mb-1 text-lg font-semibold text-slate-800 dark:text-slate-100">Years</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Start a new Year, or wrap up a finished one. Wrapping up generates a full-year report and makes everything in that Year read-only.
        </p>
      </div>

      {error && <div className="rounded-md bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-600 dark:text-red-400">{error}</div>}

      <form onSubmit={handleCreate} className={cardClass}>
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
          <CalendarPlus className="h-4 w-4" /> Add a new Year
        </div>
        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
          A new Year starts completely blank: no Targets, Actuals, Disbursements, Notes, Rocks, Target Locks or Quarter End Dates are carried over. Business Units,
          Companies, Business Goals and users are shared across Years, so they're already there. To carry unfinished Q4 Rocks into it, use Rollover on the Rocks page.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input type="number" min={2000} max={2100} className={`${inputClass} w-32`} value={newYear} onChange={(e) => setNewYear(Number(e.target.value))} />
          <button
            disabled={creating || !newYear}
            className="flex items-center gap-2 rounded-md bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {creating && <Loader2 className="h-4 w-4 animate-spin" />} Create Year {newYear || ""}
          </button>
        </div>
        {createMsg && <div className="mt-3 text-sm text-green-700 dark:text-green-400">{createMsg}</div>}
      </form>

      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="border-b border-slate-200 dark:border-slate-700 text-left text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">Year</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-slate-500 dark:text-slate-400">
                  Loading...
                </td>
              </tr>
            )}
            {!loading && years.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-slate-500 dark:text-slate-400">
                  No Years yet.
                </td>
              </tr>
            )}
            {years.map((y) => (
              <tr key={y.id} className="border-b border-slate-100 dark:border-slate-800 last:border-0">
                <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-100">{y.year}</td>
                <td className="px-4 py-3">
                  {y.wrappedUpAt ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-200">
                      <Lock className="h-3 w-3" /> Wrapped up {fmtDate(y.wrappedUpAt)}
                      {y.wrappedUpByName ? ` · ${y.wrappedUpByName}` : ""}
                    </span>
                  ) : (
                    <span className="inline-flex rounded-full bg-green-50 dark:bg-green-950/40 px-2 py-1 text-xs font-medium text-green-700 dark:text-green-300">Open</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap justify-end gap-2">
                    {y.wrappedUpAt ? (
                      <>
                        <Link
                          to={`/years/${y.id}/report`}
                          className="flex items-center gap-1.5 rounded-md border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          <FileText className="h-3.5 w-3.5" /> View report
                        </Link>
                        {isSuperadmin && (
                          <button
                            onClick={() => setReopenTarget(y)}
                            className="flex items-center gap-1.5 rounded-md border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                          >
                            <LockOpen className="h-3.5 w-3.5" /> Reopen
                          </button>
                        )}
                      </>
                    ) : (
                      canWrapUp && (
                        <button
                          onClick={() => setWrapTarget(y)}
                          className="flex items-center gap-1.5 rounded-md bg-slate-800 dark:bg-slate-200 px-3 py-1.5 text-xs font-medium text-white dark:text-slate-900 hover:bg-slate-700 dark:hover:bg-white"
                        >
                          <Lock className="h-3.5 w-3.5" /> Wrap up Year
                        </button>
                      )
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!canWrapUp && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Wrapping up locks a Year for every Business Unit, so it needs a Superadmin or a Group Integrator with group-wide access.
        </p>
      )}

      {wrapTarget && (
        <WrapUpDialog
          year={wrapTarget}
          onClose={() => setWrapTarget(null)}
          onDone={() => {
            setWrapTarget(null);
            load();
          }}
        />
      )}
      {reopenTarget && (
        <ReopenDialog
          year={reopenTarget}
          onClose={() => setReopenTarget(null)}
          onDone={() => {
            setReopenTarget(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:items-center" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-xl"
      >
        {children}
      </div>
    </div>
  );
}

function WrapUpDialog({ year, onClose, onDone }: { year: Year; onClose: () => void; onDone: () => void }) {
  const [preview, setPreview] = useState<YearWrapUpPreview | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .yearWrapUpPreview(year.id)
      .then(setPreview)
      .catch((err) => setError(err.message || "Failed to load the wrap-up preview"));
  }, [year.id]);

  async function handleWrapUp() {
    setBusy(true);
    setError("");
    try {
      await api.wrapUpYear(year.id, Number(confirmText));
      onDone();
    } catch (err: any) {
      setError(err.message || "Failed to wrap up the year");
      setBusy(false);
    }
  }

  const warnings: string[] = [];
  if (preview) {
    if (!preview.yearEnded) warnings.push(`${preview.year} hasn't ended yet. Anything recorded after today won't be in the report.`);
    if (preview.openQ4Rocks > 0)
      warnings.push(
        `${preview.openQ4Rocks} Q4 Rock${preview.openQ4Rocks === 1 ? " is" : "s are"} still unfinished and not rolled over. Once wrapped up they can't be rolled into ${preview.year + 1}${
          preview.nextYearExists ? "" : ` (create ${preview.year + 1} first, then use Rollover on the Rocks page)`
        }.`
      );
    if (preview.companiesWithActuals < preview.companiesTotal)
      warnings.push(`Only ${preview.companiesWithActuals} of ${preview.companiesTotal} Companies have any Actuals recorded for ${preview.year}.`);
  }

  return (
    <Modal onClose={onClose}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">Wrap up {year.year}</h3>
        <button onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
          <X className="h-4 w-4" />
        </button>
      </div>

      <p className="text-sm text-slate-600 dark:text-slate-300">This will:</p>
      <ul className="mb-4 mt-1 list-disc pl-5 text-sm text-slate-600 dark:text-slate-300">
        <li>generate a full-year report of {year.year} (financials by quarter, Business Unit and Company, and every Rock), frozen as it stands now</li>
        <li>make everything in {year.year} read-only: Targets, Actuals, Disbursements, Notes, Rocks and Quarter End Dates</li>
      </ul>
      <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">Nothing is deleted. A Superadmin can reopen the Year later if a correction is needed.</p>

      {!preview && !error && (
        <div className="mb-4 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking what's still open...
        </div>
      )}
      {preview && (
        <div className="mb-4 rounded-md bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-600 dark:text-slate-300">
          {preview.rocksTotal} Rock{preview.rocksTotal === 1 ? "" : "s"} recorded, {preview.openRocks} not yet met. Actuals recorded for {preview.companiesWithActuals} of{" "}
          {preview.companiesTotal} Companies.
        </div>
      )}
      {warnings.length > 0 && (
        <div className="mb-4 flex flex-col gap-2 rounded-md bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
          {warnings.map((w) => (
            <div key={w} className="flex gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Type {year.year} to confirm</label>
      <input className={`${inputClass} mb-3 w-full`} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={String(year.year)} />

      {error && <div className="mb-3 rounded-md bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-600 dark:text-red-400">{error}</div>}

      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="rounded-md px-3 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">
          Cancel
        </button>
        <button
          onClick={handleWrapUp}
          disabled={busy || confirmText.trim() !== String(year.year)}
          className="flex items-center gap-2 rounded-md bg-slate-800 dark:bg-slate-200 px-3 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-700 dark:hover:bg-white disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />} Wrap up {year.year}
        </button>
      </div>
    </Modal>
  );
}

function ReopenDialog({ year, onClose, onDone }: { year: Year; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleReopen() {
    setBusy(true);
    setError("");
    try {
      await api.reopenYear(year.id, reason.trim());
      onDone();
    } catch (err: any) {
      setError(err.message || "Failed to reopen the year");
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">Reopen {year.year}</h3>
        <button onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
        {year.year} becomes editable again. Its wrap-up report is withdrawn until the Year is wrapped up again, which generates a fresh one. The reason is recorded in
        the Audit Log.
      </p>
      <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Reason</label>
      <textarea className={`${inputClass} mb-3 w-full`} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Q4 Actuals for one Company were corrected" />
      {error && <div className="mb-3 rounded-md bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-600 dark:text-red-400">{error}</div>}
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="rounded-md px-3 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">
          Cancel
        </button>
        <button
          onClick={handleReopen}
          disabled={busy || reason.trim().length < 5}
          className="flex items-center gap-2 rounded-md bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockOpen className="h-4 w-4" />} Reopen {year.year}
        </button>
      </div>
    </Modal>
  );
}
