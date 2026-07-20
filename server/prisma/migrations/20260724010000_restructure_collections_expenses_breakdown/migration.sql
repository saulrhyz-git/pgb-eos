-- Restructure Collections and Expenses figures on QuarterTarget/QuarterActual.
-- Revenue is untouched. Collections' single Internal/External pair becomes
-- Internal/External x Earned/Unearned/Others (6 values). Expenses drops the
-- Internal/External split entirely in favor of 3 single-value breakdowns
-- (Interest/Depreciation/Other Non-Cash). QuarterActual also drops its single
-- collectionsRemarks/expensesRemarks fields in favor of one Remarks field per
-- new breakdown (6 for Collections, 3 for Expenses), mirroring Disbursements'
-- per-category Remarks pattern. This is a destructive column change (old
-- collectionsInternal/collectionsExternal/expensesInternal/expensesExternal
-- data is not migrated into the new breakdown columns, since there is no
-- principled way to split a combined historical figure into Earned/Unearned/
-- Others or Interest/Depreciation/Other Non-Cash after the fact).

ALTER TABLE "QuarterTarget"
  DROP COLUMN "collectionsInternal",
  DROP COLUMN "collectionsExternal",
  DROP COLUMN "expensesInternal",
  DROP COLUMN "expensesExternal",
  ADD COLUMN "collectionsInternalEarned" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "collectionsInternalUnearned" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "collectionsInternalOthers" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "collectionsExternalEarned" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "collectionsExternalUnearned" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "collectionsExternalOthers" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "expensesInterest" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "expensesDepreciation" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "expensesOtherNonCash" DECIMAL(14,2) NOT NULL DEFAULT 0;

ALTER TABLE "QuarterActual"
  DROP COLUMN "collectionsInternal",
  DROP COLUMN "collectionsExternal",
  DROP COLUMN "expensesInternal",
  DROP COLUMN "expensesExternal",
  DROP COLUMN "collectionsRemarks",
  DROP COLUMN "expensesRemarks",
  ADD COLUMN "collectionsInternalEarned" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "collectionsInternalUnearned" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "collectionsInternalOthers" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "collectionsExternalEarned" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "collectionsExternalUnearned" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "collectionsExternalOthers" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "expensesInterest" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "expensesDepreciation" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "expensesOtherNonCash" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "collectionsInternalEarnedRemarks" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "collectionsInternalUnearnedRemarks" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "collectionsInternalOthersRemarks" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "collectionsExternalEarnedRemarks" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "collectionsExternalUnearnedRemarks" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "collectionsExternalOthersRemarks" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "expensesInterestRemarks" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "expensesDepreciationRemarks" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "expensesOtherNonCashRemarks" TEXT NOT NULL DEFAULT '';
