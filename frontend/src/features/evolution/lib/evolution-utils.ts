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

/** Compute Pearson correlation matrix client-side */
export function computeCorrelationMatrix(
  datasets: Record<string, Array<{ date: string; price: number }>>,
  funds: string[],
  start: Date,
  end: Date,
): { labels: string[]; matrix: Record<string, Record<string, number | null>> } {
  // Build log-returns indexed by date for each fund
  const returnsMap: Record<string, Map<string, number>> = {};
  const validFunds: string[] = [];

  for (const fund of funds) {
    const series = (datasets[fund] ?? [])
      .filter((p) => {
        const d = new Date(p.date);
        return d >= start && d <= end;
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    if (series.length < 6) continue;

    const returns = new Map<string, number>();
    for (let i = 1; i < series.length; i++) {
      if (series[i - 1].price > 0) {
        returns.set(
          series[i].date,
          Math.log(series[i].price / series[i - 1].price),
        );
      }
    }
    returnsMap[fund] = returns;
    validFunds.push(fund);
  }

  const matrix: Record<string, Record<string, number | null>> = {};

  for (const f1 of validFunds) {
    matrix[f1] = {};
    for (const f2 of validFunds) {
      if (f1 === f2) {
        matrix[f1][f2] = 1.0;
        continue;
      }

      // Find common dates
      const r1 = returnsMap[f1];
      const r2 = returnsMap[f2];
      const common: Array<[number, number]> = [];

      for (const [date, val1] of r1) {
        const val2 = r2.get(date);
        if (val2 != null) common.push([val1, val2]);
      }

      if (common.length < 30) {
        matrix[f1][f2] = null;
        continue;
      }

      // Pearson correlation
      const n = common.length;
      const m1 = common.reduce((s, [a]) => s + a, 0) / n;
      const m2 = common.reduce((s, [, b]) => s + b, 0) / n;

      let num = 0;
      let d1 = 0;
      let d2 = 0;
      for (const [a, b] of common) {
        num += (a - m1) * (b - m2);
        d1 += (a - m1) ** 2;
        d2 += (b - m2) ** 2;
      }

      const denom = Math.sqrt(d1 * d2);
      matrix[f1][f2] =
        denom > 0 ? Math.round((num / denom) * 10000) / 10000 : null;
    }
  }

  return { labels: validFunds, matrix };
}
