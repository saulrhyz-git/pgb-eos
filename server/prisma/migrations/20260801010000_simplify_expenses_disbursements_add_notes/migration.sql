-- Collapses Expenses (QuarterTarget/QuarterActual) and Disbursements
-- (DisbursementActual) down to a single plain amount each, replacing their
-- old fixed breakdowns (Expenses: Interest/Depreciation/Other Non-Cash;
-- Disbursements: Advances/Loans/Interests x Internal/External) with a new,
-- superadmin-managed, growable "notable line items" record-keeping facility
-- (NoteCategory/ExpenseNote/DisbursementNote) that has no bearing on any
-- total/calculation — purely informational.
--
-- Destructive: per the decision made when this was scoped, old breakdown
-- values are NOT migrated into the new single amount columns — every
-- existing QuarterTarget/QuarterActual/DisbursementActual row starts its new
-- `expenses`/`amount` column at the default of 0, same as any other
-- fresh-start restructuring migration in this project (see
-- 20260724010000_restructure_collections_expenses_breakdown for the same
-- precedent on the Collections/Expenses breakdown before this one).

-- ---------- QuarterTarget: 3-way Expenses breakdown -> single amount ----------
ALTER TABLE "QuarterTarget"
  DROP COLUMN "expensesInterest",
  DROP COLUMN "expensesDepreciation",
  DROP COLUMN "expensesOtherNonCash",
  ADD COLUMN "expenses" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- ---------- QuarterActual: 3-way Expenses breakdown + remarks -> single amount + remarks ----------
ALTER TABLE "QuarterActual"
  DROP COLUMN "expensesInterest",
  DROP COLUMN "expensesDepreciation",
  DROP COLUMN "expensesOtherNonCash",
  DROP COLUMN "expensesInterestRemarks",
  DROP COLUMN "expensesDepreciationRemarks",
  DROP COLUMN "expensesOtherNonCashRemarks",
  ADD COLUMN "expenses" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "expensesRemarks" TEXT NOT NULL DEFAULT '';

-- ---------- DisbursementActual: Advances/Loans/Interests x Internal/External -> single amount + remarks ----------
ALTER TABLE "DisbursementActual"
  DROP COLUMN "advancesInternal",
  DROP COLUMN "advancesExternal",
  DROP COLUMN "loansInternal",
  DROP COLUMN "loansExternal",
  DROP COLUMN "interestsInternal",
  DROP COLUMN "interestsExternal",
  DROP COLUMN "advancesRemarks",
  DROP COLUMN "loansRemarks",
  DROP COLUMN "interestsRemarks",
  ADD COLUMN "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "remarks" TEXT NOT NULL DEFAULT '';

-- ---------- NoteCategoryType enum ----------
CREATE TYPE "NoteCategoryType" AS ENUM ('EXPENSE', 'DISBURSEMENT');

-- ---------- NoteCategory: superadmin-managed catalog ----------
CREATE TABLE "NoteCategory" (
    "id" TEXT NOT NULL,
    "type" "NoteCategoryType" NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoteCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NoteCategory_type_label_key" ON "NoteCategory"("type", "label");
CREATE INDEX "NoteCategory_type_idx" ON "NoteCategory"("type");

-- ---------- ExpenseNote ----------
CREATE TABLE "ExpenseNote" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "yearId" TEXT NOT NULL,
    "quarter" INTEGER NOT NULL,
    "categoryId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "remarks" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExpenseNote_companyId_yearId_quarter_idx" ON "ExpenseNote"("companyId", "yearId", "quarter");
CREATE INDEX "ExpenseNote_categoryId_idx" ON "ExpenseNote"("categoryId");

ALTER TABLE "ExpenseNote" ADD CONSTRAINT "ExpenseNote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExpenseNote" ADD CONSTRAINT "ExpenseNote_yearId_fkey" FOREIGN KEY ("yearId") REFERENCES "Year"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExpenseNote" ADD CONSTRAINT "ExpenseNote_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "NoteCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------- DisbursementNote ----------
CREATE TABLE "DisbursementNote" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "yearId" TEXT NOT NULL,
    "quarter" INTEGER NOT NULL,
    "categoryId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "remarks" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DisbursementNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DisbursementNote_companyId_yearId_quarter_idx" ON "DisbursementNote"("companyId", "yearId", "quarter");
CREATE INDEX "DisbursementNote_categoryId_idx" ON "DisbursementNote"("categoryId");

ALTER TABLE "DisbursementNote" ADD CONSTRAINT "DisbursementNote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DisbursementNote" ADD CONSTRAINT "DisbursementNote_yearId_fkey" FOREIGN KEY ("yearId") REFERENCES "Year"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DisbursementNote" ADD CONSTRAINT "DisbursementNote_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "NoteCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------- Seed default categories (superadmin can add/rename/deactivate afterward) ----------
INSERT INTO "NoteCategory" ("id", "type", "label", "sortOrder", "active") VALUES
  (gen_random_uuid()::text, 'EXPENSE', 'Interest', 1, true),
  (gen_random_uuid()::text, 'EXPENSE', 'Depreciation', 2, true),
  (gen_random_uuid()::text, 'EXPENSE', 'Other Non-Cash', 3, true),
  (gen_random_uuid()::text, 'EXPENSE', 'Cost of Sales', 4, true),
  (gen_random_uuid()::text, 'EXPENSE', 'OPEX', 5, true),
  (gen_random_uuid()::text, 'DISBURSEMENT', 'Advances', 1, true),
  (gen_random_uuid()::text, 'DISBURSEMENT', 'Loans', 2, true),
  (gen_random_uuid()::text, 'DISBURSEMENT', 'Interest', 3, true);
