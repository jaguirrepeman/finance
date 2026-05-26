import { useEffect, useMemo, useState, useRef } from "react";
import { Star, ExternalLink, Shuffle, Trash2 } from "lucide-react";
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
  stitchSeries,
  SUBSTITUTIONS_STORAGE_KEY,
} from "./lib/evolution-utils";
import type { SubstitutionRule } from "./lib/evolution-utils";
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

  // Substitution rules — shared with Comparar via localStorage
  const [substitutions, setSubstitutions] = useState<SubstitutionRule[]>([]);
  const [showSubstitutions, setShowSubstitutions] = useState(false);
  const [subNextId, setSubNextId] = useState(1);

  // Load substitution rules from shared localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SUBSTITUTIONS_STORAGE_KEY);
      if (saved) {
        const parsed: SubstitutionRule[] = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.fundIsin) {
          setSubstitutions(parsed);
          const maxId = Math.max(0, ...parsed.map((r) => Number(r.id) || 0));
          setSubNextId(maxId + 1);
        }
      }
    } catch { /* ignore */ }
  }, []);

  // Persist substitution rules whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(SUBSTITUTIONS_STORAGE_KEY, JSON.stringify(substitutions));
    } catch { /* ignore quota errors */ }
  }, [substitutions]);

  // Controlled zoom state: lifted from GrowthChart so correlation/metrics react to it
  const [zoomLeft, setZoomLeft] = useState<string | null>(null);
  const [zoomRight, setZoomRight] = useState<string | null>(null);

  // Fetch nav history for each extra external fund
  const extraQueries = useQueries({
    queries: extraFunds.map((f) => ({
      queryKey: ["nav-history", f.isin],
      queryFn: () => api.getFundNavHistory(f.isin, 20),
      staleTime: Infinity,
    })),
  });

  // Fetch nav history for substitute funds referenced in substitution rules
  const uniqueSubIsins = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const r of substitutions) {
      if (r.substituteIsin && !seen.has(r.substituteIsin)) {
        seen.add(r.substituteIsin);
        result.push(r.substituteIsin);
      }
    }
    return result;
  }, [substitutions]);

  const substituteQueries = useQueries({
    queries: uniqueSubIsins.map((isin) => ({
      queryKey: ["nav-history", isin],
      queryFn: () => api.getFundNavHistory(isin, 30),
      staleTime: Infinity,
    })),
  });

  const substituteNavMap = useMemo(() => {
    const map: Record<string, Array<{ date: string; price: number }>> = {};
    uniqueSubIsins.forEach((isin, idx) => {
      const q = substituteQueries[idx];
      if (q?.data?.length) map[isin] = q.data;
    });
    return map;
  }, [uniqueSubIsins, substituteQueries]);

  // Stabilize extraQueries reference: only re‐derive when actual data changes
  const extraDataStamp = extraQueries
    .map((q) => q.dataUpdatedAt)
    .join(",");

  const baseDatasets = historyBatch?.series ?? {};

  // Merge extra external fund histories into datasets, then apply substitution rules
  const datasets = useMemo(() => {
    const merged: Record<string, Array<{ date: string; price: number }>> = { ...baseDatasets };
    extraFunds.forEach((f, i) => {
      const q = extraQueries[i];
      if (q?.data?.length) {
        merged[f.name] = q.data;
      }
    });

    // Apply substitution rules: find series by matching ISIN, then stitch
    // Build ISIN→seriesName map from positionsData + extraFunds
    const isinToName: Record<string, string> = {};
    for (const pos of positionsData?.positions ?? []) {
      if (pos.ISIN && pos.Fondo && merged[pos.Fondo]) isinToName[pos.ISIN] = pos.Fondo;
    }
    for (const ef of extraFunds) {
      if (ef.isin && ef.name && merged[ef.name]) isinToName[ef.isin] = ef.name;
    }
    for (const rule of substitutions) {
      const seriesKey = isinToName[rule.fundIsin];
      const subNav = substituteNavMap[rule.substituteIsin];
      if (seriesKey && merged[seriesKey]?.length && subNav?.length) {
        merged[seriesKey] = stitchSeries(merged[seriesKey], subNav, rule.cutoverDate);
      }
    }

    return merged;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseDatasets, extraFunds, extraDataStamp, substitutions, substituteNavMap, positionsData]);

  // Initialize active funds once data arrives
  const fundKeys = useMemo(() => {
    return Object.keys(datasets);
  }, [datasets]);

  // Track which fund keys were known on the previous render so we only
  // auto-add *truly new* keys (not all funds the user may have deselected).
  const prevFundKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (fundKeys.length > 0 && !initialized) {
      const defaults = [
        ...fundKeys.filter((k) => k === PORTFOLIO_KEY),
        ...fundKeys.filter((k) => k !== PORTFOLIO_KEY).slice(0, 4),
      ];
      setActiveFunds(defaults);
      setInitialized(true);
      prevFundKeysRef.current = new Set(fundKeys);
    } else if (initialized && fundKeys.length > 0) {
      // Only auto-add keys that genuinely just appeared (were not in the
      // previous fundKeys set). This prevents re-adding funds the user
      // explicitly deselected when a new external fund is added.
      const reallyNew = fundKeys.filter(
        (k) => !prevFundKeysRef.current.has(k) && k !== PORTFOLIO_KEY,
      );
      if (reallyNew.length > 0) {
        setActiveFunds((prev) => [...prev, ...reallyNew.filter((k) => !prev.includes(k))]);
      }
      prevFundKeysRef.current = new Set(fundKeys);
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

  // Build fund-name → ISIN map from portfolio positions + manually added funds
  const fundIsinMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const pos of positionsData?.positions ?? []) {
      if (pos.Fondo && pos.ISIN) map[pos.Fondo] = pos.ISIN;
    }
    for (const ef of extraFunds) {
      if (ef.name && ef.isin) map[ef.name] = ef.isin;
    }
    return map;
  }, [positionsData, extraFunds]);

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

  // Effective start/end: zoom overrides the timeframe period
  const effectiveStart = useMemo(
    () => (zoomLeft ? new Date(zoomLeft) : start),
    [zoomLeft, start],
  );
  const effectiveEnd = useMemo(
    () => (zoomRight ? new Date(zoomRight) : end),
    [zoomRight, end],
  );

  // Correlation — filtered to active funds, reacts to zoom.
  const correlation = useMemo(() => {
    if (!activeFunds.length || !Object.keys(datasets).length) return null;
    return computeCorrelationMatrix(datasets, activeFunds, effectiveStart, effectiveEnd);
  }, [datasets, activeFunds, effectiveStart, effectiveEnd]);

  /**
   * Common start = latest "first available date within [effectiveStart, effectiveEnd]"
   * across all active funds.  Both GrowthChart and MetricsTable use this so the
   * base-100 chart and the metric period are identical.
   */
  const commonStart = useMemo(() => {
    let cs = effectiveStart;
    for (const fund of activeFunds) {
      const series = datasets[fund];
      if (!series?.length) continue;
      const firstInRange = series.find((p) => new Date(p.date) >= effectiveStart);
      if (firstInRange) {
        const d = new Date(firstInRange.date);
        if (d > cs) cs = d;
      }
    }
    return cs;
  }, [datasets, activeFunds, effectiveStart]);

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

  // ISINs of the currently active funds (excludes the portfolio aggregate key)
  const activeIsins = useMemo(() => {
    return activeFunds
      .filter((f) => f !== PORTFOLIO_KEY)
      .map((f) => fundIsinMap[f])
      .filter(Boolean) as string[];
  }, [activeFunds, fundIsinMap]);

  // Build set of ETF ISINs from positions data + extraFunds with is_etf flag
  const etfIsinSet = useMemo(() => {
    const s = new Set<string>();
    for (const pos of positionsData?.positions ?? []) {
      if (pos.is_etf && pos.ISIN) s.add(pos.ISIN);
    }
    return s;
  }, [positionsData]);

  // Comparison URLs — Finect for mutual funds, justETF for ETFs
  const finectCompareUrl = useMemo(() => {
    const fundIsins = activeIsins.filter((isin) => !etfIsinSet.has(isin));
    if (!fundIsins.length) return null;
    return `https://www.finect.com/fondos-inversion/comparador?products=${fundIsins.slice(0, 6).join(",")}`;
  }, [activeIsins, etfIsinSet]);

  const justEtfCompareUrl = useMemo(() => {
    const etfIsins = activeIsins.filter((isin) => etfIsinSet.has(isin));
    if (!etfIsins.length) return null;
    const params = etfIsins.slice(0, 8).map((i) => `isin=${encodeURIComponent(i)}`).join("&");
    return `https://www.justetf.com/en/etf-comparison.html?${params}`;
  }, [activeIsins, etfIsinSet]);

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
            const isPortfolioFund = fund === PORTFOLIO_KEY;
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
                    ? isPortfolioFund
                      ? "border-2 font-bold"
                      : "border font-semibold"
                    : "border border-border-glass bg-transparent text-text-secondary opacity-60 hover:opacity-100",
                )}
                style={
                  active
                    ? {
                        borderColor: color,
                        backgroundColor: `${color}25`,
                        color: color,
                        ...(isPortfolioFund ? { boxShadow: `0 0 8px ${color}55` } : {}),
                      }
                    : undefined
                }
              >
                <span
                  className={cn(
                    "inline-block rounded-full",
                    isPortfolioFund ? "h-2.5 w-2.5" : "h-2 w-2",
                  )}
                  style={{ backgroundColor: active ? color : "#555" }}
                />
                <span className={cn("max-w-[150px] truncate", isPortfolioFund && active && "tracking-wide")}>{fund}</span>
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
              excludeIsins={extraFunds.map((f) => f.isin)}
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
              <Star className="inline size-3.5 fill-yellow-400 text-yellow-400 align-text-bottom mr-1" /> Añadir favoritos ({(favorites ?? []).length})
            </button>
          )}
        </div>

        {/* ── Fondos sustitutos ─────────────────────────────────── */}
        <div className="rounded-lg border border-border-glass/40 bg-white/2">
          <button
            onClick={() => setShowSubstitutions((v) => !v)}
            className="flex w-full items-center justify-between px-3 py-2 text-xs hover:bg-white/5"
          >
            <span className="font-semibold text-text-secondary">
              <Shuffle className="inline size-3.5 align-text-bottom mr-1" />
              Fondos sustitutos
              {substitutions.length > 0 && (
                <span className="ml-2 rounded-full bg-accent-glow/20 px-1.5 py-0.5 text-[10px] text-accent-glow">
                  {substitutions.length}
                </span>
              )}
              <span className="ml-1 font-normal text-text-muted">
                — extiende el historial de un fondo usando un sustituto
              </span>
            </span>
            <span className="text-text-muted">{showSubstitutions ? "▲" : "▼"}</span>
          </button>
          {showSubstitutions && (
            <div className="border-t border-border-glass/30 p-3 space-y-3">
              <p className="text-[11px] text-text-secondary">
                Selecciona un fondo de tu cartera para extender su historial con un sustituto anterior.
                El sustituto se escala para empalmar suavemente en la fecha de corte.
                <span className="ml-1 text-accent-glow/80">La configuración se comparte con Carteras/Comparar.</span>
              </p>
              {substitutions.map((rule) => (
                <div key={rule.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-end text-xs">
                  <div>
                    <div className="mb-0.5 text-[10px] text-text-muted">Fondo a extender</div>
                    {rule.fundIsin ? (
                      <div className="flex items-center gap-1 rounded border border-accent-glow/30 bg-accent-glow/5 px-2 py-1">
                        <span className="flex-1 truncate text-white text-xs">{rule.fundName}</span>
                        <span className="font-mono text-[10px] text-text-muted">{rule.fundIsin}</span>
                        <button
                          onClick={() =>
                            setSubstitutions((prev) =>
                              prev.map((s) => s.id === rule.id ? { ...s, fundIsin: "", fundName: "" } : s),
                            )
                          }
                          className="text-text-secondary hover:text-red-400"
                        >✕</button>
                      </div>
                    ) : (
                      <FundSearchInput
                        onSelect={(r) =>
                          setSubstitutions((prev) =>
                            prev.map((s) => s.id === rule.id ? { ...s, fundIsin: r.isin, fundName: r.name } : s),
                          )
                        }
                        placeholder="Buscar fondo a extender…"
                        portfolioIsins={(positionsData?.positions ?? []).map((p) => p.ISIN)}
                        favoriteIsins={(favorites ?? []).map((f) => f.isin)}
                        favoritesData={favorites ?? []}
                      />
                    )}
                  </div>
                  <div>
                    <div className="mb-0.5 text-[10px] text-text-muted">Sustituto hasta</div>
                    <input
                      type="date"
                      value={rule.cutoverDate}
                      onChange={(e) =>
                        setSubstitutions((prev) =>
                          prev.map((s) => s.id === rule.id ? { ...s, cutoverDate: e.target.value } : s),
                        )
                      }
                      className="rounded border border-border-glass bg-bg-glass px-2 py-1 text-xs text-white focus:outline-none focus:border-accent-glow"
                    />
                  </div>
                  <div className="min-w-[220px]">
                    <div className="mb-0.5 text-[10px] text-text-muted">
                      Fondo sustituto:{" "}
                      {rule.substituteName && (
                        <span className="text-accent-glow">{rule.substituteName}</span>
                      )}
                    </div>
                    {rule.substituteIsin ? (
                      <div className="flex items-center gap-1 rounded border border-accent-glow/30 bg-accent-glow/5 px-2 py-1">
                        <span className="flex-1 truncate text-white">{rule.substituteName}</span>
                        <button
                          onClick={() =>
                            setSubstitutions((prev) =>
                              prev.map((s) => s.id === rule.id ? { ...s, substituteIsin: "", substituteName: "" } : s),
                            )
                          }
                          className="text-text-secondary hover:text-red-400"
                        >✕</button>
                      </div>
                    ) : (
                      <FundSearchInput
                        onSelect={(r) =>
                          setSubstitutions((prev) =>
                            prev.map((s) =>
                              s.id === rule.id
                                ? { ...s, substituteIsin: r.isin, substituteName: r.name }
                                : s,
                            ),
                          )
                        }
                        placeholder="Buscar fondo sustituto…"
                        portfolioIsins={[]}
                        favoriteIsins={(favorites ?? []).map((f) => f.isin)}
                        favoritesData={favorites ?? []}
                      />
                    )}
                  </div>
                  <button
                    onClick={() => setSubstitutions((prev) => prev.filter((s) => s.id !== rule.id))}
                    className="mb-0.5 rounded px-2 py-1 text-xs text-red-400 hover:bg-red-400/10"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => {
                  setSubstitutions((prev) => [
                    ...prev,
                    {
                      id: String(subNextId),
                      fundIsin: "",
                      fundName: "",
                      substituteIsin: "",
                      substituteName: "",
                      cutoverDate: new Date(Date.now() - 3 * 365 * 24 * 3600_000)
                        .toISOString()
                        .slice(0, 10),
                    },
                  ]);
                  setSubNextId((n) => n + 1);
                }}
                className="rounded-md border border-dashed border-border-glass px-3 py-1.5 text-xs text-text-secondary hover:border-accent-glow hover:text-accent-glow transition-colors"
              >
                ＋ Añadir sustitución
              </button>
            </div>
          )}
        </div>

        {/* ── External comparison links ─────────────────────────── */}
        {activeIsins.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border-glass/30 pt-3">
            <span className="text-xs text-text-secondary shrink-0">Comparar en:</span>
            {finectCompareUrl && (
              <a
                href={finectCompareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-full border border-blue-400/40 px-3 py-1 text-xs text-blue-400 hover:bg-blue-400/10 transition-colors"
              >
                <ExternalLink className="size-3" />
                Finect
              </a>
            )}
            {justEtfCompareUrl && (
              <a
                href={justEtfCompareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-full border border-emerald-400/40 px-3 py-1 text-xs text-emerald-400 hover:bg-emerald-400/10 transition-colors"
              >
                <ExternalLink className="size-3" />
                JustETF
              </a>
            )}
          </div>
        )}
      </div>

      {/* ── Growth chart ───────────────────────────────────────── */}
      <GrowthChart
        datasets={datasets}
        activeFunds={activeFunds}
        fundColorMap={fundColorMap}
        start={start}
        end={end}
        zoomLeft={zoomLeft}
        zoomRight={zoomRight}
        onZoomChange={(l, r) => { setZoomLeft(l); setZoomRight(r); }}
        onZoomReset={() => { setZoomLeft(null); setZoomRight(null); }}
      />

      {/* ── Period badge — shows the effective analysis window ─── */}
      <div className="flex items-center gap-2 text-xs text-text-secondary px-1">
        <span className="font-medium text-text-primary">
          Período de análisis:{" "}
          <span className="text-accent-glow">
            {effectiveStart.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}
            {" – "}
            {effectiveEnd.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}
          </span>
        </span>
        {zoomLeft && zoomRight && (
          <span className="rounded-full bg-accent-glow/15 px-2 py-0.5 text-accent-glow border border-accent-glow/30">
            🔍 Zoom activo — métricas y correlaciones del período seleccionado
          </span>
        )}
      </div>

      {/* ── Metrics table ──────────────────────────────────────── */}
      <MetricsTable
        datasets={datasets}
        activeFunds={activeFunds}
        fundColorMap={fundColorMap}
        start={commonStart}
        end={effectiveEnd}
        benchmarkKey={benchmarkKey}
        fundIsinMap={fundIsinMap}
      />

      {/* ── Correlation heatmap ────────────────────────────────── */}
      {correlation && (
        <CorrelationHeatmap
          labels={correlation.labels}
          matrix={correlation.matrix}
        />
      )}

      {/* ── Annual returns ─────────────────────────────────────── */}
      <AnnualReturnsHeatmap activeFunds={activeFunds} />
    </div>
  );
}
