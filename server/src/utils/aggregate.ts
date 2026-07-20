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
// has no Internal/External split at all, just three single-value breakdowns
// (Interest/Depreciation/Other Non-Cash).
export interface Figures {
  revenueInternal: number;
  revenueExternal: number;
  collectionsInternalEarned: number;
  collectionsInternalUnearned: number;
  collectionsInternalOthers: number;
  collectionsExternalEarned: number;
  collectionsExternalUnearned: number;
  collectionsExternalOthers: number;
  expensesInterest: number;
  expensesDepreciation: number;
  expensesOtherNonCash: number;
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
  expensesInterest: 0,
  expensesDepreciation: 0,
  expensesOtherNonCash: 0,
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
    expensesInterest: n(row?.expensesInterest),
    expensesDepreciation: n(row?.expensesDepreciation),
    expensesOtherNonCash: n(row?.expensesOtherNonCash),
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
    expensesInterest: a.expensesInterest + b.expensesInterest,
    expensesDepreciation: a.expensesDepreciation + b.expensesDepreciation,
    expensesOtherNonCash: a.expensesOtherNonCash + b.expensesOtherNonCash,
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

export function expensesTotal(f: Figures): number {
  return f.expensesInterest + f.expensesDepreciation + f.expensesOtherNonCash;
}

export function pct(actual: number, target: number): number {
  if (!target) return actual > 0 ? 100 : 0;
  return Math.round((actual / target) * 1000) / 10; // one decimal place
}

// Disbursements: recorded — not targeted — so there's no Target-side
// equivalent of Figures/emptyFigures above, just this one Actual-shaped set.
export interface DisbursementFigures {
  advancesInternal: number;
  advancesExternal: number;
  loansInternal: number;
  loansExternal: number;
  interestsInternal: number;
  interestsExternal: number;
}

export const emptyDisbursementFigures = (): DisbursementFigures => ({
  advancesInternal: 0,
  advancesExternal: 0,
  loansInternal: 0,
  loansExternal: 0,
  interestsInternal: 0,
  interestsExternal: 0,
});

export function toDisbursementFigures(row: any): DisbursementFigures {
  return {
    advancesInternal: n(row?.advancesInternal),
    advancesExternal: n(row?.advancesExternal),
    loansInternal: n(row?.loansInternal),
    loansExternal: n(row?.loansExternal),
    interestsInternal: n(row?.interestsInternal),
    interestsExternal: n(row?.interestsExternal),
  };
}

export function addDisbursementFigures(a: DisbursementFigures, b: DisbursementFigures): DisbursementFigures {
  return {
    advancesInternal: a.advancesInternal + b.advancesInternal,
    advancesExternal: a.advancesExternal + b.advancesExternal,
    loansInternal: a.loansInternal + b.loansInternal,
    loansExternal: a.loansExternal + b.loansExternal,
    interestsInternal: a.interestsInternal + b.interestsInternal,
    interestsExternal: a.interestsExternal + b.interestsExternal,
  };
}

export function advancesTotal(f: DisbursementFigures): number {
  return f.advancesInternal + f.advancesExternal;
}

export function loansTotal(f: DisbursementFigures): number {
  return f.loansInternal + f.loansExternal;
}

export function interestsTotal(f: DisbursementFigures): number {
  return f.interestsInternal + f.interestsExternal;
}
