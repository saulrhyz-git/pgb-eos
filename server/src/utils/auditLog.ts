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
  user: AuthUser | null | undefined;
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
