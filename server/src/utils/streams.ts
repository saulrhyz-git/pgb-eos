import { prisma } from "../lib/prisma";
import { addFigures, emptyFigures, Figures, n, toFigures } from "./aggregate";

// ---------------------------------------------------------------------------
// Financial Streams — roll-up helpers (see FinancialStream in schema.prisma).
//
// Every page that totals Revenue / Collections / Expenses / Disbursements
// builds a `${companyId}:${quarter}` -> figures map from QuarterActual /
// DisbursementActual. addStreamActuals() / addStreamDisbursements() add each
// stream's recorded amounts into those same maps, so streams roll into every
// total, and into the existing per-category view masking, with no other
// change to how those pages compute. A stream actual uses the same column
// names as QuarterActual, so toFigures() reads it directly.
// ---------------------------------------------------------------------------

export type StreamCategory = "REVENUE" | "COLLECTIONS" | "EXPENSES" | "DISBURSEMENTS";
export const STREAM_CATEGORIES: StreamCategory[] = ["REVENUE", "COLLECTIONS", "EXPENSES", "DISBURSEMENTS"];

// The amount columns each category is allowed to use; every other amount
// column on a stream actual is forced to 0.
export const STREAM_AMOUNT_FIELDS: Record<StreamCategory, string[]> = {
  REVENUE: ["revenueInternal", "revenueExternal"],
  COLLECTIONS: [
    "collectionsInternalEarned",
    "collectionsInternalUnearned",
    "collectionsInternalOthers",
    "collectionsExternalEarned",
    "collectionsExternalUnearned",
    "collectionsExternalOthers",
  ],
  EXPENSES: ["expenses"],
  DISBURSEMENTS: ["disbursements"],
};
export const ALL_STREAM_AMOUNT_FIELDS = Object.values(STREAM_AMOUNT_FIELDS).flat();

// The permission resource that governs viewing/entering a category's amounts.
export const STREAM_CATEGORY_RESOURCE = {
  REVENUE: "REVENUE",
  COLLECTIONS: "COLLECTIONS",
  EXPENSES: "EXPENSES",
  DISBURSEMENTS: "DISBURSEMENTS",
} as const;

const key = (companyId: string, quarter: number) => `${companyId}:${quarter}`;

/**
 * Adds every stream actual for these Companies in this Year into `map`
 * (Revenue / Collections / Expenses — Disbursements are handled separately
 * below, since they live in their own map everywhere). Mutates and returns
 * `map`; Companies/quarters with only stream amounts get a new entry.
 */
export async function addStreamActuals(map: Map<string, Figures>, yearId: string, companyIds: string[]): Promise<Map<string, Figures>> {
  if (companyIds.length === 0) return map;
  const rows = await prisma.financialStreamActual.findMany({
    where: { yearId, companyId: { in: companyIds }, stream: { category: { in: ["REVENUE", "COLLECTIONS", "EXPENSES"] } } },
  });
  for (const r of rows) {
    const k = key(r.companyId, r.quarter);
    map.set(k, addFigures(map.get(k) || emptyFigures(), toFigures(r)));
  }
  return map;
}

/**
 * Same as addStreamActuals, for Disbursement streams. Works on any map whose
 * values have an `amount` (DisbursementFigures).
 */
export async function addStreamDisbursements<T extends { amount: number }>(
  map: Map<string, T>,
  yearId: string,
  companyIds: string[],
  empty: () => T
): Promise<Map<string, T>> {
  if (companyIds.length === 0) return map;
  const rows = await prisma.financialStreamActual.findMany({
    where: { yearId, companyId: { in: companyIds }, stream: { category: "DISBURSEMENTS" } },
    select: { companyId: true, quarter: true, disbursements: true },
  });
  for (const r of rows) {
    const k = key(r.companyId, r.quarter);
    const cur = map.get(k) || empty();
    map.set(k, { ...cur, amount: cur.amount + n(r.disbursements) });
  }
  return map;
}

/** The single amount a stream actual contributes to its category's total. */
export function streamActualTotal(category: StreamCategory, row: Record<string, any>): number {
  return STREAM_AMOUNT_FIELDS[category].reduce((sum, f) => sum + n(row[f]), 0);
}

