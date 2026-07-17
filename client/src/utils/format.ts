export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function attainmentColor(pct: number): string {
  if (pct >= 100) return "text-emerald-600";
  if (pct >= 85) return "text-amber-600";
  return "text-red-600";
}

export function attainmentBg(pct: number): string {
  if (pct >= 100) return "bg-emerald-50 border-emerald-200";
  if (pct >= 85) return "bg-amber-50 border-amber-200";
  return "bg-red-50 border-red-200";
}
