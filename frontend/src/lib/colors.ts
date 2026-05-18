/** Chart color palette — single source of truth */
export const CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-chart-6)",
  "var(--color-chart-7)",
  "var(--color-chart-8)",
  "var(--color-chart-9)",
  "var(--color-chart-10)",
] as const;

/** Raw hex values for canvas/Recharts where CSS vars aren't supported */
export const CHART_COLORS_HEX = [
  "#4ca1af",
  "#c4e0e5",
  "#89f7fe",
  "#66a6ff",
  "#f3a183",
  "#a18cd1",
  "#fbc2eb",
  "#fad0c4",
  "#ff9a9e",
  "#fecfef",
] as const;
