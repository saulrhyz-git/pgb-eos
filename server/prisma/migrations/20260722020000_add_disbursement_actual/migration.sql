-- CreateTable
-- Disbursements: recorded per Company/Year/Quarter, same hierarchy as
-- QuarterActual but with no corresponding Target table — Advances, Loans,
-- and Interests each split Internal/External with their own Remarks, all
-- three sub-categories on one row per Company/Year/Quarter.
CREATE TABLE "DisbursementActual" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "yearId" TEXT NOT NULL,
    "quarter" INTEGER NOT NULL,
    "advancesInternal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "advancesExternal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "loansInternal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "loansExternal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "interestsInternal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "interestsExternal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "advancesRemarks" TEXT NOT NULL DEFAULT '',
    "loansRemarks" TEXT NOT NULL DEFAULT '',
    "interestsRemarks" TEXT NOT NULL DEFAULT '',
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DisbursementActual_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DisbursementActual_yearId_quarter_idx" ON "DisbursementActual"("yearId", "quarter");

-- CreateIndex
CREATE INDEX "DisbursementActual_companyId_idx" ON "DisbursementActual"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "DisbursementActual_companyId_yearId_quarter_key" ON "DisbursementActual"("companyId", "yearId", "quarter");

-- AddForeignKey
ALTER TABLE "DisbursementActual" ADD CONSTRAINT "DisbursementActual_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisbursementActual" ADD CONSTRAINT "DisbursementActual_yearId_fkey" FOREIGN KEY ("yearId") REFERENCES "Year"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisbursementActual" ADD CONSTRAINT "DisbursementActual_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
