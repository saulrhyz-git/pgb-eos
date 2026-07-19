import { prisma } from "../lib/prisma";
import { AuthUser } from "../middleware/auth";

// Writes one append-only AuditLog row. Deliberately swallows its own errors
// (logging them to the server console) rather than throwing — an audit log
// write failing should never take down the actual request that triggered
// it. `action`/`entityType` are free-text by convention (not enums) so new
// kinds can be added anywhere without a schema migration; keep them
// SCREAMING_SNAKE_CASE and prefixed by entity (e.g. "USER_CREATE",
// "ROCK_ROLLOVER") so the Audit Log page's filters stay predictable.
export async function logAudit(params: {
  // Accepts a full AuthUser (the normal case — the authenticated actor who
  // triggered the action) or just the id/name/email of the User record the
  // entry is about, for the rare case there's no authenticated actor at all
  // (e.g. a failed/locked login attempt, where credentials never validated
  // into a real session, but the log should still say whose account it was).
  user: Pick<AuthUser, "id" | "name" | "email"> | null | undefined;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.user?.id ?? null,
        userName: params.user?.name ?? "",
        userEmail: params.user?.email ?? "",
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId ?? null,
        summary: params.summary,
        metadata: params.metadata ?? undefined,
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Failed to write audit log entry:", err);
  }
}
