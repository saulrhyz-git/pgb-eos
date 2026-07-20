import { ArrowUpDown } from "lucide-react";

// Generic clickable <th> for tables with client-side sorting — clicking
// toggles that column as the active sort key (asc/desc handled by the
// caller). Mirrors the look of the sort headers already used on the
// Executive Scorecard's per-Business-Unit tables, pulled out here so
// Rocks.tsx and Reports.tsx (any table with more than a handful of rows)
// can share the exact same clickable-header treatment instead of each
// re-implementing it.
export default function SortableTh<K extends string>({
  label,
  sortKey,
  activeKey,
  dir,
  onClick,
  align = "left",
}: {
  label: string;
  sortKey: K;
  activeKey: K;
  dir: "asc" | "desc";
  onClick: (key: K) => void;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`cursor-pointer select-none px-4 py-3 hover:text-slate-700 ${align === "right" ? "text-right" : "text-left"}`}
      onClick={() => onClick(sortKey)}
    >
      <span className={`inline-flex items-center gap-1 ${align === "right" ? "flex-row-reverse" : ""}`}>
        {label}
        <ArrowUpDown className={`h-3 w-3 ${activeKey === sortKey ? "text-brand-600" : "text-slate-300"}`} />
        {activeKey === sortKey && <span className="text-[10px] text-brand-600">{dir === "asc" ? "↑" : "↓"}</span>}
      </span>
    </th>
  );
}
