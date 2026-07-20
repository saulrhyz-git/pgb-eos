export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

// Abbreviated form for large figures on KPI-style cards (Billions/Millions/
// Thousands), e.g. ₱6,512,700,000.00 -> "₱6.512B". Truncates (rather than
// rounds) to up to 3 decimal places so the shorthand never implies more
// precision than is actually there, then trims trailing zeros — 1.1B stays
// "₱1.1B" rather than "₱1.100B", and 600M stays "₱600M" rather than
// "₱600.000M". Values under 1,000 aren't abbreviated at all; they just fall
// back to the normal 2-decimal formatCurrency() above.
export function formatCurrencyShort(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  const scales: [number, string][] = [
    [1_000_000_000, "B"],
    [1_000_000, "M"],
    [1_000, "K"],
  ];

  for (const [divisor, suffix] of scales) {
    if (abs >= divisor) {
      const truncated = Math.trunc((abs / divisor) * 1000) / 1000;
      const trimmed = truncated.toFixed(3).replace(/\.?0+$/, "");
      return `${sign}₱${trimmed}${suffix}`;
    }
  }

  return formatCurrency(value);
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
