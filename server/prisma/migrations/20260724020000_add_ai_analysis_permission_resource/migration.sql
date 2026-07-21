-- Adds AI_ANALYSIS as a new PermissionResource value, gating the AI
-- Analysis feature (Admin-configured Google Gemini executive-summary
-- generator). Default access is SUPERADMIN only; a non-superadmin needs a
-- Custom Role that explicitly grants AI_ANALYSIS view, same pattern as
-- AUDIT_LOG. Must be its own migration, separate from anything that
-- references the new value, per Postgres's ALTER TYPE ... ADD VALUE
-- transaction restriction.
ALTER TYPE "PermissionResource" ADD VALUE 'AI_ANALYSIS';
