import type { StreamCategory } from "../api/types";

// Mirrors server/src/utils/streams.ts — the amount columns each stream
// category records, in display order, with their labels. Revenue splits
// Internal/External; Collections splits Internal/External x Earned/
// Unearned/Others; Expenses and Disbursements are a single amount — the same
// splits as the original figures in Data Entry.
export const STREAM_CATEGORIES: StreamCategory[] = ["REVENUE", "COLLECTIONS", "EXPENSES", "DISBURSEMENTS"];

export const STREAM_CATEGORY_LABEL: Record<StreamCategory, string> = {
  REVENUE: "Revenue",
  COLLECTIONS: "Collections",
  EXPENSES: "Expenses",
  DISBURSEMENTS: "Disbursements",
};

export const STREAM_FIELDS: Record<StreamCategory, { key: string; label: string; group?: string }[]> = {
  REVENUE: [
    { key: "revenueInternal", label: "Internal" },
    { key: "revenueExternal", label: "External" },
  ],
  COLLECTIONS: [
    { key: "collectionsInternalEarned", label: "Earned", group: "Internal" },
    { key: "collectionsInternalUnearned", label: "Unearned", group: "Internal" },
    { key: "collectionsInternalOthers", label: "Others", group: "Internal" },
    { key: "collectionsExternalEarned", label: "Earned", group: "External" },
    { key: "collectionsExternalUnearned", label: "Unearned", group: "External" },
    { key: "collectionsExternalOthers", label: "Others", group: "External" },
  ],
  EXPENSES: [{ key: "expenses", label: "Amount" }],
  DISBURSEMENTS: [{ key: "disbursements", label: "Amount" }],
};

// Compact column labels for tables (e.g. "Int. Earned").
export function fieldShortLabel(category: StreamCategory, key: string): string {
  const f = STREAM_FIELDS[category].find((x) => x.key === key);
  if (!f) return key;
  return f.group ? `${f.group === "Internal" ? "Int." : "Ext."} ${f.label}` : f.label;
}
