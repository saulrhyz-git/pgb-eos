-- Rock.progressPct: INTEGER -> DOUBLE PRECISION, so progress can be entered
-- to 2 decimal places (e.g. 45.25%) instead of only whole percentages.
-- Existing whole-number values cast cleanly with no data loss.
ALTER TABLE "Rock" ALTER COLUMN "progressPct" TYPE DOUBLE PRECISION USING "progressPct"::double precision;
