import { prisma } from "../lib/prisma";

// ---------------------------------------------------------------------------
// Year wrap-up soft lock.
//
// Once a Year is wrapped up (Year.wrappedUpAt set — see routes/years.ts),
// nothing that belongs to that Year can be changed: Targets, Target Locks,
// Actuals and their remarks, Disbursements, Notes, Rocks (create/edit/delete
// /rollover) and Quarter End Dates. Every one of those write routes calls
// assertYearOpen() inside its existing permission try/catch, so the
// refusal comes back as a normal JSON error the UI already displays.
//
// 423 Locked rather than 403: the user isn't missing a permission, the
// data itself is frozen. Reading is never affected.
// ---------------------------------------------------------------------------
export class YearLockedError extends Error {
  status = 423;
  constructor(year: number) {
    super(`Year ${year} has been wrapped up and is read-only. A Superadmin can reopen it if a correction is needed.`);
  }
}

export async function assertYearOpen(yearId: string): Promise<void> {
  const year = await prisma.year.findUnique({ where: { id: yearId }, select: { year: true, wrappedUpAt: true } });
  if (year?.wrappedUpAt) throw new YearLockedError(year.year);
}

// For admin deletes of a Company or Business Unit, which cascade-delete that
// Company's data across EVERY Year — refuse if any of it sits in a wrapped-up
// Year, since that would quietly change a locked Year's live figures.
export async function assertNoWrappedUpYearData(companyIds: string[]): Promise<void> {
  if (companyIds.length === 0) return;
  const where = { companyId: { in: companyIds }, year: { wrappedUpAt: { not: null } } };
  const hit =
    (await prisma.quarterActual.findFirst({ where, select: { year: { select: { year: true } } } })) ||
    (await prisma.quarterTarget.findFirst({ where, select: { year: { select: { year: true } } } })) ||
    (await prisma.rock.findFirst({ where, select: { year: { select: { year: true } } } })) ||
    (await prisma.disbursementActual.findFirst({ where, select: { year: { select: { year: true } } } }));
  if (hit) {
    const err = new Error(
      `This has data in Year ${hit.year.year}, which has been wrapped up. Deleting it would change that locked Year's figures, so it can't be deleted.`
    );
    (err as any).status = 423;
    throw err;
  }
}
