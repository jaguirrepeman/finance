/** Pre-created formatters — avoid re-creating Intl.NumberFormat on every call */
const _eurFmt = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Format a number as EUR currency */
export function fmtEur(value: number | null | undefined): string {
  if (value == null) return "—";
  return _eurFmt.format(value);
}

/** Format a number as a compact EUR amount (e.g. 12.5K €) */
export function fmtEurCompact(value: number | null | undefined): string {
  if (value == null) return "—";
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M €`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K €`;
  }
  return fmtEur(value);
}

/** Format a number as percentage */
export function fmtPct(
  value: number | null | undefined,
  decimals = 2,
): string {
  if (value == null) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(decimals)}%`;
}

/** Format a number as plain percentage without sign */
export function fmtPctPlain(
  value: number | null | undefined,
  decimals = 1,
): string {
  if (value == null) return "—";
  return `${value.toFixed(decimals)}%`;
}

/** Return Tailwind text color class based on value sign */
export function signColor(value: number | null | undefined): string {
  if (value == null || value === 0) return "text-text-secondary";
  return value > 0 ? "text-success" : "text-danger";
}

/** Return Tailwind text color class for risk/volatility levels */
export function riskColor(value: number): string {
  if (value < 10) return "text-success";
  if (value < 20) return "text-warning";
  return "text-danger";
}

/** Format a date string (ISO) to locale display */
export function fmtDate(
  dateStr: string | null | undefined,
  opts?: Intl.DateTimeFormatOptions,
): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString(
    "es-ES",
    opts ?? { day: "2-digit", month: "short", year: "numeric" },
  );
}

const _numFmtCache = new Map<number, Intl.NumberFormat>();
function _getNumFmt(decimals: number): Intl.NumberFormat {
  let fmt = _numFmtCache.get(decimals);
  if (!fmt) {
    fmt = new Intl.NumberFormat("es-ES", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    _numFmtCache.set(decimals, fmt);
  }
  return fmt;
}

/** Format a number with thousand separators */
export function fmtNum(
  value: number | null | undefined,
  decimals = 2,
): string {
  if (value == null) return "—";
  return _getNumFmt(decimals).format(value);
}
