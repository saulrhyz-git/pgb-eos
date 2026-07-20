import { Fragment, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ScrollText, ShieldAlert } from "lucide-react";
import { api } from "../../api/client";
import type { AuditLogEntry } from "../../api/types";

// Audit Log — an append-only record of mutating actions across the app.
// Default access is Superadmin; a non-superadmin can also be granted access
// via a Custom Role that explicitly grants AUDIT_LOG view (see
// server/src/routes/auditLog.ts). This page is deliberately wired as a
// top-level route (see App.tsx) rather than nested under /admin/*, since the
// whole /admin section is client-side gated to SUPERADMIN only — nesting it
// there would block exactly the non-superadmin, Custom-Role-granted users
// this feature exists for. The backend enforces the real access check; a
// user without it simply gets the "access required" card below, same
// pattern as the Executive Scorecard.
const PAGE_SIZE = 50;

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminAuditLog() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const [actions, setActions] = useState<string[]>([]);
  const [entityTypes, setEntityTypes] = useState<string[]>([]);

  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    api
      .auditLogMeta()
      .then((meta) => {
        setActions(meta.actions);
        setEntityTypes(meta.entityTypes);
      })
      .catch(() => {
        // If the meta call 403s, the main list call below will too and will
        // surface the "access required" card — nothing else to do here.
      });
  }, []);

  useEffect(() => {
    setLoading(true);
    setError("");
    setForbidden(false);
    api
      .auditLog({
        page,
        pageSize: PAGE_SIZE,
        action: action || undefined,
        entityType: entityType || undefined,
        q: q || undefined,
        from: from ? new Date(from).toISOString() : undefined,
        to: to ? new Date(to + "T23:59:59").toISOString() : undefined,
      })
      .then((res) => {
        setEntries(res.entries);
        setTotal(res.total);
      })
      .catch((err) => {
        if (err.status === 403) setForbidden(true);
        else setError(err.message || "Failed to load the Audit Log");
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, action, entityType, q, from, to]);

  function resetToFirstPage<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setPage(1);
    };
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (forbidden) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-12 text-center shadow-sm">
        <ShieldAlert className="h-10 w-10 text-slate-300 dark:text-slate-600" />
        <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-200">Audit Log access required</h2>
        <p className="max-w-md text-sm text-slate-500 dark:text-slate-400">
          You don't currently have access to this page. Ask a Superadmin to grant your account (or a Custom Role assigned to
          you) view access to the Audit Log.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="mb-1 flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-slate-100">
            <ScrollText className="h-5 w-5 text-brand-600 dark:text-brand-400" /> Audit Log
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">A history of who changed what, and when.</p>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 shadow-sm">
        <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
          <div className="col-span-2 flex flex-col gap-1 sm:col-span-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Search</label>
            <input
              type="text"
              placeholder="Summary, user name, or email"
              className="w-full rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-3 py-1.5 text-sm sm:min-w-[220px]"
              value={q}
              onChange={(e) => resetToFirstPage(setQ)(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Action</label>
            <select
              className="w-full rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-3 py-1.5 text-sm"
              value={action}
              onChange={(e) => resetToFirstPage(setAction)(e.target.value)}
            >
              <option value="">All actions</option>
              {actions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Entity type</label>
            <select
              className="w-full rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-3 py-1.5 text-sm"
              value={entityType}
              onChange={(e) => resetToFirstPage(setEntityType)(e.target.value)}
            >
              <option value="">All types</option>
              {entityTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">From</label>
            <input
              type="date"
              className="w-full rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-3 py-1.5 text-sm"
              value={from}
              onChange={(e) => resetToFirstPage(setFrom)(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">To</label>
            <input
              type="date"
              className="w-full rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-3 py-1.5 text-sm"
              value={to}
              onChange={(e) => resetToFirstPage(setTo)(e.target.value)}
            />
          </div>
          {(action || entityType || q || from || to) && (
            <button
              className="col-span-2 rounded-md px-3 py-1.5 text-sm font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 sm:col-span-1"
              onClick={() => {
                setAction("");
                setEntityType("");
                setQ("");
                setFrom("");
                setTo("");
                setPage(1);
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {error && <div className="rounded-md bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-600 dark:text-red-400">{error}</div>}

      <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
        <div className="flex flex-col gap-2 border-b border-slate-200 dark:border-slate-700 px-4 py-3 text-sm text-slate-500 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <span>
            {total === 0 ? "0 entries" : `Showing ${(page - 1) * PAGE_SIZE + 1}-${Math.min(page * PAGE_SIZE, total)} of ${total}`}
          </span>
          <div className="flex items-center gap-2">
            <button
              className="flex items-center gap-1 rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" /> Prev
            </button>
            <span>
              Page {page} of {totalPages}
            </span>
            <button
              className="flex items-center gap-1 rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-slate-50 dark:bg-slate-950 text-left text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Entity</th>
                <th className="px-4 py-3">Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {entries.map((entry) => (
                <Fragment key={entry.id}>
                  <tr
                    className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
                    onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500 dark:text-slate-400">{formatTimestamp(entry.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800 dark:text-slate-100">{entry.userName || "(unknown user)"}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{entry.userEmail}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                        {entry.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{entry.entityType}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{entry.summary}</td>
                  </tr>
                  {expandedId === entry.id && entry.metadata && (
                    <tr>
                      <td colSpan={5} className="bg-slate-50 dark:bg-slate-950 px-4 py-3">
                        <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-words text-xs text-slate-600 dark:text-slate-300">
                          {JSON.stringify(entry.metadata, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {!loading && entries.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                    No audit log entries match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {loading && <div className="py-4 text-center text-sm text-slate-500 dark:text-slate-400">Loading...</div>}
    </div>
  );
}
