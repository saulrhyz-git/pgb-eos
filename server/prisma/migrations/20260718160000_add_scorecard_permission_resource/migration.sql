-- Adds SCORECARD as a new value of the PermissionResource enum, so a Custom
-- Role's tickbox matrix can gate access to the new Executive Scorecard page
-- the same way it already gates Targets/Revenue/Collections/Expenses/Rocks.
-- Purely additive — no existing rows change.

ALTER TYPE "PermissionResource" ADD VALUE 'SCORECARD';
