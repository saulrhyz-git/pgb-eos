import { Lock } from "lucide-react";
import { Link } from "react-router-dom";
import type { Year } from "../api/types";

// Shown on every page that edits a Year's data (Data Entry, Target Setup,
// Rocks, Financials) when the selected Year has been wrapped up. The server
// refuses the edits regardless (server/src/utils/yearLock.ts) — this just
// tells people why before they try.
export function isYearLocked(year: Year | undefined | null): boolean {
  return Boolean(year?.wrappedUpAt);
}

export default function YearLockedBanner({ year, showReportLink = false }: { year: Year | undefined | null; showReportLink?: boolean }) {
  if (!year?.wrappedUpAt) return null;
  const date = new Date(year.wrappedUpAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 px-4 py-3 text-sm text-slate-700 dark:text-slate-200">
      <Lock className="h-4 w-4 shrink-0" />
      <span>
        <strong>Year {year.year} is wrapped up</strong> ({date}
        {year.wrappedUpByName ? `, by ${year.wrappedUpByName}` : ""}). Everything in it is read-only.
      </span>
      {showReportLink && (
        <Link to={`/years/${year.id}/report`} className="font-medium text-brand-600 dark:text-brand-400 hover:underline">
          View wrap-up report
        </Link>
      )}
    </div>
  );
}
