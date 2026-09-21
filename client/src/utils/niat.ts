// NIAT (Net Income After Taxes) — Philippine corporate income tax, BETA.
//
// Per the NIRC as amended by the CREATE Act, a domestic corporation owes
// the HIGHER of:
//   - RCIT (Regular Corporate Income Tax): 25% of net taxable income, or
//     20% for an MSME (net taxable income ≤ ₱5,000,000 AND total assets ≤
//     ₱100,000,000 excluding the land its office/plant/equipment sit on).
//     This app has no "total assets" figure recorded anywhere, so the NIAT
//     tab asks for it directly, per computation, via an "Assets Exceed
//     ₱100M" tickbox — see the `assetsExceed100M` param below. Ticked
//     (assets > ₱100M) fails the asset test on its own, so RCIT is always
//     25% regardless of income; unticked applies the income-only test
//     (≤₱5M → 20%, else 25%).
//   - MCIT (Minimum Corporate Income Tax): 2% of gross income, from the
//     4th taxable year immediately following the year a corporation
//     started business operations onward. Every PHI company has been
//     operating more than 4 years, so this always applies — MCIT is
//     compared unconditionally, with no "too new to owe it" exemption.
//
// The one remaining approximation: "gross income" for MCIT is properly
// Revenue minus Cost of Sales, but this app tracks one combined Expenses
// total with no Cost-of-Sales/OPEX split recorded anywhere. Total Revenue
// is used as a stand-in for Gross Income by default (overstating MCIT
// versus the true figure) UNLESS the viewer enters that Company's actual
// Cost of Sales for the period on the NIAT tab — see the `cogs` param
// below — in which case Gross Income = Revenue − COGS is used instead.
// Like assetsExceed100M, this is a per-computation, view-only input, not
// something persisted anywhere.
export interface NiatResult {
  revenue: number;
  expenses: number;
  // Revenue − Expenses, i.e. this app's existing "Net Income" figure (see
  // NetIncomeCard on the Scorecard) before any tax is applied. Not
  // affected by assetsExceed100M or the COGS split — those only change how
  // the tax on this figure is derived, not the figure itself.
  netIncomeBeforeTax: number;
  assetsExceed100M: boolean;
  rcitRate: 0.2 | 0.25;
  rcit: number;
  // Cost of Sales used for Gross Income, if the viewer entered one —
  // undefined means the Total-Revenue-as-Gross-Income fallback was used.
  cogs?: number;
  // Expenses − cogs, shown for reference once a COGS split is entered.
  opex?: number;
  grossIncome: number;
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

export function computeNiat(revenue: number, expenses: number, assetsExceed100M: boolean, cogs?: number): NiatResult {
  const netIncomeBeforeTax = revenue - expenses;

  // Assets > ₱100M fails the MSME asset test on its own, so the income
  // test below is only reached — and only then decides the rate — when
  // assets are ≤ ₱100M.
  const rcitRate: 0.2 | 0.25 =
    !assetsExceed100M && netIncomeBeforeTax > 0 && netIncomeBeforeTax <= MSME_NET_INCOME_THRESHOLD ? RCIT_RATE_MSME : RCIT_RATE_REGULAR;
  // RCIT is only owed on positive net income — there's no tax on a loss.
  const rcit = netIncomeBeforeTax > 0 ? netIncomeBeforeTax * rcitRate : 0;

  const hasCogs = cogs !== undefined && !Number.isNaN(cogs);
  const grossIncome = hasCogs ? Math.max(0, revenue - cogs!) : revenue;
  const opex = hasCogs ? expenses - cogs! : undefined;

  // MCIT, unlike RCIT, is owed even in a loss year — that's the point of a
  // *minimum* tax — as long as there's positive Gross Income to measure it
  // against.
  const mcit = grossIncome > 0 ? grossIncome * MCIT_RATE : 0;

  const usedMcit = mcit > rcit;
  const taxDue = Math.max(rcit, mcit);
  const niat = netIncomeBeforeTax - taxDue;

  return {
    revenue,
    expenses,
    netIncomeBeforeTax,
    assetsExceed100M,
    rcitRate,
    rcit,
    cogs: hasCogs ? cogs : undefined,
    opex,
    grossIncome,
    mcit,
    taxDue,
    usedMcit,
    niat,
  };
}
