-- Annual Target is no longer a separately-entered/stored value — it is now
-- purely computed on the fly as the sum of a Company's (or Business Unit's)
-- QuarterTarget rows across Q1-Q4. Drop the AnnualTarget table entirely,
-- including its lock/unlock feature which no longer applies to anything.
--
-- Any previously entered Annual Target data (and its locked flag) is lost —
-- consistent with this project's pre-launch/disposable-data convention.
-- QuarterTarget and QuarterActual are untouched.

DROP TABLE IF EXISTS "AnnualTarget" CASCADE;
