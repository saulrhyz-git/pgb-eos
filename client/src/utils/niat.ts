// NIAT (Net Income After Taxes) — Philippine corporate income tax, BETA.
//
// This is a simplified approximation, not a substitute for an actual tax
// computation — see the specific gaps called out below, each of which
// exists because this app doesn't currently capture the underlying data a
// fully accurate computation would need. The NIAT tab shows a BETA banner
// for exactly this reason.
//
// Per the NIRC as amended by the CREATE Act, a domestic corporation owes
// the HIGHER of:
//   - RCIT (Regular Corporate Income Tax): 25% of net taxable income, or
//     20% if the corporation qualifies as an MSME (net taxable income ≤
//     ₱5,000,000 AND total assets ≤ ₱100,000,000 excluding the land its
//     office/plant/equipment sit on).
//   - MCIT (Minimum Corporate Income Tax): 2% of gross income, but only
//     from the 4th taxable year immediately following the year the
//     corporation started business operations onward.
//
// Gaps in this implementation, given what this app currently tracks:
//   1. No "total assets" figure exists anywhere in the schema, so the RCIT
//      rate here is decided on the net-taxable-income test alone (≤ ₱5M),
//      without the accompanying assets test. A company that passes the
//      income test but fails the (unmodeled) assets test would incorrectly
//      get the 20% rate here instead of 25%.
//   2. "Gross income" for MCIT is properly Revenue minus Cost of Sales —
//      this app tracks one combined Expenses total with no Cost-of-Sales/
//      OPEX split, so Total Revenue is used as a stand-in for Gross Income.
//      This overstates MCIT relative to the true figure.
//   3. The "4th taxable year onward" MCIT gate isn't modeled — there's no
//      company start-date field to check it against — so MCIT is compared
//      every year/quarter here, including a company's first three.
export interface NiatResult {
  revenue: number;
  expenses: number;
  // Revenue − Expenses, i.e. this app's existing "Net Income" figure
  // (see NetIncomeCard on the Scorecard) before any tax is applied.
  netIncomeBeforeTax: number;
  rcitRate: 0.2 | 0.25;
  rcit: number;
  mcit: number;
  // Whichever of rcit/mcit is higher — the amount actually owed.
  taxDue: number;
  usedMcit: boolean;
  niat: number;
}

const MSME_NET_INCOME_THRESHOLD = 5_000_000;
const RCIT_RATE_REGULAR = 0.25;
const RCIT_RATE_MSME = 0.2;
const MCIT_RATE = 0.02;

export function computeNiat(revenue: number, expenses: number): NiatResult {
  const netIncomeBeforeTax = revenue - expenses;

  // RCIT is only owed on positive net income — there's no tax on a loss.
  const rcitRate: 0.2 | 0.25 = netIncomeBeforeTax > 0 && netIncomeBeforeTax <= MSME_NET_INCOME_THRESHOLD ? RCIT_RATE_MSME : RCIT_RATE_REGULAR;
  const rcit = netIncomeBeforeTax > 0 ? netIncomeBeforeTax * rcitRate : 0;

  // MCIT, unlike RCIT, is owed even in a loss year — that's the point of a
  // *minimum* tax — as long as there's positive revenue to measure it against.
  const mcit = revenue > 0 ? revenue * MCIT_RATE : 0;

  const usedMcit = mcit > rcit;
  const taxDue = Math.max(rcit, mcit);
  const niat = netIncomeBeforeTax - taxDue;

  return { revenue, expenses, netIncomeBeforeTax, rcitRate, rcit, mcit, taxDue, usedMcit, niat };
}

// Sums a list of already-computed per-Company NiatResults into one total —
// tax must be computed per Company first (each is its own taxable entity;
// summing revenue/expenses across Companies before computing tax would
// wrongly apply one company's MSME-rate eligibility to a combined multi-
// company total), so this is just addition, not a re-computation.
export function sumNiat(results: NiatResult[]): Omit<NiatResult, "rcitRate" | "usedMcit"> {
  return results.reduce(
    (sum, r) => ({
      revenue: sum.revenue + r.revenue,
      expenses: sum.expenses + r.expenses,
      netIncomeBeforeTax: sum.netIncomeBeforeTax + r.netIncomeBeforeTax,
      rcit: sum.rcit + r.rcit,
      mcit: sum.mcit + r.mcit,
      taxDue: sum.taxDue + r.taxDue,
      niat: sum.niat + r.niat,
    }),
    { revenue: 0, expenses: 0, netIncomeBeforeTax: 0, rcit: 0, mcit: 0, taxDue: 0, niat: 0 }
  );
}
