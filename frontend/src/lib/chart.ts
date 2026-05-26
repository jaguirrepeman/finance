import type { CSSProperties } from "react";

/** Unified tooltip style for all Recharts charts */
export const CHART_TOOLTIP_STYLE: CSSProperties = {
  background: "rgba(18, 18, 30, 0.97)",
  border: "1px solid rgba(139, 92, 246, 0.25)",
  borderRadius: 10,
  fontSize: 11,
  color: "hsl(0, 0%, 98%)",
  boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
  padding: "8px 12px",
};

/** Unified tooltip wrapper style (sets z-index so it renders above chart labels) */
export const CHART_TOOLTIP_WRAPPER_STYLE: CSSProperties = {
  zIndex: 9999,
  pointerEvents: "none",
};

/** Standard axis tick props */
export const CHART_AXIS_TICK = {
  fill: "hsl(220, 20%, 70%)",
  fontSize: 10,
} as const;

/** Portfolio display name constant */
export const PORTFOLIO_KEY = "Mi Cartera";

/** Normalize price series to base‑100 for comparison charts */
export function normalizeBase100(
  seriesMap: Record<string, Array<{ date: string; price: number }>>,
): Array<Record<string, number | string>> {
  const allDates = new Set<string>();
  for (const series of Object.values(seriesMap)) {
    for (const p of series) allDates.add(p.date);
  }
  const dates = Array.from(allDates).sort();

  const basePrices: Record<string, number> = {};
  for (const [name, series] of Object.entries(seriesMap)) {
    if (series.length > 0) basePrices[name] = series[0].price;
  }

  return dates.map((date) => {
    const entry: Record<string, number | string> = { date };
    for (const [name, series] of Object.entries(seriesMap)) {
      const pt = series.find((p) => p.date === date);
      if (pt && basePrices[name]) {
        entry[name] = (pt.price / basePrices[name]) * 100;
      }
    }
    return entry;
  });
}

/** Max number of data points to render in a Recharts chart */
export const MAX_CHART_POINTS = 200;

/**
 * Downsample an array by keeping every Nth item plus the last item.
 * Returns the original array if it's already small enough.
 */
export function downsample<T>(data: T[], maxPoints = MAX_CHART_POINTS): T[] {
  if (data.length <= maxPoints) return data;
  const step = Math.ceil(data.length / maxPoints);
  const sampled: T[] = [];
  for (let i = 0; i < data.length; i += step) {
    sampled.push(data[i]);
  }
  // Always include the last point
  if (sampled[sampled.length - 1] !== data[data.length - 1]) {
    sampled.push(data[data.length - 1]);
  }
  return sampled;
}
