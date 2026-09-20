-- Manual per-Quarter deadlines on Year, used by the Rocks auto-status rule.
-- All nullable: an unset Quarter simply opts that Quarter's Rocks out of
-- the auto-status calculation (see utils/rockAutoStatus.ts).
ALTER TABLE "Year" ADD COLUMN "q1EndDate" TIMESTAMP(3);
ALTER TABLE "Year" ADD COLUMN "q2EndDate" TIMESTAMP(3);
ALTER TABLE "Year" ADD COLUMN "q3EndDate" TIMESTAMP(3);
ALTER TABLE "Year" ADD COLUMN "q4EndDate" TIMESTAMP(3);
