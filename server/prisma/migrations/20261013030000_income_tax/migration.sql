-- Quarterly income tax per Company, entered on Data Entry and used by the
-- NIAT tab. Additive only: one new role-matrix value and one new, empty
-- table. No existing data is touched.
ALTER TYPE "PermissionResource" ADD VALUE 'INCOME_TAX';

CREATE TABLE "IncomeTax" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "yearId" TEXT NOT NULL,
    "quarter" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "remarks" TEXT NOT NULL DEFAULT '',
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncomeTax_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IncomeTax_companyId_yearId_quarter_key" ON "IncomeTax"("companyId", "yearId", "quarter");
CREATE INDEX "IncomeTax_yearId_quarter_idx" ON "IncomeTax"("yearId", "quarter");

ALTER TABLE "IncomeTax" ADD CONSTRAINT "IncomeTax_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IncomeTax" ADD CONSTRAINT "IncomeTax_yearId_fkey" FOREIGN KEY ("yearId") REFERENCES "Year"("id") ON DELETE CASCADE ON UPDATE CASCADE;
