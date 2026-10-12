-- Year wrap-up: soft-lock a whole Year and keep a frozen full-year report.
-- Additive only — four nullable columns, no existing data touched. Every
-- existing Year stays open (wrappedUpAt NULL).
ALTER TABLE "Year" ADD COLUMN "wrappedUpAt" TIMESTAMP(3);
ALTER TABLE "Year" ADD COLUMN "wrappedUpById" TEXT;
ALTER TABLE "Year" ADD COLUMN "wrappedUpByName" TEXT;
ALTER TABLE "Year" ADD COLUMN "wrapUpReport" JSONB;
