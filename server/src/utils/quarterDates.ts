// Maps the app's Year + Quarter (1-4) concept onto real calendar dates, so
// anything that needs a date/quarter constraint (defaulting to "the current
// quarter", gating an action to a date range, etc.) has one authoritative
// source of truth instead of guessing from a client's local clock.
//
// Quarters follow the standard calendar convention:
//   Q1 = Jan 1 - Mar 31   Q2 = Apr 1 - Jun 30
//   Q3 = Jul 1 - Sep 30   Q4 = Oct 1 - Dec 31
// All dates are UTC to avoid timezone drift between server and client.

export interface QuarterDateRange {
  year: number;
  quarter: number;
  start: Date; // first instant of the quarter (UTC)
  end: Date; // last instant of the quarter (UTC)
}

export function quarterDateRange(year: number, quarter: number): QuarterDateRange {
  if (quarter < 1 || quarter > 4) throw new Error("quarter must be 1-4");
  const startMonth = (quarter - 1) * 3; // Q1->0 (Jan), Q2->3 (Apr), Q3->6 (Jul), Q4->9 (Oct)
  const start = new Date(Date.UTC(year, startMonth, 1, 0, 0, 0, 0));
  // Day 0 of the month after the quarter's last month = the last day of the quarter.
  const end = new Date(Date.UTC(year, startMonth + 3, 0, 23, 59, 59, 999));
  return { year, quarter, start, end };
}

// Which calendar quarter (and year) a given date falls into. Defaults to
// right now.
export function calendarQuarterFor(date: Date = new Date()): { year: number; quarter: number } {
  const year = date.getUTCFullYear();
  const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
  return { year, quarter };
}

// Convenience: the calendar quarter (and its date range) for "right now".
export function currentCalendarQuarter(): QuarterDateRange {
  const { year, quarter } = calendarQuarterFor();
  return quarterDateRange(year, quarter);
}
