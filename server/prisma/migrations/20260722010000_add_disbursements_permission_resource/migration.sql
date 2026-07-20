-- Adds DISBURSEMENTS as a new PermissionResource value — a single combined
-- access gate covering all three Disbursement sub-categories (Advances,
-- Loans, Interests) together, the same granularity as ROCKS (not split
-- into three separate resources the way REVENUE/COLLECTIONS/EXPENSES are).
-- Must be its own migration, separate from anything that references the
-- new value, per Postgres's ALTER TYPE ... ADD VALUE transaction
-- restriction.
ALTER TYPE "PermissionResource" ADD VALUE 'DISBURSEMENTS';
