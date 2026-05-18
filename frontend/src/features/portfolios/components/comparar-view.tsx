import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useQueries } from "@tanstack/react-query";
import { Spinner, PillToggle, FundSearchInput } from "@/components/ui";
import { cn } from "@/lib/utils";
import { api } from "@/api/client";
import { CHART_COLORS_HEX } from "@/lib/colors";
import { PORTFOLIO_KEY } from "@/lib/chart";
import { TIMEFRAMES, filterByTimeframe, computeCorrelationMatrix } from "@/features/evolution/lib/evolution-utils";
import {
  GrowthChart,
  MetricsTable,
  CorrelationHeatmap,
} from "@/features/evolution/components";
import { usePortfolios, useFavorites } from "../hooks";
import { useHistoryBatch, usePortfolioPositions } from "@/hooks/use-shared-queries";
import type { FundSearchResult, SavedPortfolio, PositionItem } from "@/types";
/** Build a stable colour map for a list of series names */
function buildColorMap(names: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  let i = 0;
  for (const n of names) {
    if (n === PORTFOLIO_KEY || n === "Mi Cartera Actual") {
      map[n] = "#fbbf24"; // gold â€“ same as Evolution tab
    } else {
      map[n] = CHART_COLORS_HEX[i++ % CHART_COLORS_HEX.length];
    }
  }
  return map;
}

