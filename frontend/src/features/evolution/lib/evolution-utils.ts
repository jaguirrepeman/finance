/* ── Evolution tab utility functions ────────────────────────────── */

/** Time filter options */
export const TIMEFRAMES = [
  { key: "1M", label: "1M", months: 1 },
  { key: "3M", label: "3M", months: 3 },
  { key: "YTD", label: "YTD", months: 0 },
  { key: "1Y", label: "1A", months: 12 },
  { key: "3Y", label: "3A", months: 36 },
  { key: "5Y", label: "5A", months: 60 },
  { key: "10Y", label: "10A", months: 120 },
  { key: "MAX", label: "MAX", months: -1 },
] as const;

/** Apply timeframe filter to a date series */
export function filterByTimeframe(
  dates: string[],
  timeframe: string,
  customRange?: { from: string; to: string },
): { start: Date; end: Date } {
  const sorted = [...dates].sort();
  const first = new Date(sorted[0]);
  const last = new Date(sorted[sorted.length - 1]);

  if (customRange?.from && customRange?.to) {
    return { start: new Date(customRange.from), end: new Date(customRange.to) };
  }

  const tf = TIMEFRAMES.find((t) => t.key === timeframe);
  if (!tf || tf.months === -1) {
    return { start: first, end: last };
  }

  if (tf.key === "YTD") {
    return { start: new Date(last.getFullYear(), 0, 1), end: last };
  }

  const start = new Date(last);
  start.setMonth(start.getMonth() - tf.months);
  return { start, end: last };
}

/** Normalize prices to base-100 (% change) */
export function normalize(
  series: Array<{ date: string; price: number }>,
  start: Date,
  end: Date,
): Array<{ date: string; value: number }> {
  const filtered = series.filter((p) => {
    const d = new Date(p.date);
    return d >= start && d <= end;
  });
  if (!filtered.length) return [];

  const base = filtered[0].price;
  if (base === 0) return [];

  return filtered.map((p) => ({
    date: p.date,
    value: ((p.price / base) - 1) * 100,
  }));
}

