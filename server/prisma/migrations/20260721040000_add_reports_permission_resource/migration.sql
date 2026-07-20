-- Adds REPORTS as a new PermissionResource value — the Reports engine's own
-- coarse access gate, exactly like SCORECARD/AUDIT_LOG before it: a
-- Superadmin/Group Integrator always has access, and a Superadmin can build
-- a Custom Role granting REPORTS view to let anyone else (e.g. a BU
-- Integrator) reach the Reports tab. Must be its own migration, separate
-- from anything that references the new value, per Postgres's
-- ALTER TYPE ... ADD VALUE transaction restriction.
ALTER TYPE "PermissionResource" ADD VALUE 'REPORTS';
