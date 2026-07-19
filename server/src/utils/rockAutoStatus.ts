import { prisma } from "../lib/prisma";
import { quarterDateRange } from "./quarterDates";
import { logAudit } from "./auditLog";

// A Rock that's still PENDING or ON_TRACK once its own Quarter is more than
// this many days old is quietly falling behind — auto-flag it AT_RISK so it
// surfaces in the Rocks table and the Scorecard's "Needs Attention" list
// without anyone needing to remember to check on it. This app has no
// background job runner, so the check runs inline on every read (GET
// /api/rocks and GET /api/scorecard) instead of on a schedule — at most one
// page-load stale, which is good enough for a status nudge like this.
//
// This is a continuously-enforced rule, not a one-time transition: a Group
// Integrator/BU Integrator can still freely re-edit the status afterward
// (nothing here disables the field), but as long as the Rock stays
// incomplete past the threshold, the next read re-asserts AT_RISK — that's
// the point of the flag (an ongoing "this is overdue" signal), not a nudge
// that quietly goes stale itself the moment someone glances past it.
// Manually setting a Rock to TARGET_MET is the one thing that actually
// clears it, since TARGET_MET is excluded from the check entirely.
const STALE_THRESHOLD_DAYS = 60;

// scopeWhere should already narrow to the yearId/company scope the caller is
// reading — this only adds the status-eligibility and quarter-age filtering
// on top. Typed loosely (matches the ad-hoc `where: any` style already used
// throughout routes/rocks.ts and routes/scorecard.ts) rather than importing
// Prisma.RockWhereInput, since callers build these objects the same way.
export async function escalateStaleRocks(scopeWhere: Record<string, unknown>): Promise<number> {
  const candidates = await prisma.rock.findMany({
    where: { ...scopeWhere, status: { in: ["PENDING", "ON_TRACK"] } },
    select: { id: true, quarter: true, year: { select: { year: true } } },
  });
  if (candidates.length === 0) return 0;

  const now = Date.now();
  const msPerDay = 1000 * 60 * 60 * 24;
  const staleIds = candidates
    .filter((r) => {
      const { start } = quarterDateRange(r.year.year, r.quarter);
      const daysIn = (now - start.getTime()) / msPerDay;
      return daysIn > STALE_THRESHOLD_DAYS;
    })
    .map((r) => r.id);

  if (staleIds.length === 0) return 0;

  await prisma.rock.updateMany({ where: { id: { in: staleIds } }, data: { status: "AT_RISK" } });

  // No authenticated actor triggered this — it's a system rule firing during
  // an otherwise-ordinary read. logAudit accepts `user: null` for exactly
  // this case (see the login-lockout entries in routes/auth.ts).
  await logAudit({
    user: null,
    action: "ROCK_AUTO_AT_RISK",
    entityType: "Rock",
    summary: `Auto-flagged ${staleIds.length} Rock${staleIds.length === 1 ? "" : "s"} At Risk (still incomplete more than ${STALE_THRESHOLD_DAYS} days into their quarter)`,
    metadata: { rockIds: staleIds, thresholdDays: STALE_THRESHOLD_DAYS },
  });

  return staleIds.length;
}
