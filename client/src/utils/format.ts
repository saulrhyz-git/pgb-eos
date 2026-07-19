export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

// Rock progress is entered to up to 2 decimal places (e.g. 45.25%), but most
// values are whole numbers — round to 2dp and trim trailing zeros so "45%"
// doesn't render as "45.00%" while "45.25%" still shows in full.
export function formatProgressPct(value: number): string {
  return `${parseFloat(value.toFixed(2))}%`;
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