// ---------- Breakdown ----------

export interface StreamBreakdownLine {
  streamId: string | null; // null = the original (unlabeled) figures
  label: string;
  scope: "BASE" | "BUSINESS_UNIT" | "COMPANY";
  scopeName: string;
  active: boolean;
  // Category split, same keys as the stream's amount columns.
  parts: Record<string, number>;
  total: number;
}

export interface StreamBreakdown {
  category: StreamCategory;
  total: number;
  lines: StreamBreakdownLine[];
}

/**
 * Per-category breakdown of a scope's total into "Original figures" plus one
 * line per stream, summed over `companyIds` and `quarters`. The caller passes
 * only the Companies the viewer may see for each category (`companyIdsByCategory`),
 * so the breakdown is masked exactly like the totals it explains.
 */
export async function buildStreamBreakdown(params: {
  yearId: string;
  quarters: number[];
  companyIdsByCategory: Record<StreamCategory, string[]>;
}): Promise<StreamBreakdown[]> {
  const { yearId, quarters } = params;
  const allIds = Array.from(new Set(Object.values(params.companyIdsByCategory).flat()));
  if (allIds.length === 0) return STREAM_CATEGORIES.map((category) => ({ category, total: 0, lines: [] }));

  const [baseActuals, baseDisb, streamRows] = await Promise.all([
    prisma.quarterActual.findMany({ where: { yearId, quarter: { in: quarters }, companyId: { in: allIds } } }),
    prisma.disbursementActual.findMany({ where: { yearId, quarter: { in: quarters }, companyId: { in: allIds } } }),
    prisma.financialStreamActual.findMany({
      where: { yearId, quarter: { in: quarters }, companyId: { in: allIds } },
      include: {
        stream: {
          select: {
            id: true,
            label: true,
            category: true,
            active: true,
            sortOrder: true,
            businessUnit: { select: { name: true } },
            company: { select: { name: true } },
          },
        },
      },
    }),
  ]);

  return STREAM_CATEGORIES.map((category) => {
    const allowed = new Set(params.companyIdsByCategory[category]);
    const fields = STREAM_AMOUNT_FIELDS[category];

    // Original figures — disbursements' single column is `amount` on
    // DisbursementActual; everything else uses the same names as Figures.
    const baseParts: Record<string, number> = Object.fromEntries(fields.map((f) => [f, 0]));
    if (category === "DISBURSEMENTS") {
      for (const d of baseDisb) if (allowed.has(d.companyId)) baseParts.disbursements += n(d.amount);
    } else {
      for (const a of baseActuals) {
        if (!allowed.has(a.companyId)) continue;
        for (const f of fields) baseParts[f] += n((a as any)[f]);
      }
    }

    const byStream = new Map<string, StreamBreakdownLine & { sortOrder: number }>();
    for (const r of streamRows) {
      if (r.stream.category !== category || !allowed.has(r.companyId)) continue;
      let line = byStream.get(r.stream.id);
      if (!line) {
        line = {
          streamId: r.stream.id,
          label: r.stream.label,
          scope: r.stream.company ? "COMPANY" : "BUSINESS_UNIT",
          scopeName: r.stream.company?.name || r.stream.businessUnit?.name || "",
          active: r.stream.active,
          parts: Object.fromEntries(fields.map((f) => [f, 0])),
          total: 0,
          sortOrder: r.stream.sortOrder,
        };
        byStream.set(r.stream.id, line);
      }
      for (const f of fields) line.parts[f] += n((r as any)[f]);
    }

    const streamLines = [...byStream.values()]
      .map(({ sortOrder, ...l }) => ({ ...l, total: Object.values(l.parts).reduce((s, v) => s + v, 0), sortOrder }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
      .map(({ sortOrder, ...l }) => l);

    const base: StreamBreakdownLine = {
      streamId: null,
      label: "Original figures",
      scope: "BASE",
      scopeName: "",
      active: true,
      parts: baseParts,
      total: Object.values(baseParts).reduce((s, v) => s + v, 0),
    };
    const lines = [base, ...streamLines];
    return { category, total: lines.reduce((s, l) => s + l.total, 0), lines };
  });
}
