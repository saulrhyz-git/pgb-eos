import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import {
  assertBusinessUnitAccess,
  blockPendingPasswordChange,
  loadUserPermissions,
  requireAuth,
  resolveCompanyBusinessUnit,
  scopedBusinessUnitFilter,
} from "../middleware/auth";
import { assertPermission, can } from "../utils/permissions";
import { currentCalendarQuarter } from "../utils/quarterDates";

const router = Router();
router.use(requireAuth);
router.use(blockPendingPasswordChange);

const figuresSchema = z.object({
  revenueInternal: z.number().min(0).default(0),
  revenueExternal: z.number().min(0).default(0),
  collectionsInternal: z.number().min(0).default(0),
  collectionsExternal: z.number().min(0).default(0),
  expensesInternal: z.number().min(0).default(0),
  expensesExternal: z.number().min(0).default(0),
});

const FIGURE_KEYS = [
  "revenueInternal",
  "revenueExternal",
  "collectionsInternal",
  "collectionsExternal",
  "expensesInternal",
  "expensesExternal",
] as const;
type FigureKey = (typeof FIGURE_KEYS)[number];
type Figures = Record<FigureKey, number>;

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function toFigures(row: any): Figures {
  const out = {} as Figures;
  for (const key of FIGURE_KEYS) out[key] = Number(row?.[key] ?? 0);
  return out;
}

// A Quarter is editable if it's the real current calendar quarter or a
// future one — once the real calendar has moved past it, it's locked
// (read-only) forever. Applies only to Targets, not Actuals.
function isQuarterEditable(year: number, quarter: number): boolean {
  const { year: curYear, quarter: curQuarter } = currentCalendarQuarter();
  if (year !== curYear) return year > curYear;
  return quarter >= curQuarter;
}

// Splits `total` into `n` non-negative parts that sum to exactly `total`
// (to the cent) — used both for the initial Annual -> Quarters equal split
// and to redistribute a delta across the quarters after an edited one.
function splitEvenly(total: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor((total / n) * 100) / 100;
  const parts = new Array(n).fill(base);
  const allocated = round2(base * (n - 1));
  parts[n - 1] = round2(total - allocated);
  return parts;
}

// Distributes `adjustment` (the total amount to add — may be negative)
// across `currentValues` (existing values for a run of quarters, in
// chronological order), returning the new values. Each result is clamped at
// >= 0; if a negative adjustment can't be fully absorbed by one quarter
// (it's already at/near 0), the unabsorbed remainder cascades forward to
// the next quarter(s) in the run rather than going negative. If it still
// can't be fully absorbed by the end of the run, the shortfall is simply
// dropped (the implied annual total shrinks) rather than blocking the edit.
function distributeAdjustment(currentValues: number[], adjustment: number): number[] {
  const n = currentValues.length;
  const result = currentValues.slice();
  if (n === 0) return result;
  let remaining = round2(adjustment);
  for (let i = 0; i < n && remaining !== 0; i++) {
    const quartersLeft = n - i;
    const share = round2(remaining / quartersLeft);
    const proposed = round2(result[i] + share);
    const applied = proposed < 0 ? round2(-result[i]) : share;
    result[i] = round2(result[i] + applied);
    remaining = round2(remaining - applied);
  }
  return result;
}

// ---------- Quarter Targets ----------
// Targets are set once per Company per Year+Quarter (Group Integrator /
// Superadmin, or a BU Integrator scoped to their own assigned Business
// Unit(s)). There is no separately-*stored* Annual Target — it's still
// always the sum of a Company's/Business Unit's Q1-Q4 QuarterTarget rows,
// computed on the fly in routes/dashboard.ts. But Annual Target can be
// *entered* via PUT /annual below as a convenience: it splits the amount
// evenly across the Year's editable Quarters, and every Quarter edit
// (whether it came from that split or a direct PUT /quarter) preserves
// whatever the annual sum was immediately before the edit by redistributing
// the delta across that Company's *subsequent* Quarters of the same Year
// (never prior ones) — see distributeAdjustment above. Once the real
// calendar has moved past a Quarter, it's locked and can no longer be
// edited directly or via redistribution (see isQuarterEditable).