export function CompararView() {
  const { data: portfolios } = usePortfolios();
  const { data: favorites } = useFavorites();
  const { data: historyBatch, isLoading: loadingHistory } = useHistoryBatch();
  const { data: positionsData } = usePortfolioPositions();

  /* â”€â”€ selection state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  const [selectedPortfolioIds, setSelectedPortfolioIds] = useState<string[]>(["current"]);
  const [extraFunds, setExtraFunds] = useState<FundSearchResult[]>([]);
  const [activeSeries, setActiveSeries] = useState<string[]>([]);
  const [seriesInitialized, setSeriesInitialized] = useState(false);

  /* â”€â”€ timeframe state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  const [timeframe, setTimeframe] = useState("MAX");
  const [showCustom, setShowCustom] = useState(false);
  const [customRange, setCustomRange] = useState({ from: "", to: "" });

  /* â”€â”€ drag-and-drop â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  const dragSeries = useRef<string | null>(null);
  const lastOverSeries = useRef<string | null>(null);

  const handleDragStart = (s: string) => { dragSeries.current = s; lastOverSeries.current = s; };
  const handleDragOver = useCallback((e: React.DragEvent, over: string) => {
    e.preventDefault();
    if (!dragSeries.current || over === lastOverSeries.current) return;
    lastOverSeries.current = over;
    setActiveSeries((prev) => {
      const from = prev.indexOf(dragSeries.current!);
      const to = prev.indexOf(over);
      if (from === -1 || to === -1) return prev;
      const next = [...prev];
      next.splice(from, 1);
      next.splice(to, 0, dragSeries.current!);
      return next;
    });
  }, []);
  const handleDragEnd = () => { dragSeries.current = null; lastOverSeries.current = null; };

  /* â”€â”€ data: current portfolio history from historyBatch â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  const currentHistory = historyBatch?.series?.[PORTFOLIO_KEY] ?? [];

  /* â”€â”€ data: saved portfolio histories via comparePortfolios â”€â”€â”€â”€â”€â”€â”€â”€ */
  const savedIds = selectedPortfolioIds.filter((id) => id !== "current");

  const compareQueries = useQueries({
    queries: savedIds.map((id) => ({
      queryKey: ["compare-portfolio-history", id],
      queryFn: () => api.comparePortfolios({ portfolio_a: "current", portfolio_b: id, years: 20 }),
      staleTime: 30 * 60_000,  // 30 min — historical data rarely changes
    })),
  });

  // Fetch full portfolio details (with funds) for the FundAllocationTable
  const portfolioDetailQueries = useQueries({
    queries: savedIds.map((id) => ({
      queryKey: ["portfolio", id],
      queryFn: () => api.getPortfolio(id),
      staleTime: 5 * 60_000,
    })),
  });

  const fullPortfolios = useMemo(() => {
    const base = portfolios ?? [];
    const detailMap: Record<string, SavedPortfolio> = {};
    portfolioDetailQueries.forEach((q) => {
      if (q.data) detailMap[String(q.data.id)] = q.data;
    });
    return base.map((p) => detailMap[p.id] ?? p);
  }, [portfolios, portfolioDetailQueries]);

  /* â”€â”€ data: external funds nav histories â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  const fundQueries = useQueries({
    queries: extraFunds.map((f) => ({
      queryKey: ["nav-history", f.isin],
      queryFn: () => api.getFundNavHistory(f.isin, 20),
      staleTime: Infinity,
    })),
  });

  /* â”€â”€ merge all datasets â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  const datasets = useMemo(() => {
    const ds: Record<string, Array<{ date: string; price: number }>> = {};

    if (selectedPortfolioIds.includes("current") && currentHistory.length) {
      ds["Mi Cartera Actual"] = currentHistory;
    }

    savedIds.forEach((_id, idx) => {
      const q = compareQueries[idx];
      if (!q?.data?.history) return;
      for (const [name, series] of Object.entries(q.data.history)) {
        if (name === "current" || name === "Mi Cartera Actual" || name === PORTFOLIO_KEY) continue;
        if (!ds[name]) ds[name] = series;
      }
    });

    extraFunds.forEach((f, idx) => {
      const q = fundQueries[idx];
      if (q?.data?.length) ds[f.name] = q.data;
    });

    return ds;
  }, [currentHistory, selectedPortfolioIds, savedIds, compareQueries, extraFunds, fundQueries]);

  /* â”€â”€ series keys â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  const allSeriesKeys = useMemo(() => Object.keys(datasets), [datasets]);

  // Initialize active series via useEffect to avoid setState-during-render
  useEffect(() => {
    if (allSeriesKeys.length > 0 && !seriesInitialized) {
      setActiveSeries(allSeriesKeys.slice(0, Math.min(5, allSeriesKeys.length)));
      setSeriesInitialized(true);
    }
  }, [allSeriesKeys, seriesInitialized]);

  const colorMap = useMemo(() => buildColorMap(allSeriesKeys), [allSeriesKeys]);

  const orderedSeriesKeys = useMemo(() => {
    const inactive = allSeriesKeys.filter((k) => !activeSeries.includes(k));
    return [...activeSeries.filter((k) => allSeriesKeys.includes(k)), ...inactive];
  }, [allSeriesKeys, activeSeries]);

  /* â”€â”€ timeframe â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  const allDates = useMemo(() => {
    const dates = new Set<string>();
    Object.values(datasets).forEach((s) => s.forEach((p) => dates.add(p.date)));
    return [...dates].sort();
  }, [datasets]);

  const { start, end } = useMemo(
    () => filterByTimeframe(
      allDates,
      timeframe,
      showCustom && customRange.from && customRange.to ? customRange : undefined,
    ),
    [allDates, timeframe, showCustom, customRange],
  );

  /* â”€â”€ correlation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  const correlation = useMemo(() => {
    if (!allSeriesKeys.length) return null;
    return computeCorrelationMatrix(datasets, allSeriesKeys, start, end);
  }, [datasets, allSeriesKeys, start, end]);

  /* â”€â”€ common start for metrics â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  const commonStart = useMemo(() => {
    let cs = start;
    for (const s of activeSeries) {
      const series = datasets[s];
      if (!series?.length) continue;
      const first = series.find((p) => new Date(p.date) >= start);
      if (first) {
        const d = new Date(first.date);
        if (d > cs) cs = d;
      }
    }
    return cs;
  }, [datasets, activeSeries, start]);

  /* â”€â”€ toggle helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  const togglePortfolio = (id: string) => {
    setSelectedPortfolioIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
    setSeriesInitialized(false);
  };

  /** Select ALL available portfolios (including current + all saved). */
  const selectAllPortfolios = () => {
    setSelectedPortfolioIds(portfolioOptions.map((o) => o.value));
    setSeriesInitialized(false);
  };

  /** Keep only "current" selected (minimum useful state). */
  const deselectAllPortfolios = () => {
    setSelectedPortfolioIds(["current"]);
    setSeriesInitialized(false);
  };

  const toggleSeries = (s: string) => {
    setActiveSeries((prev) =>
      prev.includes(s) ? prev.filter((k) => k !== s) : [...prev, s],
    );
  };

  const handleAddExternalFund = (fund: FundSearchResult) => {
    setExtraFunds((prev) => prev.some((f) => f.isin === fund.isin) ? prev : [...prev, fund]);
    setActiveSeries((prev) => prev.includes(fund.name) ? prev : [...prev, fund.name]);
  };

  const handleRemoveExternalFund = (isin: string) => {
    const fund = extraFunds.find((f) => f.isin === isin);
    if (fund) {
      setActiveSeries((prev) => prev.filter((k) => k !== fund.name));
      setExtraFunds((prev) => prev.filter((f) => f.isin !== isin));
    }
  };

  const isLoading = loadingHistory || compareQueries.some((q) => q.isLoading);

  // Availability warnings: which portfolio's history is limited by a newer fund
  const availabilityWarnings = useMemo(() => {
    const warnings: Array<{ portfolioName: string; dataStart: string; limitingFund: string }> = [];
    for (const q of compareQueries) {
      if (!q.data?.availability) continue;
      for (const [name, avail] of Object.entries(q.data.availability)) {
        if (!avail?.data_start || !avail.fund_starts?.length) continue;
        // The limiting fund is the one whose first_date equals data_start (last to start)
        const sorted = [...avail.fund_starts].sort((a, b) => b.first_date.localeCompare(a.first_date));
        const limiting = sorted[0];
        if (limiting && limiting.first_date === avail.data_start) {
          warnings.push({ portfolioName: name, dataStart: avail.data_start, limitingFund: limiting.name });
        }
      }
    }
    return warnings;
  }, [compareQueries]);

  const portfolioOptions = useMemo(() => {
    const opts = [{ value: "current", label: "📊 Mi Cartera Actual" }];
    for (const p of portfolios ?? []) {
      opts.push({ value: p.id, label: p.name });
    }
    return opts;
  }, [portfolios]);

  return (
    <div className="space-y-4">
      {/* â”€â”€ Controls panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="glass-panel space-y-4 p-5">

        {/* Portfolio toggles — Todos/Ninguno select the portfolios to include */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-secondary">Carteras a comparar:</span>
            {(portfolios ?? []).length > 0 && (
              <>
                <button
                  onClick={selectAllPortfolios}
                  className="rounded-full border border-border-glass px-2 py-0.5 text-[10px] text-text-secondary hover:border-accent-glow hover:text-accent-glow transition-colors"
                >
                  Todas
                </button>
                <button
                  onClick={deselectAllPortfolios}
                  className="rounded-full border border-border-glass px-2 py-0.5 text-[10px] text-text-secondary hover:border-red-400/60 hover:text-red-400 transition-colors"
                >
                  Ninguna
                </button>
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-2 mt-1">
            {portfolioOptions.map((o, oIdx) => {
              const active = selectedPortfolioIds.includes(o.value);
              const c = o.value === "current"
                ? "#fbbf24"
                : CHART_COLORS_HEX[oIdx % CHART_COLORS_HEX.length];
              return (
                <button
                  key={o.value}
                  onClick={() => togglePortfolio(o.value)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition-all",
                    active
                      ? "border font-semibold"
                      : "border border-border-glass bg-transparent text-text-secondary opacity-60 hover:opacity-100",
                  )}
                  style={active ? { borderColor: c, backgroundColor: `${c}20`, color: c } : undefined}
                >
                  <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: active ? c : "#555" }} />
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Timeframe */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-text-secondary">Período:</span>
          <PillToggle
            options={[
              ...TIMEFRAMES.map((tf) => ({ key: tf.key, label: tf.label })),
              { key: "CUSTOM", label: "Custom" },
            ]}
            value={showCustom ? "CUSTOM" : timeframe}
            onChange={(key) => {
              if (key === "CUSTOM") {
                setShowCustom(true);
              } else {
                setTimeframe(key);
                setShowCustom(false);
              }
            }}
          />
        </div>

        {showCustom && (
          <div className="flex items-center gap-3">
            <input
              type="date"
              value={customRange.from}
              onChange={(e) => setCustomRange({ ...customRange, from: e.target.value })}
              className="rounded-md border border-border-glass bg-bg-glass px-2 py-1 text-sm text-white"
            />
            <span className="text-text-secondary">→</span>
            <input
              type="date"
              value={customRange.to}
              onChange={(e) => setCustomRange({ ...customRange, to: e.target.value })}
              className="rounded-md border border-border-glass bg-bg-glass px-2 py-1 text-sm text-white"
            />
          </div>
        )}

        {/* Series filter pills — reorder via drag */}
        {allSeriesKeys.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[0.6rem] text-text-muted" title="Arrastra para reordenar">↕ arrastra</span>
            <button
              onClick={() => { setActiveSeries([...allSeriesKeys]); setSeriesInitialized(true); }}
              className="rounded-full border border-border-glass px-2 py-0.5 text-[10px] text-text-secondary hover:border-accent-glow hover:text-accent-glow transition-colors"
            >
              Mostrar todas
            </button>
            <button
              onClick={() => { setActiveSeries([]); setSeriesInitialized(true); }}
              className="rounded-full border border-border-glass px-2 py-0.5 text-[10px] text-text-secondary hover:border-red-400/60 hover:text-red-400 transition-colors"
            >
              Ocultar todas
            </button>
            {orderedSeriesKeys.map((s) => {
              const active = activeSeries.includes(s);
              const color = colorMap[s] ?? "#888";
              const isExtra = extraFunds.some((f) => f.name === s);
              return (
                <button
                  key={s}
                  draggable={active}
                  onDragStart={() => handleDragStart(s)}
                  onDragOver={(e) => active && handleDragOver(e, s)}
                  onDragEnd={handleDragEnd}
                  onClick={() => toggleSeries(s)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition-all",
                    active
                      ? "border font-semibold"
                      : "border border-border-glass bg-transparent text-text-secondary opacity-60 hover:opacity-100",
                  )}
                  style={active ? { borderColor: color, backgroundColor: `${color}20`, color } : undefined}
                >
                  <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: active ? color : "#555" }} />
                  <span className="max-w-[150px] truncate">{s}</span>
                  {isExtra && (
                    <span
                      role="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const ef = extraFunds.find((f) => f.name === s);
                        if (ef) handleRemoveExternalFund(ef.isin);
                      }}
                      className="ml-1 opacity-70 hover:opacity-100"
                      title="Quitar fondo externo"
                    >
                      ✕
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Add external fund */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="shrink-0 text-xs text-text-secondary">+ Fondo externo:</span>
          <div className="max-w-xs flex-1">
            <FundSearchInput
              onSelect={handleAddExternalFund}
              placeholder="Buscar fondo por nombre o ISIN..."
              portfolioIsins={(positionsData?.positions ?? []).map((p) => p.ISIN)}
              favoriteIsins={(favorites ?? []).map((f) => f.isin)}
              favoritesData={favorites ?? []}
            />
          </div>
          {(favorites ?? []).length > 0 && (
            <button
              onClick={() => {
                for (const fav of favorites ?? []) {
                  handleAddExternalFund({ isin: fav.isin, name: fav.name, in_portfolio: false });
                }
              }}
              className="rounded-full border border-yellow-400/40 px-3 py-1 text-xs text-yellow-400 hover:bg-yellow-400/10 transition-colors"
            >
              ⭐ Añadir favoritos ({(favorites ?? []).length})
            </button>
          )}
        </div>
      </div>

      {isLoading && (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      )}

      {!isLoading && activeSeries.length < 2 && allSeriesKeys.length < 2 && (
        <p className="text-center text-xs text-text-secondary py-4">
          Selecciona al menos 2 carteras o añade un fondo externo para comparar.
        </p>
      )}

      {/* Availability warning banner */}
      {!isLoading && availabilityWarnings.length > 0 && (
        <div className="rounded-lg border border-yellow-400/30 bg-yellow-400/10 px-4 py-3 text-xs text-yellow-300 space-y-1">
          <p className="font-semibold">⚠️ Historial limitado por fondos recientes</p>
          {availabilityWarnings.map((w, i) => (
            <p key={i}>
              <span className="font-medium">{w.portfolioName}</span>: datos desde{" "}
              <span className="font-mono">{w.dataStart}</span> — limitado por{" "}
              <span className="italic">{w.limitingFund}</span>.
            </p>
          ))}
          <p className="text-yellow-400/70">La comparativa solo muestra el período en que todos los fondos tienen datos.</p>
        </div>
      )}

      {!isLoading && activeSeries.length >= 1 && (
        <>
          <GrowthChart
            datasets={datasets}
            activeFunds={activeSeries}
            fundColorMap={colorMap}
            start={start}
            end={end}
          />

          <MetricsTable
            datasets={datasets}
            activeFunds={activeSeries}
            fundColorMap={colorMap}
            start={commonStart}
            end={end}
            benchmarkKey={null}
          />

          <CompararReturnsHeatmap datasets={datasets} activeSeries={activeSeries} colorMap={colorMap} />

          {/* Fund allocation comparison table */}
          {activeSeries.length >= 2 && (
            <FundAllocationTable
              activeSeries={activeSeries}
              portfolioOptions={portfolioOptions}
              portfolios={fullPortfolios}
              positionsData={positionsData}
              colorMap={colorMap}
            />
          )}

          {correlation && activeSeries.length >= 2 && (
            <CorrelationHeatmap
              labels={correlation.labels.filter((l) => activeSeries.includes(l))}
              matrix={correlation.matrix}
            />
          )}
        </>
      )}
    </div>
  );
}

/* ── Comparar Returns Heatmap ──────────────────────────────────────────── */

function pctToHeatColor(v: number | null | undefined): string {
  if (v == null) return "hsl(220, 20%, 15%)";
  const clamped = Math.max(-25, Math.min(25, v));
  if (clamped >= 0) {
    const sat = Math.min((clamped / 25) * 80, 80);
    return `hsl(140, ${sat}%, ${35 - (sat / 80) * 10}%)`;
  }
  const sat = Math.min((Math.abs(clamped) / 25) * 80, 80);
  return `hsl(0, ${sat}%, ${35 - (sat / 80) * 10}%)`;
}

/** Compute annual returns (by calendar year) from NAV series. */
function computeAnnualReturnsFromSeries(
  datasets: Record<string, Array<{ date: string; price: number }>>,
): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {};
  for (const [name, pts] of Object.entries(datasets)) {
    if (!pts?.length) continue;
    const sorted = [...pts].sort((a, b) => a.date.localeCompare(b.date));
    // last price per YYYY
    const byYear = new Map<string, number>();
    for (const pt of sorted) {
      byYear.set(pt.date.slice(0, 4), pt.price);
    }
    const years = [...byYear.keys()].sort();
    const fundReturns: Record<string, number> = {};
    for (let i = 1; i < years.length; i++) {
      const prev = byYear.get(years[i - 1])!;
      const curr = byYear.get(years[i])!;
      if (prev > 0) {
        fundReturns[years[i]] = parseFloat(((curr / prev - 1) * 100).toFixed(2));
      }
    }
    if (Object.keys(fundReturns).length) result[name] = fundReturns;
  }
  return result;
}

function CompararReturnsHeatmap({
  datasets,
  activeSeries,
  colorMap,
}: {
  datasets: Record<string, Array<{ date: string; price: number }>>;
  activeSeries: string[];
  colorMap: Record<string, string>;
}) {
  const annualReturns = useMemo(
    () => computeAnnualReturnsFromSeries(datasets),
    [datasets],
  );

  const years = useMemo(() => {
    const s = new Set<string>();
    Object.values(annualReturns).forEach((r) => Object.keys(r).forEach((y) => s.add(y)));
    return [...s].sort();
  }, [annualReturns]);

  const funds = activeSeries.filter((s) => !!annualReturns[s]);
  if (!funds.length || !years.length) return null;

  return (
    <div className="glass-panel overflow-x-auto p-4">
      <h5 className="mb-3 text-sm font-semibold">📅 Retornos Anuales</h5>
      <table
        className="w-full text-xs"
        style={{ borderSpacing: "3px", borderCollapse: "separate" }}
      >
        <thead>
          <tr>
            <th className="sticky left-0 bg-bg-card px-2 py-1 text-left text-text-secondary">
              Serie
            </th>
            {years.map((y) => (
              <th key={y} className="px-2 py-1 text-center font-semibold text-text-secondary">
                {y}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {funds.map((fund) => (
            <tr key={fund}>
              <td
                className="sticky left-0 max-w-[160px] truncate bg-bg-card px-2 py-1 font-medium"
                title={fund}
                style={{ color: colorMap[fund] ?? undefined }}
              >
                {fund}
              </td>
              {years.map((year) => {
                const val = annualReturns[fund]?.[year] ?? null;
                return (
                  <td
                    key={year}
                    className="rounded-sm px-2 py-1 text-center font-bold tabular-nums"
                    style={{
                      backgroundColor: pctToHeatColor(val),
                      color: val != null ? "#fff" : "#555",
                    }}
                  >
                    {val != null ? `${val >= 0 ? "+" : ""}${val.toFixed(1)}%` : "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Fund Allocation Comparison Table ──────────────────────────────────── */

function FundAllocationTable({
  activeSeries,
  portfolios,
  positionsData,
  colorMap,
}: {
  activeSeries: string[];
  portfolioOptions: Array<{ value: string; label: string }>;
  portfolios: SavedPortfolio[];
  positionsData: { positions: PositionItem[]; total_value: number } | undefined;
  colorMap: Record<string, string>;
}) {
  // Build a map: seriesName -> { isin -> { name, weight } }
  const allocations = useMemo(() => {
    const result: Record<string, Record<string, { name: string; weight: number }>> = {};

    for (const series of activeSeries) {
      if (series === "Mi Cartera Actual" || series === PORTFOLIO_KEY) {
        const positions = positionsData?.positions ?? [];
        const total = positionsData?.total_value ?? positions.reduce((s, p) => s + (p.Valor_Actual ?? 0), 0);
        if (total > 0) {
          const alloc: Record<string, { name: string; weight: number }> = {};
          for (const pos of positions) {
            alloc[pos.ISIN] = { name: pos.Fondo, weight: (pos.Valor_Actual ?? 0) / total };
          }
          result[series] = alloc;
        }
      } else {
        const portfolio = portfolios.find((p) => p.name === series);
        if (portfolio?.funds?.length) {
          const alloc: Record<string, { name: string; weight: number }> = {};
          for (const f of portfolio.funds) {
            alloc[f.isin] = { name: f.name, weight: f.weight };
          }
          result[series] = alloc;
        }
      }
    }
    return result;
  }, [activeSeries, portfolios, positionsData]);

  const seriesWithData = activeSeries.filter((s) => !!allocations[s]);
  if (seriesWithData.length === 0) return null;

  // All unique ISINs across all series
  const allIsins = [...new Set(Object.values(allocations).flatMap((a) => Object.keys(a)))];

  const getFundName = (isin: string) => {
    for (const alloc of Object.values(allocations)) {
      if (alloc[isin]) return alloc[isin].name;
    }
    return isin;
  };

  return (
    <div className="glass-panel overflow-x-auto">
      <div className="p-4 pb-2 font-semibold text-sm">Composición por fondo</div>
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-border-glass text-left text-text-secondary">
            <th className="p-2 pl-4 font-normal">Fondo</th>
            {seriesWithData.map((s) => (
              <th key={s} className="p-2 font-normal text-right" style={{ color: colorMap[s] ?? "#888" }}>
                <span className="max-w-[120px] truncate block text-right">{s}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {allIsins.map((isin) => (
            <tr key={isin} className="border-b border-border-glass/20 hover:bg-white/3">
              <td className="p-2 pl-4">
                <div className="font-medium text-white">{getFundName(isin)}</div>
                <div className="text-[10px] font-mono text-text-secondary">{isin}</div>
              </td>
              {seriesWithData.map((s) => {
                const w = allocations[s]?.[isin]?.weight;
                return (
                  <td key={s} className="p-2 text-right tabular-nums">
                    {w != null && w > 0 ? (
                      <div className="flex items-center justify-end gap-1.5">
                        <div
                          className="h-1.5 rounded-full"
                          style={{ width: `${Math.max(w * 60, 2)}px`, backgroundColor: colorMap[s] ?? "#888", opacity: 0.7 }}
                        />
                        <span className="text-white">{(w * 100).toFixed(1)}%</span>
                      </div>
                    ) : (
                      <span className="text-text-secondary">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
