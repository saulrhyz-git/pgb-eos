// Rollover-aware Rock counting.
//
// POST /api/rocks/rollover carries an incomplete Rock forward by creating a
// copy in the next quarter (copy.rolledFromId = original.id) and marking the
// original ROLLED_OVER. That means one real-world Rock can exist as several
// rows across quarters. For any count/average over a scope:
//
//   - If both the original AND its copy are in scope (e.g. "All Quarters"),
//     only the copy — the latest version — is counted, so a Rock carried
//     Q1 -> Q2 -> Q3 counts once, not three times.
//   - If only the original is in scope (e.g. viewing just Q1, or a Year view
//     where the copy landed in Q1 of the next Year), the original IS
//     counted, under its ROLLED_OVER status — that quarter genuinely had a
//     Rock that slipped.
export function latestRockVersions<T extends { id: string; rolledFromId: string | null }>(rocks: T[]): T[] {
  const superseded = new Set<string>();
  for (const r of rocks) if (r.rolledFromId) superseded.add(r.rolledFromId);
  return rocks.filter((r) => !superseded.has(r.id));
}
