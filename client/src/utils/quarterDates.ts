// Mirrors server/src/utils/quarterDates.ts: maps a Year + Quarter (1-4) onto
// its real calendar date range, purely for display here (the server is the
// authoritative source for "what quarter is it right now" via
// GET /api/current-quarter — see api.currentQuarter()).
//   Q1 = Jan 1 - Mar 31   Q2 = Apr 1 - Jun 30
//   Q3 = Jul 1 - Sep 30   Q4 = Oct 1 - Dec 31

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function quarterDateRange(year: number, quarter: number): { start: Date; end: Date } {
  const startMonth = (quarter - 1) * 3;
  const start = new Date(Date.UTC(year, startMonth, 1));
  const end = new Date(Date.UTC(year, startMonth + 3, 0));
  return { start, end };
}

// e.g. "Jan 1 - Mar 31, 2026"
export function formatQuarterRange(year: number, quarter: number): string {
  const { start, end } = quarterDateRange(year, quarter);
  const startLabel = `${MONTH_LABELS[start.getUTCMonth()]} ${start.getUTCDate()}`;
  const endLabel = `${MONTH_LABELS[end.getUTCMonth()]} ${end.getUTCDate()}`;
  return `${startLabel} - ${endLabel}, ${year}`;
}
