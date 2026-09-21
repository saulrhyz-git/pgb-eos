-- Adds REVENUE and COLLECTION to NoteCategoryType, and the RevenueNote /
-- CollectionNote tables — the same "notable line items" record-keeping
-- facility ExpenseNote/DisbursementNote already provide, now available for
-- all four Financials categories. No seeded default categories for these
-- two (unlike Expense/Disbursement's original migration) — a Superadmin
-- adds whatever categories fit under Admin -> Note Categories.

ALTER TYPE "NoteCategoryType" ADD VALUE 'REVENUE';
ALTER TYPE "NoteCategoryType" ADD VALUE 'COLLECTION';

CREATE TABLE "RevenueNote" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "yearId" TEXT NOT NULL,
    "quarter" INTEGER NOT NULL,
    "categoryId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "remarks" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RevenueNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RevenueNote_companyId_yearId_quarter_idx" ON "RevenueNote"("companyId", "yearId", "quarter");
CREATE INDEX "RevenueNote_categoryId_idx" ON "RevenueNote"("categoryId");

ALTER TABLE "RevenueNote" ADD CONSTRAINT "RevenueNote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RevenueNote" ADD CONSTRAINT "RevenueNote_yearId_fkey" FOREIGN KEY ("yearId") REFERENCES "Year"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RevenueNote" ADD CONSTRAINT "RevenueNote_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "NoteCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "CollectionNote" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "yearId" TEXT NOT NULL,
    "quarter" INTEGER NOT NULL,
    "categoryId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "remarks" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectionNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CollectionNote_companyId_yearId_quarter_idx" ON "CollectionNote"("companyId", "yearId", "quarter");
CREATE INDEX "CollectionNote_categoryId_idx" ON "CollectionNote"("categoryId");

ALTER TABLE "CollectionNote" ADD CONSTRAINT "CollectionNote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollectionNote" ADD CONSTRAINT "CollectionNote_yearId_fkey" FOREIGN KEY ("yearId") REFERENCES "Year"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollectionNote" ADD CONSTRAINT "CollectionNote_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "NoteCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
