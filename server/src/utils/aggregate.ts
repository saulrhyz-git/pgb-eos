import type { Prisma } from "@prisma/client";

// Prisma Decimal fields arrive as Decimal.js instances; normalize to plain numbers
// for arithmetic and JSON serialization.
export function n(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : Number(value.toString());
}

// Revenue stays a plain Internal/External pair. Collections is Internal/
// External, each broken into three recognition types (Earned/Unearned/
// Others) — see schema.prisma's QuarterTarget/QuarterActual comment. Expenses
// is a single plain amount — it used to be three single-value breakdowns
// (Interest/Depreciation/Other Non-Cash), collapsed to one number; see
// ExpenseNote for the growable, informational-only record-keeping facility
// that replaced that breakdown (never included in this Figures shape, since
// it has no bearing on any total/calculation).
export interface Figures {
  revenueInternal: number;
  revenueExternal: number;
  collectionsInternalEarned: number;
  collectionsInternalUnearned: number;
  collectionsInternalOthers: number;
  collectionsExternalEarned: number;
  collectionsExternalUnearned: number;
  collectionsExternalOthers: number;
  expenses: number;
}

export const emptyFigures = (): Figures => ({
  revenueInternal: 0,
  revenueExternal: 0,
  collectionsInternalEarned: 0,
  collectionsInternalUnearned: 0,
  collectionsInternalOthers: 0,
  collectionsExternalEarned: 0,
  collectionsExternalUnearned: 0,
  collectionsExternalOthers: 0,
  expenses: 0,
});

export function toFigures(row: any): Figures {
  return {
    revenueInternal: n(row?.revenueInternal),
    revenueExternal: n(row?.revenueExternal),
    collectionsInternalEarned: n(row?.collectionsInternalEarned),
    collectionsInternalUnearned: n(row?.collectionsInternalUnearned),
    collectionsInternalOthers: n(row?.collectionsInternalOthers),
    collectionsExternalEarned: n(row?.collectionsExternalEarned),
    collectionsExternalUnearned: n(row?.collectionsExternalUnearned),
    collectionsExternalOthers: n(row?.collectionsExternalOthers),
    expenses: n(row?.expenses),
  };
}

export function addFigures(a: Figures, b: Figures): Figures {
  return {
    revenueInternal: a.revenueInternal + b.revenueInternal,
    revenueExternal: a.revenueExternal + b.revenueExternal,
    collectionsInternalEarned: a.collectionsInternalEarned + b.collectionsInternalEarned,
    collectionsInternalUnearned: a.collectionsInternalUnearned + b.collectionsInternalUnearned,
    collectionsInternalOthers: a.collectionsInternalOthers + b.collectionsInternalOthers,
    collectionsExternalEarned: a.collectionsExternalEarned + b.collectionsExternalEarned,
    collectionsExternalUnearned: a.collectionsExternalUnearned + b.collectionsExternalUnearned,
    collectionsExternalOthers: a.collectionsExternalOthers + b.collectionsExternalOthers,
    expenses: a.expenses + b.expenses,
  };
}

export function revenueTotal(f: Figures): number {
  return f.revenueInternal + f.revenueExternal;
}

export function collectionsInternalTotal(f: Figures): number {
  return f.collectionsInternalEarned + f.collectionsInternalUnearned + f.collectionsInternalOthers;
}

export function collectionsExternalTotal(f: Figures): number {
  return f.collectionsExternalEarned + f.collectionsExternalUnearned + f.collectionsExternalOthers;
}

export function collectionsTotal(f: Figures): number {
  return collectionsInternalTotal(f) + collectionsExternalTotal(f);
}

// Kept as a named function (rather than inlining `f.expenses` at every call
// site) purely to minimize the diff across dashboard.ts/scorecard.ts/
// comparison.ts/reports.ts, all of which already call `expensesTotal(...)`.
export function expensesTotal(f: Figures): number {
  return f.expenses;
}

export function pct(actual: number, target: number): number {
  if (!target) return actual > 0 ? 100 : 0;
  return Math.round((actual / target) * 1000) / 10; // one decimal place
}

// Disbursements: recorded — not targeted — so there's no Target-side
// equivalent of Figures/emptyFigures above, just this one Actual-shaped set.
// Used to be three sub-categories (Advances/Loans/Interests) each split
// Internal/External — collapsed to a single plain amount, same
// simplification as Expenses above; see DisbursementNote for the growable,
// informational-only record-keeping facility that replaced that breakdown.
export interface DisbursementFigures {
  amount: number;
}

export const emptyDisbursementFigures = (): DisbursementFigures => ({
  amount: 0,
});

export function toDisbursementFigures(row: any): DisbursementFigures {
  return {
    amount: n(row?.amount),
  };
}

export function addDisbursementFigures(a: DisbursementFigures, b: DisbursementFigures): DisbursementFigures {
  return {
    amount: a.amount + b.amount,
  };
}

// Kept as a named function for the same minimal-diff reason as
// expensesTotal() above — replaces the old advancesTotal/loansTotal/
// interestsTotal trio now that Disbursements is a single amount.
export function disbursementsTotal(f: DisbursementFigures): number {
  return f.amount;
}
