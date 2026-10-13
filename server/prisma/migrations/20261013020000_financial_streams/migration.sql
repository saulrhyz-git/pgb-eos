-- Financial Streams: labeled, additional Revenue / Collections / Expenses /
-- Disbursements lines per Business Unit or Company. Additive only — new
-- enum value, new enum, two new tables. QuarterActual, DisbursementActual
-- and every existing figure are untouched.

-- New role-matrix resource for managing stream definitions. (Adding an enum
-- value inside a transaction is fine on Postgres 12+ as long as it isn't
-- used in the same transaction, which it isn't here.)
ALTER TYPE "PermissionResource" ADD VALUE 'STREAMS';

CREATE TYPE "StreamCategory" AS ENUM ('REVENUE', 'COLLECTIONS', 'EXPENSES', 'DISBURSEMENTS');

CREATE TABLE "FinancialStream" (
    "id" TEXT NOT NULL,
    "category" "StreamCategory" NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "businessUnitId" TEXT,
    "companyId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialStream_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinancialStreamActual" (
    "id" TEXT NOT NULL,
    "streamId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "yearId" TEXT NOT NULL,
    "quarter" INTEGER NOT NULL,
    "revenueInternal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "revenueExternal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "collectionsInternalEarned" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "collectionsInternalUnearned" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "collectionsInternalOthers" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "collectionsExternalEarned" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "collectionsExternalUnearned" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "collectionsExternalOthers" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "expenses" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "disbursements" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "remarks" TEXT NOT NULL DEFAULT '',
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialStreamActual_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FinancialStream_businessUnitId_idx" ON "FinancialStream"("businessUnitId");
CREATE INDEX "FinancialStream_companyId_idx" ON "FinancialStream"("companyId");
CREATE INDEX "FinancialStream_category_idx" ON "FinancialStream"("category");

CREATE UNIQUE INDEX "FinancialStreamActual_streamId_companyId_yearId_quarter_key" ON "FinancialStreamActual"("streamId", "companyId", "yearId", "quarter");
CREATE INDEX "FinancialStreamActual_yearId_quarter_idx" ON "FinancialStreamActual"("yearId", "quarter");
CREATE INDEX "FinancialStreamActual_companyId_idx" ON "FinancialStreamActual"("companyId");

ALTER TABLE "FinancialStream" ADD CONSTRAINT "FinancialStream_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinancialStream" ADD CONSTRAINT "FinancialStream_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FinancialStreamActual" ADD CONSTRAINT "FinancialStreamActual_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "FinancialStream"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "FinancialStreamActual" ADD CONSTRAINT "FinancialStreamActual_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinancialStreamActual" ADD CONSTRAINT "FinancialStreamActual_yearId_fkey" FOREIGN KEY ("yearId") REFERENCES "Year"("id") ON DELETE CASCADE ON UPDATE CASCADE;
