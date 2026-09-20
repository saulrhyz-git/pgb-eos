import { prisma } from "../lib/prisma";
import { logAudit } from "./auditLog";
import { quarterDateRange } from "./quarterDates";

// ---------------------------------------------------------------------------
// Rocks auto-status rule.
//
// Each Quarter of a Year can have a manually-set "Quarter End Date" (see
// Year.q1EndDate..q4EndDate in schema.prisma, managed by a Group Integrator/
// Superadmin via PUT /api/years/:id/quarter-end-dates in routes/meta.ts). If
// a Quarter's End Date hasn't been set, this falls back to that Quarter's
// standard calendar end date (Q1 Mar 31, Q2 Jun 30, Q3 Sep 30, Q4 Dec 31 —
// see utils/quarterDates.ts) — so every Rock always has an end date to be
// measured against, custom or not.
//
// From that end date, this computes a suggested/default status from how
// many days remain until it and how far along the Rock's progress is:
//
//   > 15 days away   progress 0%        -> PENDING
//                    progress 1-99%     -> ON_TRACK
//   6-15 days away   progress < 75%     -> AT_RISK
//                    progress >= 75%    -> ON_TRACK
//   0-5 days away     progress < 90%     -> AT_RISK
//   (or overdue)      progress >= 90%    -> ON_TRACK
//   any time          progress = 100%   -> TARGET_MET
//
// Like the staleness check this replaces, this is a *continuously-enforced*
// default, not a one-time transition: this app has no background job
// runner, so it runs inline on every read (GET /api/rocks, the Scorecard,
// Comparison, and Reports) rather than on a schedule — at most one
// page-load stale. A Group Integrator, Superadmin, or the BU Integrator who
// owns that Rock can freely set the Status field to whatever they want
// (including overriding the computed value) — nothing here disables the
// field — but the next read recomputes it again from the rule above, EXCEPT
// once a Rock is TARGET_MET: that status is excluded from recomputation
// entirely, so it's the one status that actually sticks once set (matching
// the last rule above: 100% progress is always Target Met, so there's
// nothing to recompute away from).
const MS_PER_DAY = 1000 * 60 * 60 * 24;

type RockCandidate = {
  id: string;
  quarter: number;
  progressPct: number;
  status: string;
  year: {
    year: number;
    q1EndDate: Date | null;
    q2EndDate: Date | null;
    q3EndDate: Date | null;
    q4EndDate: Date | null;
  };
};

// The custom date if one's been set for this Quarter, otherwise that
// Quarter's standard calendar end date — every Rock resolves to *some* end
// date, so the auto-status rule below always has something to measure
// against.
function endDateForQuarter(year: RockCandidate["year"], quarter: number): Date {
  const custom =
    quarter === 1 ? year.q1EndDate : quarter === 2 ? year.q2EndDate : quarter === 3 ? year.q3EndDate : quarter === 4 ? year.q4EndDate : null;
  return custom ?? quarterDateRange(year.year, quarter).end;
}

// Pure function so the rule itself is unit-testable independent of Prisma.
// `daysRemaining` is rounded UP (Math.ceil) so a Rock still has "1 day
// left" for any part of its last day, rather than flipping to "0 days left"
// (and the more urgent bucket) first thing that morning.
export function computeAutoRockStatus(progressPct: number, endDate: Date, now: Date = new Date()): "PENDING" | "ON_TRACK" | "AT_RISK" | "TARGET_MET" {
  if (progressPct >= 100) return "TARGET_MET";
  if (progressPct <= 0) return "PENDING";

  const daysRemaining = Math.ceil((endDate.getTime() - now.getTime()) / MS_PER_DAY);

  if (daysRemaining > 15) return "ON_TRACK";
  if (daysRemaining >= 6) return progressPct < 75 ? "AT_RISK" : "ON_TRACK";
  // 5 days or fewer, including overdue (daysRemaining <= 0).
  return progressPct < 90 ? "AT_RISK" : "ON_TRACK";
}

// scopeWhere should already narrow to the yearId/company scope the caller is
// reading — mirrors the old escalateStaleRocks signature/call sites (see
// routes/rocks.ts, scorecard.ts, comparison.ts, reports.ts) so none of them
// needed to change. Typed loosely (matches the ad-hoc `where: any` style
// already used throughout those routes) rather than importing
// Prisma.RockWhereInput, since callers build these objects the same way.
export async function escalateStaleRocks(scopeWhere: Record<string, unknown>): Promise<number> {
  const candidates = await prisma.rock.findMany({
    where: { ...scopeWhere, status: { not: "TARGET_MET" } },
    select: {
      id: true,
      quarter: true,
      progressPct: true,
      status: true,
      year: { select: { year: true, q1EndDate: true, q2EndDate: true, q3EndDate: true, q4EndDate: true } },
    },
  });
  if (candidates.length === 0) return 0;

  const now = new Date();
  const changed: { id: string; from: string; to: string }[] = [];

  for (const rock of candidates) {
    const endDate = endDateForQuarter(rock.year, rock.quarter);
    const computed = computeAutoRockStatus(rock.progressPct, endDate, now);
    if (computed !== rock.status) {
      changed.push({ id: rock.id, from: rock.status, to: computed });
    }
  }

  if (changed.length === 0) return 0;

  // Grouped by target status so each gets its own updateMany + a single,
  // readable audit summary rather than one row per Rock.
  const byTarget = new Map<string, string[]>();
  for (const c of changed) {
    const ids = byTarget.get(c.to) ?? [];
    ids.push(c.id);
    byTarget.set(c.to, ids);
  }

  for (const [status, ids] of byTarget) {
    await prisma.rock.updateMany({ where: { id: { in: ids } }, data: { status: status as any } });
  }

  // No authenticated actor triggered this — it's a system rule firing during
  // an otherwise-ordinary read. logAudit accepts `user: null` for exactly
  // this case (see the login-lockout entries in routes/auth.ts).
  await logAudit({
    user: null,
    action: "ROCK_AUTO_STATUS",
    entityType: "Rock",
    summary: `Auto-updated status on ${changed.length} Rock${changed.length === 1 ? "" : "s"} based on Quarter End Date and progress`,
    metadata: { changes: changed },
  });

  return changed.length;
}
