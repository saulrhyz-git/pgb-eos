-- Force AnnualTarget and QuarterTarget into their current per-Company shape
-- (companyId + yearId[+quarter], AnnualTarget also carries `locked`).
--
-- The tracked migration history never captured the interim change to
-- businessUnitId-keyed targets (it was applied to some databases via
-- `prisma db push` outside of migration files), so a live database can be in
-- a drifted state where AnnualTarget/QuarterTarget still have a
-- `businessUnitId` column instead of `companyId`, and error at query time
-- with something like: column "annualtarget.companyId" does not exist.
--
-- This migration is non-additive: it drops and recreates both tables
-- unconditionally so it applies cleanly no matter which drifted shape the
-- database is currently in. Any previously entered Annual/Quarter target
-- data is lost — consistent with this project's pre-launch/disposable-data
-- convention (see README). Recognized actuals in QuarterActual are untouched.

DROP TABLE IF EXISTS "AnnualTarget" CASCADE;
DROP TABLE IF EXISTS "QuarterTarget" CASCADE;

CREATE TABLE "AnnualTarget" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "yearId" TEXT NOT NULL,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "revenueInternal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "revenueExternal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "collectionsInternal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "collectionsExternal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "expensesInternal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "expensesExternal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnnualTarget_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuarterTarget" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "yearId" TEXT NOT NULL,
    "quarter" INTEGER NOT NULL,
    "revenueInternal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "revenueExternal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "collectionsInternal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "collectionsExternal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "expensesInternal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "expensesExternal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuarterTarget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnnualTarget_yearId_idx" ON "AnnualTarget"("yearId");

-- CreateIndex
CREATE UNIQUE INDEX "AnnualTarget_companyId_yearId_key" ON "AnnualTarget"("companyId", "yearId");

-- CreateIndex
CREATE INDEX "QuarterTarget_yearId_quarter_idx" ON "QuarterTarget"("yearId", "quarter");

-- CreateIndex
CREATE UNIQUE INDEX "QuarterTarget_companyId_yearId_quarter_key" ON "QuarterTarget"("companyId", "yearId", "quarter");

-- AddForeignKey
ALTER TABLE "AnnualTarget" ADD CONSTRAINT "AnnualTarget_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnualTarget" ADD CONSTRAINT "AnnualTarget_yearId_fkey" FOREIGN KEY ("yearId") REFERENCES "Year"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuarterTarget" ADD CONSTRAINT "QuarterTarget_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuarterTarget" ADD CONSTRAINT "QuarterTarget_yearId_fkey" FOREIGN KEY ("yearId") REFERENCES "Year"("id") ON DELETE CASCADE ON UPDATE CASCADE;
