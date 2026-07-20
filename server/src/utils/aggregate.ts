import type { Prisma } from "@prisma/client";

// Prisma Decimal fields arrive as Decimal.js instances; normalize to plain numbers
// for arithmetic and JSON serialization.
export function n(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : Number(value.toString());
}

export interface Figures {
  revenueInternal: number;
  revenueExternal: number;
  collectionsInternal: number;
  collectionsExternal: number;
  expensesInternal: number;
  expensesExternal: number;
}

export const emptyFigures = (): Figures => ({
  revenueInternal: 0,
  revenueExternal: 0,
  collectionsInternal: 0,
  collectionsExternal: 0,
  expensesInternal: 0,
  expensesExternal: 0,
});

export function toFigures(row: any): Figures {
  return {
    revenueInternal: n(row?.revenueInternal),
    revenueExternal: n(row?.revenueExternal),
    collectionsInternal: n(row?.collectionsInternal),
    collectionsExternal: n(row?.collectionsExternal),
    expensesInternal: n(row?.expensesInternal),
    expensesExternal: n(row?.expensesExternal),
  };
}

export function addFigures(a: Figures, b: Figures): Figures {
  return {
    revenueInternal: a.revenueInternal + b.revenueInternal,
    revenueExternal: a.revenueExternal + b.revenueExternal,
    collectionsInternal: a.collectionsInternal + b.collectionsInternal,
    collectionsExternal: a.collectionsExternal + b.collectionsExternal,
    expensesInternal: a.expensesInternal + b.expensesInternal,
    expensesExternal: a.expensesExternal + b.expensesExternal,
  };
}

export function revenueTotal(f: Figures): number {
  return f.revenueInternal + f.revenueExternal;
}

export function collectionsTotal(f: Figures): number {
  return f.collectionsInternal + f.collectionsExternal;
}

export function expensesTotal(f: Figures): number {
  return f.expensesInternal + f.expensesExternal;
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
