-- Adds AUDIT_LOG as a new value of the PermissionResource enum, so a Custom
-- Role's tickbox matrix can gate access to the new Audit Log page the same
-- way it already gates Targets/Revenue/Collections/Expenses/Rocks/Scorecard.
-- Purely additive — no existing rows change. Kept in its own migration file
-- (rather than combined with the AuditLog table below) because Postgres
-- disallows using a freshly-added enum value within the same transaction it
-- was added in.
ALTER TYPE "PermissionResource" ADD VALUE 'AUDIT_LOG';
