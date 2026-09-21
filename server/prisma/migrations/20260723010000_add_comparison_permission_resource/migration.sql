-- Adds COMPARISON to the PermissionResource enum, gating the new side-by-side
-- Comparison tab (see routes/comparison.ts). Must be its own migration:
-- Postgres forbids using a newly added enum value in the same transaction
-- that adds it.
ALTER TYPE "PermissionResource" ADD VALUE 'COMPARISON';