/** Compute fund metrics for a given period */
export function computeFundMetrics(
  series: Array<{ date: string; price: number }>,
  start: Date,
  end: Date,
  benchSeries?: Array<{ date: string; price: number }>,
) {
  const filtered = series.filter((p) => {
    const d = new Date(p.date);
    return d >= start && d <= end;
  });

  if (filtered.length < 2) return null;

  const first = filtered[0].price;
  const last = filtered[filtered.length - 1].price;
  const days =
    (new Date(filtered[filtered.length - 1].date).getTime() -
      new Date(filtered[0].date).getTime()) /
    86_400_000;

  const totalReturn = ((last / first) - 1) * 100;
  const annReturn =
    days > 30 ? (Math.pow(last / first, 365 / days) - 1) * 100 : totalReturn;

  // Daily log returns
  const logReturns: number[] = [];
  for (let i = 1; i < filtered.length; i++) {
    if (filtered[i - 1].price > 0) {
      logReturns.push(Math.log(filtered[i].price / filtered[i - 1].price));
    }
  }

  // Volatility (annualized)
  const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
  const variance =
    logReturns.reduce((s, r) => s + (r - mean) ** 2, 0) /
    (logReturns.length - 1);
  const vol = Math.sqrt(variance) * Math.sqrt(252) * 100;

  const sharpe = vol > 0 ? annReturn / vol : 0;

  // Max drawdown
  let peak = filtered[0].price;
  let maxDD = 0;
  for (const p of filtered) {
    if (p.price > peak) peak = p.price;
    const dd = ((peak - p.price) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
  }

  // Alpha & Beta vs benchmark
  let alpha: number | null = null;
  let beta: number | null = null;

  if (benchSeries) {
    const benchFiltered = benchSeries.filter((p) => {
      const d = new Date(p.date);
      return d >= start && d <= end;
    });

    if (benchFiltered.length >= 20) {
      const benchMap = new Map(benchFiltered.map((p) => [p.date, p]));
      const fundMap = new Map(filtered.map((p) => [p.date, p]));

      const commonDates = [...fundMap.keys()].filter((d) => benchMap.has(d));

      if (commonDates.length >= 20) {
        const fundReturns: number[] = [];
        const benchReturns: number[] = [];

        commonDates.sort();
        for (let i = 1; i < commonDates.length; i++) {
          const fd = fundMap.get(commonDates[i])!.price;
          const fp = fundMap.get(commonDates[i - 1])!.price;
          const bd = benchMap.get(commonDates[i])!.price;
          const bp = benchMap.get(commonDates[i - 1])!.price;
          if (fp > 0 && bp > 0) {
            fundReturns.push(Math.log(fd / fp));
            benchReturns.push(Math.log(bd / bp));
          }
        }

        if (fundReturns.length >= 20) {
          const mf =
            fundReturns.reduce((a, b) => a + b, 0) / fundReturns.length;
          const mb =
            benchReturns.reduce((a, b) => a + b, 0) / benchReturns.length;

          let cov = 0;
          let varB = 0;
          for (let i = 0; i < fundReturns.length; i++) {
            cov += (fundReturns[i] - mf) * (benchReturns[i] - mb);
            varB += (benchReturns[i] - mb) ** 2;
          }

          if (varB > 0) {
            beta = cov / varB;
            // Benchmark CAGR
            const bFirst = benchFiltered[0].price;
            const bLast = benchFiltered[benchFiltered.length - 1].price;
            const bDays =
              (new Date(
                benchFiltered[benchFiltered.length - 1].date,
              ).getTime() -
                new Date(benchFiltered[0].date).getTime()) /
              86_400_000;
            const benchCagr =
              bDays > 30
                ? (Math.pow(bLast / bFirst, 365 / bDays) - 1) * 100
                : ((bLast / bFirst) - 1) * 100;
            alpha = annReturn - beta * benchCagr;
          }
        }
      }
    }
  }

  return {
    totalReturn,
    annReturn,
    vol,
    sharpe,
    maxDD: -maxDD,
    alpha,
    beta,
  };
}

/**
 * Compute Pearson correlation matrix client-side using DAILY log returns.
 *
 * Uses ONLY dates where a fund has a REAL price observation — no imputation,
 * no forward-fill, no invented data.  For each pair of funds the intersection
 * of their actual trading dates is used.
 *
 * A date is included in a fund's return series only when CONSECUTIVE real
 * prices exist on that date and the previous date in that fund's own calendar.
 */
export function computeCorrelationMatrix(
  datasets: Record<string, Array<{ date: string; price: number }>>,
  funds: string[],
  start: Date,
  end: Date,
): { labels: string[]; matrix: Record<string, Record<string, number | null>> } {
  // ── Step 1: build daily log-return maps from real price observations only ─
  const returnMaps: Record<string, Map<string, number>> = {};
  const validFunds: string[] = [];

  for (const fund of funds) {
    const series = (datasets[fund] ?? [])
      .filter((p) => { const d = new Date(p.date); return d >= start && d <= end; })
      .sort((a, b) => a.date.localeCompare(b.date));

    if (series.length < 6) continue;

    // Compute log return for each consecutive pair of REAL observations.
    // The return is keyed by the LATER date so two funds can be intersected.
    const rm = new Map<string, number>();
    for (let i = 1; i < series.length; i++) {
      const prev = series[i - 1].price;
      const curr = series[i].price;
      if (prev > 0 && curr > 0) {
        rm.set(series[i].date, Math.log(curr / prev));
      }
    }

    if (rm.size < 5) continue;
    returnMaps[fund] = rm;
    validFunds.push(fund);
  }

  if (validFunds.length < 2) {
    const singleMatrix: Record<string, Record<string, number | null>> = {};
    for (const f of validFunds) singleMatrix[f] = { [f]: 1.0 };
    return { labels: validFunds, matrix: singleMatrix };
  }

  // ── Step 2: Pearson on strict intersection of real return dates ───────────
  const matrix: Record<string, Record<string, number | null>> = {};

  for (const f1 of validFunds) {
    matrix[f1] = {};
    for (const f2 of validFunds) {
      if (f1 === f2) { matrix[f1][f2] = 1.0; continue; }

      const r1 = returnMaps[f1];
      const r2 = returnMaps[f2];
      const common: Array<[number, number]> = [];

      // Only dates where BOTH funds have a real return observation
      for (const [date, v1] of r1) {
        const v2 = r2.get(date);
        if (v2 != null) common.push([v1, v2]);
      }

      if (common.length < 20) { matrix[f1][f2] = null; continue; }

      const n = common.length;
      const m1 = common.reduce((s, [a]) => s + a, 0) / n;
      const m2 = common.reduce((s, [, b]) => s + b, 0) / n;

      let num = 0, d1 = 0, d2 = 0;
      for (const [a, b] of common) {
        num += (a - m1) * (b - m2);
        d1 += (a - m1) ** 2;
        d2 += (b - m2) ** 2;
      }

      const denom = Math.sqrt(d1 * d2);
      matrix[f1][f2] = denom > 0 ? Math.round((num / denom) * 10000) / 10000 : null;
    }
  }

  return { labels: validFunds, matrix };
}

/* ── Substitution rule ─────────────────────────────────────────── */

/** Rule that extends a fund's NAV history using a substitute fund.
 *  The substitute is scaled to connect smoothly at cutoverDate.
 *  Stored in localStorage under "portfolio-substitutions" so both
 *  Evolution and Comparar share the same rules.
 */
export interface SubstitutionRule {
  id: string;
  /** ISIN of the primary fund to extend */
  fundIsin: string;
  /** Display name of the primary fund */
  fundName: string;
  substituteIsin: string;
  substituteName: string;
  /** ISO date — use substitute data BEFORE this date */
  cutoverDate: string;
}

export const SUBSTITUTIONS_STORAGE_KEY = "portfolio-substitutions";

/**
 * Stitch a substitute NAV series before `cutoverDate` onto a primary series.
 * Scales substitute so the two series connect smoothly at the junction.
 */
export function stitchSeries(
  primary: Array<{ date: string; price: number }>,
  substitute: Array<{ date: string; price: number }>,
  cutoverDate: string,
): Array<{ date: string; price: number }> {
  if (!primary.length || !substitute.length) return primary;
  const sorted = [...primary].sort((a, b) => a.date.localeCompare(b.date));
  const subSorted = [...substitute].sort((a, b) => a.date.localeCompare(b.date));

  // Anchor: first primary point at or after cutoverDate
  const anchor = sorted.find((p) => p.date >= cutoverDate) ?? sorted[0];
  // Closest substitute point to anchor date
  const subAnchor =
    subSorted.filter((p) => p.date <= anchor.date).at(-1) ?? subSorted[0];
  if (!subAnchor || subAnchor.price === 0) return primary;

  const scale = anchor.price / subAnchor.price;
  const prefix = subSorted
    .filter((p) => p.date < cutoverDate)
    .map((p) => ({ date: p.date, price: p.price * scale }));

  const primaryAfter = sorted.filter((p) => p.date >= cutoverDate);
  return [...prefix, ...primaryAfter];
}