router.get("/quarter", async (req, res) => {
  const { yearId, quarter, businessUnitId, companyId } = req.query as Record<string, string | undefined>;
  if (!yearId) return res.status(400).json({ error: "yearId is required" });

  const user = req.user!;
  const permRows = await loadUserPermissions(user);

  try {
    if (companyId) {
      const buId = await resolveCompanyBusinessUnit(companyId);
      assertBusinessUnitAccess(user, buId);
      if (permRows.length) assertPermission(permRows, "view", "TARGETS", { businessUnitId: buId, companyId });
    }
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  const where: any = { yearId };
  if (quarter) where.quarter = Number(quarter);

  if (companyId) {
    where.companyId = companyId;
  } else {
    let buFilter: string | { in: string[] } | undefined;
    try {
      buFilter = scopedBusinessUnitFilter(user, businessUnitId);
    } catch (err: any) {
      return res.status(err.status || 500).json({ error: err.message });
    }

    if (permRows.length) {
      // A Custom Role narrows visibility further, down to only the
      // Companies it grants TARGETS view on (Company-level rows take
      // precedence over a Business-Unit-level grant for the same resource).
      const companyWhere: any = {};
      if (buFilter) companyWhere.businessUnitId = buFilter;
      const candidates = await prisma.company.findMany({ where: companyWhere, select: { id: true, businessUnitId: true } });
      const permittedIds = candidates
        .filter((c) => can(permRows, "view", "TARGETS", { businessUnitId: c.businessUnitId, companyId: c.id }))
        .map((c) => c.id);
      where.companyId = { in: permittedIds };
    } else if (buFilter) {
      where.company = { businessUnitId: buFilter };
    }
  }

  const targets = await prisma.quarterTarget.findMany({
    where,
    include: { company: { select: { id: true, name: true, businessUnitId: true } } },
    orderBy: { quarter: "asc" },
  });
  res.json(targets);
});

router.put("/quarter", async (req, res) => {
  const parsed = z
    .object({ companyId: z.string().uuid(), yearId: z.string().uuid(), quarter: z.number().int().min(1).max(4) })
    .merge(figuresSchema)
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid quarter target payload", details: parsed.error.issues });

  try {
    const businessUnitId = await resolveCompanyBusinessUnit(parsed.data.companyId);
    assertBusinessUnitAccess(req.user!, businessUnitId);
    const permRows = await loadUserPermissions(req.user!);
    if (permRows.length) assertPermission(permRows, "edit", "TARGETS", { businessUnitId, companyId: parsed.data.companyId });
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  const { companyId, yearId, quarter, ...figures } = parsed.data;

  const yearRow = await prisma.year.findUnique({ where: { id: yearId }, select: { year: true } });
  if (!yearRow) return res.status(404).json({ error: "Year not found" });
  if (!isQuarterEditable(yearRow.year, quarter)) {
    return res.status(403).json({ error: "This quarter has already passed and can no longer be edited" });
  }

  const target = await prisma.$transaction(async (tx) => {
    const existing = await tx.quarterTarget.findUnique({
      where: { companyId_yearId_quarter: { companyId, yearId, quarter } },
    });
    const oldFigures = toFigures(existing);

    const updated = await tx.quarterTarget.upsert({
      where: { companyId_yearId_quarter: { companyId, yearId, quarter } },
      update: figures,
      create: { companyId, yearId, quarter, ...figures },
    });

    // Cascade: keep the Company's Q1-Q4 sum for this Year exactly what it
    // was right before this edit by redistributing the delta across the
    // *subsequent* quarters only (Q4 has none to cascade into).
    const subsequentQuarters: number[] = [];
    for (let q = quarter + 1; q <= 4; q++) subsequentQuarters.push(q);

    if (subsequentQuarters.length) {
      const subsequentRows = await tx.quarterTarget.findMany({
        where: { companyId, yearId, quarter: { in: subsequentQuarters } },
      });
      const rowByQuarter = new Map(subsequentRows.map((r) => [r.quarter, r]));

      for (const key of FIGURE_KEYS) {
        const delta = round2(Number((figures as Figures)[key]) - oldFigures[key]);
        if (delta === 0) continue;
        const currentValues = subsequentQuarters.map((q) => Number(rowByQuarter.get(q)?.[key] ?? 0));
        const newValues = distributeAdjustment(currentValues, -delta);
        for (let i = 0; i < subsequentQuarters.length; i++) {
          if (newValues[i] === currentValues[i]) continue;
          const q = subsequentQuarters[i];
          await tx.quarterTarget.upsert({
            where: { companyId_yearId_quarter: { companyId, yearId, quarter: q } },
            update: { [key]: newValues[i] },
            create: { companyId, yearId, quarter: q, [key]: newValues[i] } as any,
          });
        }
      }
    }

    return updated;
  });

  res.json(target);
});

router.put("/annual", async (req, res) => {
  const parsed = z
    .object({ companyId: z.string().uuid(), yearId: z.string().uuid() })
    .merge(figuresSchema)
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid annual target payload", details: parsed.error.issues });

  try {
    const businessUnitId = await resolveCompanyBusinessUnit(parsed.data.companyId);
    assertBusinessUnitAccess(req.user!, businessUnitId);
    const permRows = await loadUserPermissions(req.user!);
    if (permRows.length) assertPermission(permRows, "edit", "TARGETS", { businessUnitId, companyId: parsed.data.companyId });
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  const { companyId, yearId, ...annualFigures } = parsed.data;

  const yearRow = await prisma.year.findUnique({ where: { id: yearId }, select: { year: true } });
  if (!yearRow) return res.status(404).json({ error: "Year not found" });

  const editableQuarters = [1, 2, 3, 4].filter((q) => isQuarterEditable(yearRow.year, q));
  const lockedQuarters = [1, 2, 3, 4].filter((q) => !editableQuarters.includes(q));
  if (editableQuarters.length === 0) {
    return res.status(400).json({ error: "This Year has no editable quarters remaining — every quarter is in the past" });
  }

  const existingRows = await prisma.quarterTarget.findMany({ where: { companyId, yearId } });
  const rowByQuarter = new Map(existingRows.map((r) => [r.quarter, r]));

  // Build up each editable quarter's new Figures one field at a time: the
  // amount left over after subtracting whatever's already locked into past
  // quarters, split evenly across the remaining (editable) quarters. If the
  // locked quarters alone already exceed the requested annual figure, the
  // editable quarters are best-effort set to 0 for that field rather than
  // going negative — the resulting annual sum will simply be lower than
  // requested.
  const quarterFigures = new Map<number, Partial<Figures>>(editableQuarters.map((q) => [q, {}]));
  for (const key of FIGURE_KEYS) {
    const lockedSum = lockedQuarters.reduce((sum, q) => sum + Number(rowByQuarter.get(q)?.[key] ?? 0), 0);
    const remaining = Math.max(round2(Number((annualFigures as Figures)[key]) - lockedSum), 0);
    const values = splitEvenly(remaining, editableQuarters.length);
    editableQuarters.forEach((q, i) => {
      quarterFigures.get(q)![key] = values[i];
    });
  }

  const results = await prisma.$transaction(
    editableQuarters.map((q) =>
      prisma.quarterTarget.upsert({
        where: { companyId_yearId_quarter: { companyId, yearId, quarter: q } },
        update: quarterFigures.get(q) as Figures,
        create: { companyId, yearId, quarter: q, ...(quarterFigures.get(q) as Figures) },
      })
    )
  );

  res.json({ updated: results, lockedQuarters });
});

export default router;
