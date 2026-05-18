import { useEffect, useMemo, useState, useRef } from "react";
import { useQueries } from "@tanstack/react-query";
import { Spinner, PillToggle, FundSearchInput } from "@/components/ui";
import { CHART_COLORS_HEX } from "@/lib/colors";
import { PORTFOLIO_KEY } from "@/lib/chart";
import { cn } from "@/lib/utils";
import { api } from "@/api/client";
import type { FundSearchResult } from "@/types";
import { useHistoryBatch } from "./hooks";
import { useFavorites } from "@/features/portfolios/hooks";
import { usePortfolioPositions } from "@/hooks/use-shared-queries";
import {
  TIMEFRAMES,
  filterByTimeframe,
  computeCorrelationMatrix,
} from "./lib/evolution-utils";
import {
  GrowthChart,
  MetricsTable,
  CorrelationHeatmap,
  AnnualReturnsHeatmap,
} from "./components";

export function EvolutionTab() {
  const { data: historyBatch, isLoading } = useHistoryBatch();
  const { data: favorites } = useFavorites();
  const { data: positionsData } = usePortfolioPositions();

  const [timeframe, setTimeframe] = useState("MAX");
  const [customRange, setCustomRange] = useState({ from: "", to: "" });
  const [showCustom, setShowCustom] = useState(false);
  const [activeFunds, setActiveFunds] = useState<string[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [extraFunds, setExtraFunds] = useState<FundSearchResult[]>([]);

  // Fetch nav history for each extra external fund
  const extraQueries = useQueries({
    queries: extraFunds.map((f) => ({
      queryKey: ["nav-history", f.isin],
      queryFn: () => api.getFundNavHistory(f.isin, 20),
      staleTime: Infinity,
    })),
  });

  // Stabilize extraQueries reference: only re‐derive when actual data changes
  const extraDataStamp = extraQueries
    .map((q) => q.dataUpdatedAt)
    .join(",");

  const baseDatasets = historyBatch?.series ?? {};

  // Merge extra external fund histories into datasets
  const datasets = useMemo(() => {
    const merged = { ...baseDatasets };
    extraFunds.forEach((f, i) => {
      const q = extraQueries[i];
      if (q?.data?.length) {
        merged[f.name] = q.data;
      }
    });
    return merged;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseDatasets, extraFunds, extraDataStamp]);

  // Initialize active funds once data arrives
  const fundKeys = useMemo(() => {
    return Object.keys(datasets);
  }, [datasets]);

  useEffect(() => {
    if (fundKeys.length > 0 && !initialized) {
      const defaults = [
        ...fundKeys.filter((k) => k === PORTFOLIO_KEY),
        ...fundKeys.filter((k) => k !== PORTFOLIO_KEY).slice(0, 4),
      ];
      setActiveFunds(defaults);
      setInitialized(true);
    } else if (initialized && fundKeys.length > 0) {
      // Auto-add any new funds that appeared after initialization (e.g. manual positions)
      setActiveFunds((prev) => {
        const newFunds = fundKeys.filter((k) => !prev.includes(k) && k !== PORTFOLIO_KEY);
        return newFunds.length > 0 ? [...prev, ...newFunds] : prev;
      });
    }
  }, [fundKeys, initialized]);

  // Fund color map: gold for portfolio, stable colors for others
  const fundColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    const nonPortfolio = fundKeys.filter((k) => k !== PORTFOLIO_KEY);
    nonPortfolio.forEach((k, i) => {
      map[k] = CHART_COLORS_HEX[i % CHART_COLORS_HEX.length];
    });
    map[PORTFOLIO_KEY] = "#fbbf24"; // gold
    return map;
  }, [fundKeys]);

  // Auto-detect benchmark (MSCI World fund)
  const benchmarkKey = useMemo(() => {
    return (
      fundKeys.find(
        (k) =>
          k.toLowerCase().includes("msci") ||
          k.toLowerCase().includes("world"),
      ) ?? null
    );
  }, [fundKeys]);

  // Time range
  const allDates = useMemo(() => {
    const dates = new Set<string>();
    Object.values(datasets).forEach((series) =>
      series.forEach((p) => dates.add(p.date)),
    );
    return [...dates].sort();
  }, [datasets]);

  const { start, end } = useMemo(
    () =>
      filterByTimeframe(
        allDates,
        timeframe,
        showCustom && customRange.from && customRange.to
          ? customRange
          : undefined,
      ),
    [allDates, timeframe, showCustom, customRange],
  );

  // Correlation — compute FULL matrix once (not dependent on activeFunds),
  // then pass to heatmap which picks only active fund rows/cols.
  const correlation = useMemo(() => {
    if (!Object.keys(datasets).length) return null;
    const allFunds = Object.keys(datasets);
    return computeCorrelationMatrix(datasets, allFunds, start, end);
  }, [datasets, start, end]);

  /**
   * Common start = latest "first available date within [start,end]" across all
   * active funds.  Both GrowthChart and MetricsTable use this so the base-100
   * chart and the metric period are identical.
   */
  const commonStart = useMemo(() => {
    let cs = start;
    for (const fund of activeFunds) {
      const series = datasets[fund];
      if (!series?.length) continue;
      const firstInRange = series.find((p) => new Date(p.date) >= start);
      if (firstInRange) {
        const d = new Date(firstInRange.date);
        if (d > cs) cs = d;
      }
    }
    return cs;
  }, [datasets, activeFunds, start]);

  const toggleFund = (fund: string) => {
    setActiveFunds((prev) =>
      prev.includes(fund) ? prev.filter((f) => f !== fund) : [...prev, fund],
    );
  };

  // Drag-and-drop reordering of activeFunds
  const dragFund = useRef<string | null>(null);
  const lastOverFund = useRef<string | null>(null);

  const handleDragStart = (fund: string) => {
    dragFund.current = fund;
    lastOverFund.current = fund;
  };

  const handleDragOver = (e: React.DragEvent, overFund: string) => {
    e.preventDefault();
    if (!dragFund.current || overFund === lastOverFund.current) return;
    lastOverFund.current = overFund;
    setActiveFunds((prev) => {
      const from = prev.indexOf(dragFund.current!);
      const to = prev.indexOf(overFund);
      if (from === -1 || to === -1) return prev;
      const next = [...prev];
      next.splice(from, 1);
      next.splice(to, 0, dragFund.current!);
      return next;
    });
  };

  const handleDragEnd = () => {
    dragFund.current = null;
    lastOverFund.current = null;
  };

  // Display order: active funds in their drag-reordered order first, then inactive ones
  const orderedFundKeys = useMemo(() => {
    const inactive = fundKeys.filter((k) => !activeFunds.includes(k));
    return [...activeFunds.filter((k) => fundKeys.includes(k)), ...inactive];
  }, [fundKeys, activeFunds]);

  const handleAddExternalFund = (fund: FundSearchResult) => {
    setExtraFunds((prev) => {
      if (prev.some((f) => f.isin === fund.isin)) return prev;
      return [...prev, fund];
    });
    setActiveFunds((prev) => {
      if (prev.includes(fund.name)) return prev;
      return [...prev, fund.name];
    });
  };

  const handleRemoveExternalFund = (isin: string) => {
    const fund = extraFunds.find((f) => f.isin === isin);
    if (fund) {
      setActiveFunds((prev) => prev.filter((k) => k !== fund.name));
      setExtraFunds((prev) => prev.filter((f) => f.isin !== isin));
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!fundKeys.length) {
    return (
      <div className="py-8 text-center text-sm text-text-secondary">
        No hay datos de histórico de NAV disponibles.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Controls ───────────────────────────────────────────── */}
      <div className="glass-panel space-y-4 p-5">
        {/* Timeframe buttons */}
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

        {/* Custom range */}
        {showCustom && (
          <div className="flex items-center gap-3">
            <input
              type="date"
              value={customRange.from}
              onChange={(e) =>
                setCustomRange({ ...customRange, from: e.target.value })
              }
              className="rounded-md border border-border-glass bg-bg-glass px-2 py-1 text-sm text-white"
            />
            <span className="text-text-secondary">→</span>
            <input
              type="date"
              value={customRange.to}
              onChange={(e) =>
                setCustomRange({ ...customRange, to: e.target.value })
              }
              className="rounded-md border border-border-glass bg-bg-glass px-2 py-1 text-sm text-white"
            />
          </div>
        )}

        {/* Fund checkboxes */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Todos / Ninguno shortcuts */}
          <button
            onClick={() => setActiveFunds([...fundKeys])}
            className="rounded-full border border-border-glass px-3 py-1 text-xs text-text-secondary hover:border-accent-glow hover:text-accent-glow transition-colors"
          >
            Todos
          </button>
          <button
            onClick={() => setActiveFunds([])}
            className="rounded-full border border-border-glass px-3 py-1 text-xs text-text-secondary hover:border-accent-glow hover:text-accent-glow transition-colors"
          >
            Ninguno
          </button>
          <span className="w-px self-stretch bg-border-glass" />
          <span className="text-[0.6rem] text-text-muted" title="Arrastra para reordenar">↕ arrastra</span>
          {orderedFundKeys.map((fund) => {
            const active = activeFunds.includes(fund);
            const color = fundColorMap[fund] ?? "#888";
            return (
              <button
                key={fund}
                draggable={active}
                onDragStart={() => handleDragStart(fund)}
                onDragOver={(e) => active && handleDragOver(e, fund)}
                onDragEnd={handleDragEnd}
                onClick={() => toggleFund(fund)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition-all",
                  active
                    ? "border font-semibold"
                    : "border border-border-glass bg-transparent text-text-secondary opacity-60 hover:opacity-100",
                )}
                style={
                  active
                    ? {
                        borderColor: color,
                        backgroundColor: `${color}20`,
                        color: color,
                      }
                    : undefined
                }
              >
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: active ? color : "#555" }}
                />
                <span className="max-w-[150px] truncate">{fund}</span>
                {/* Remove button for external funds */}
                {extraFunds.some((f) => f.name === fund) && (
                  <span
                    role="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const ef = extraFunds.find((f) => f.name === fund);
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

        {/* Add external fund */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="shrink-0 text-xs text-text-secondary">+ Fondo externo:</span>
          <div className="max-w-xs flex-1">
            <FundSearchInput
              onSelect={handleAddExternalFund}
              placeholder="Buscar por nombre o ISIN..."
              portfolioIsins={(positionsData?.positions ?? []).map((p) => p.ISIN)}
              favoriteIsins={(favorites ?? []).map((f) => f.isin)}
              favoritesData={favorites ?? []}
            />
          </div>
          {/* Add all favorites at once */}
          {(favorites ?? []).length > 0 && (
            <button
              onClick={() => {
                for (const fav of favorites ?? []) {
                  handleAddExternalFund({ isin: fav.isin, name: fav.name, in_portfolio: false });
                }
              }}
              className="rounded-full border border-yellow-400/40 px-3 py-1 text-xs text-yellow-400 hover:bg-yellow-400/10 transition-colors"
              title={`Añadir ${(favorites ?? []).length} favoritos a la comparativa`}
            >
              ⭐ Añadir favoritos ({(favorites ?? []).length})
            </button>
          )}
        </div>
      </div>

      {/* ── Growth chart ───────────────────────────────────────── */}
      <GrowthChart
        datasets={datasets}
        activeFunds={activeFunds}
        fundColorMap={fundColorMap}
        start={start}
        end={end}
      />

      {/* ── Metrics table ──────────────────────────────────────── */}
      <MetricsTable
        datasets={datasets}
        activeFunds={activeFunds}
        fundColorMap={fundColorMap}
        start={commonStart}
        end={end}
        benchmarkKey={benchmarkKey}
      />

      {/* ── Correlation heatmap ────────────────────────────────── */}
      {correlation && (
        <CorrelationHeatmap
          labels={correlation.labels.filter((l) => activeFunds.includes(l))}
          matrix={correlation.matrix}
        />
      )}

      {/* ── Annual returns ─────────────────────────────────────── */}
      <AnnualReturnsHeatmap activeFunds={activeFunds} />
    </div>
  );
}
