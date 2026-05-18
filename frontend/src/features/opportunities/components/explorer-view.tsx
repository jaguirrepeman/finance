import { useState, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { fmtPct } from "@/lib/format";
import { CHART_TOOLTIP_STYLE, CHART_TOOLTIP_WRAPPER_STYLE, normalizeBase100 } from "@/lib/chart";
import { api } from "@/api/client";
import { useEnrichFunds, useCompareFunds } from "../hooks";
import { TimingScoreBar } from "./timing-ui";
import type { FundSearchResult, EnrichedFund } from "@/types";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { CHART_COLORS_HEX } from "@/lib/colors";

type SortDir = "asc" | "desc";

interface Filters {
  ret5yMin: string;
  ret1yMax: string;
  terMax: string;
  sharpeMin: string;
  ratingMin: string;
  timingMin: string;
  category: string;
}

const EMPTY_FILTERS: Filters = {
  ret5yMin: "",
  ret1yMax: "",
  terMax: "",
  sharpeMin: "",
  ratingMin: "",
  timingMin: "",
  category: "",
};

export function ExplorerView() {
  /* ── Search state ──────────────────────────────────────────────────── */
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FundSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  /* ── Enrich state ──────────────────────────────────────────────────── */
  const [enrichedFunds, setEnrichedFunds] = useState<EnrichedFund[]>([]);
  const enrichMut = useEnrichFunds();

  /* ── Filter & sort ─────────────────────────────────────────────────── */
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sortCol, setSortCol] = useState<string>("timing_score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  /* ── Comparison ────────────────────────────────────────────────────── */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const compareMut = useCompareFunds();

  /* ── Actions ───────────────────────────────────────────────────────── */
  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const results = await api.searchFund(query.trim());
      setSearchResults(results);
    } finally {
      setSearching(false);
    }
  }, [query]);

  const handleEnrich = useCallback(async () => {
    const isins = searchResults.map((r) => r.isin);
    if (isins.length === 0) return;

    // Batch in groups of 10
    const results: EnrichedFund[] = [];
    for (let i = 0; i < isins.length; i += 10) {
      const batch = isins.slice(i, i + 10);
      const enriched = await enrichMut.mutateAsync(batch);
      results.push(...enriched);
    }
    setEnrichedFunds(results);
  }, [searchResults, enrichMut]);

  const handleCompare = useCallback(() => {
    const isins = Array.from(selected);
    if (isins.length < 2) return;
    compareMut.mutate({ isins, years: 5 });
  }, [selected, compareMut]);

  /* ── Filtered and sorted ───────────────────────────────────────────── */
  const filteredFunds = useMemo(() => {
    let funds = [...enrichedFunds];
    const f = filters;
    if (f.ret5yMin) funds = funds.filter((x) => (x.ret_5y ?? 0) >= Number(f.ret5yMin));
    if (f.ret1yMax) funds = funds.filter((x) => (x.ret_1y ?? 999) <= Number(f.ret1yMax));
    if (f.terMax) funds = funds.filter((x) => (x.ter ?? 0) <= Number(f.terMax));
    if (f.sharpeMin) funds = funds.filter((x) => (x.sharpe ?? 0) >= Number(f.sharpeMin));
    if (f.ratingMin) funds = funds.filter((x) => (x.rating ?? 0) >= Number(f.ratingMin));
    if (f.timingMin)
      funds = funds.filter((x) => (x.timing_score ?? 0) >= Number(f.timingMin));
    if (f.category)
      funds = funds.filter((x) =>
        (x.category ?? "").toLowerCase().includes(f.category.toLowerCase()),
      );

    funds.sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[sortCol] ?? 0;
      const bv = (b as unknown as Record<string, unknown>)[sortCol] ?? 0;
      const diff = Number(av) - Number(bv);
      return sortDir === "asc" ? diff : -diff;
    });

    return funds;
  }, [enrichedFunds, filters, sortCol, sortDir]);

  const toggleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortCol(col);
      setSortDir("desc");
    }
  };

  const toggleSelect = (isin: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(isin)) next.delete(isin);
      else if (next.size < 6) next.add(isin);
      return next;
    });
  };

  /* ── Render ────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="Buscar fondos por nombre, ISIN o categoría..."
          className="flex-1 rounded-lg border border-border-glass bg-bg-glass px-3 py-2 text-sm text-white placeholder:text-text-secondary focus:border-accent-glow focus:outline-none"
        />
        <button
          onClick={handleSearch}
          disabled={searching || !query.trim()}
          className="rounded-lg bg-accent-glow px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
        >
          {searching ? "..." : "🔍 Buscar"}
        </button>
      </div>

      {/* Search results (pre-enrich) */}
      {searchResults.length > 0 && enrichedFunds.length === 0 && (
        <div className="glass-panel space-y-3 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-secondary">
              {searchResults.length} resultados
            </span>
            <button
              onClick={handleEnrich}
              disabled={enrichMut.isPending}
              className="rounded-lg bg-accent-secondary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {enrichMut.isPending ? "Cargando métricas..." : "📊 Cargar métricas"}
            </button>
          </div>

          <div className="max-h-60 space-y-1 overflow-y-auto">
            {searchResults.map((r) => (
              <div
                key={r.isin}
                className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-white/5"
              >
                <div>
                  <span className="font-medium">{r.name}</span>
                  <span className="ml-2 text-xs text-text-secondary">{r.isin}</span>
                  {r.in_portfolio && (
                    <span className="ml-2 rounded bg-accent-glow/15 px-1 py-0.5 text-[10px] text-accent-glow">
                      En cartera
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Enriched screener */}
      {enrichedFunds.length > 0 && (
        <>
          {/* Filters */}
          <div className="glass-panel p-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
              <FilterInput
                label="Ret 5Y mín (%)"
                value={filters.ret5yMin}
                onChange={(v) => setFilters({ ...filters, ret5yMin: v })}
              />
              <FilterInput
                label="Ret 1Y máx (%)"
                value={filters.ret1yMax}
                onChange={(v) => setFilters({ ...filters, ret1yMax: v })}
              />
              <FilterInput
                label="TER máx (%)"
                value={filters.terMax}
                onChange={(v) => setFilters({ ...filters, terMax: v })}
              />
              <FilterInput
                label="Sharpe mín"
                value={filters.sharpeMin}
                onChange={(v) => setFilters({ ...filters, sharpeMin: v })}
              />
              <FilterInput
                label="Rating mín"
                value={filters.ratingMin}
                onChange={(v) => setFilters({ ...filters, ratingMin: v })}
              />
              <FilterInput
                label="Timing mín"
                value={filters.timingMin}
                onChange={(v) => setFilters({ ...filters, timingMin: v })}
              />
              <FilterInput
                label="Categoría"
                value={filters.category}
                onChange={(v) => setFilters({ ...filters, category: v })}
                isText
              />
            </div>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => setFilters(EMPTY_FILTERS)}
                className="text-xs text-text-secondary hover:text-white"
              >
                Limpiar filtros
              </button>
              <button
                onClick={() => {
                  setEnrichedFunds([]);
                  setSearchResults([]);
                  setSelected(new Set());
                  compareMut.reset();
                }}
                className="text-xs text-text-secondary hover:text-white"
              >
                ← Nueva búsqueda
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="glass-panel overflow-x-auto p-0">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-bg-glass/95 backdrop-blur">
                <tr className="border-b border-border-glass text-text-secondary">
                  <th className="p-2 text-center">✓</th>
                  <SortHeader
                    label="Fondo"
                    col="name"
                    current={sortCol}
                    dir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortHeader
                    label="Timing"
                    col="timing_score"
                    current={sortCol}
                    dir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortHeader
                    label="Ret 5Y"
                    col="ret_5y"
                    current={sortCol}
                    dir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortHeader
                    label="Ret 3Y"
                    col="ret_3y"
                    current={sortCol}
                    dir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortHeader
                    label="Ret 1Y"
                    col="ret_1y"
                    current={sortCol}
                    dir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortHeader
                    label="Sharpe"
                    col="sharpe"
                    current={sortCol}
                    dir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortHeader
                    label="TER"
                    col="ter"
                    current={sortCol}
                    dir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortHeader
                    label="Rating"
                    col="rating"
                    current={sortCol}
                    dir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortHeader
                    label="Vol"
                    col="volatility"
                    current={sortCol}
                    dir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortHeader
                    label="MaxDD"
                    col="max_drawdown"
                    current={sortCol}
                    dir={sortDir}
                    onSort={toggleSort}
                  />
                </tr>
              </thead>
              <tbody>
                {filteredFunds.map((f) => (
                  <tr
                    key={f.isin}
                    className={cn(
                      "border-b border-border-glass/30 transition-colors hover:bg-white/3",
                      selected.has(f.isin) && "bg-accent-glow/5",
                    )}
                  >
                    <td className="p-2 text-center">
                      <input
                        type="checkbox"
                        checked={selected.has(f.isin)}
                        onChange={() => toggleSelect(f.isin)}
                        className="accent-accent-glow"
                      />
                    </td>
                    <td className="max-w-[180px] truncate p-2 font-medium">
                      <div>{f.name}</div>
                      <div className="text-[10px] text-text-secondary">{f.isin}</div>
                    </td>
                    <td className="p-2">
                      <TimingScoreBar score={f.timing_score ?? 0} />
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {f.ret_5y != null ? fmtPct(f.ret_5y) : "—"}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {f.ret_3y != null ? fmtPct(f.ret_3y) : "—"}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {f.ret_1y != null ? fmtPct(f.ret_1y) : "—"}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {f.sharpe?.toFixed(2) ?? "—"}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {f.ter != null ? `${f.ter.toFixed(2)}%` : "—"}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {f.rating ?? "—"}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {f.volatility != null ? `${f.volatility.toFixed(1)}%` : "—"}
                    </td>
                    <td className="p-2 text-right tabular-nums text-red-400">
                      {f.max_drawdown != null
                        ? `${f.max_drawdown.toFixed(1)}%`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredFunds.length === 0 && (
              <p className="py-6 text-center text-xs text-text-secondary">
                No hay fondos que coincidan con los filtros.
              </p>
            )}
          </div>

          {/* Selected funds bar */}
          {selected.size > 0 && (
            <div className="glass-panel flex flex-wrap items-center gap-2 p-3">
              {Array.from(selected).map((isin) => {
                const fund = enrichedFunds.find((f) => f.isin === isin);
                return (
                  <span
                    key={isin}
                    className="flex items-center gap-1 rounded-full border border-accent-glow/30 bg-accent-glow/10 px-2 py-0.5 text-xs"
                  >
                    {fund?.name ?? isin}
                    <button
                      onClick={() => toggleSelect(isin)}
                      className="text-text-secondary hover:text-white"
                    >
                      ×
                    </button>
                  </span>
                );
              })}
              <button
                onClick={handleCompare}
                disabled={selected.size < 2 || compareMut.isPending}
                className="ml-auto rounded-lg bg-accent-glow px-3 py-1 text-xs font-semibold text-black disabled:opacity-50"
              >
                {compareMut.isPending
                  ? "Comparando..."
                  : `⚖️ Comparar (${selected.size})`}
              </button>
            </div>
          )}

          {/* Comparison result */}
          {compareMut.data && (
            <ComparisonPanel data={compareMut.data} />
          )}
        </>
      )}
    </div>
  );
}

/* ── Helper components ────────────────────────────────────────────────── */

function FilterInput({
  label,
  value,
  onChange,
  isText = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  isText?: boolean;
}) {
  return (
    <div>
      <label className="mb-0.5 block text-[10px] text-text-secondary">
        {label}
      </label>
      <input
        type={isText ? "text" : "number"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-border-glass bg-bg-glass px-2 py-1 text-xs text-white"
      />
    </div>
  );
}

function SortHeader({
  label,
  col,
  current,
  dir,
  onSort,
}: {
  label: string;
  col: string;
  current: string;
  dir: SortDir;
  onSort: (col: string) => void;
}) {
  return (
    <th
      className="cursor-pointer p-2 text-right select-none hover:text-white"
      onClick={() => onSort(col)}
    >
      {label}
      {current === col && (
        <span className="ml-0.5">{dir === "asc" ? "▲" : "▼"}</span>
      )}
    </th>
  );
}

function ComparisonPanel({
  data,
}: {
  data: import("@/types").FundComparisonResult;
}) {
  // Normalize chart data to base 100
  const chartData = useMemo(
    () => normalizeBase100(data.chart_data),
    [data.chart_data],
  );

  const fundNames = Object.keys(data.chart_data);

  const METRIC_ROWS = [
    "timing_score",
    "level",
    "ret_1y",
    "ret_3y",
    "ret_5y",
    "category",
    "expense_ratio",
    "rating",
    "srri",
    "sharpe",
    "volatility",
    "max_drawdown",
  ] as const;

  const METRIC_LABELS: Record<string, string> = {
    timing_score: "Timing Score",
    level: "Nivel Señal",
    ret_1y: "Retorno 1Y",
    ret_3y: "Retorno 3Y",
    ret_5y: "Retorno 5Y",
    category: "Categoría",
    expense_ratio: "TER",
    rating: "Rating",
    srri: "SRRI",
    sharpe: "Sharpe",
    volatility: "Volatilidad",
    max_drawdown: "Max Drawdown",
  };

  return (
    <div className="glass-panel space-y-4 p-4">
      <h4 className="font-semibold">Comparación de Fondos</h4>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "#999" }}
                tickFormatter={(v: string) => v.slice(0, 7)}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#999" }}
                domain={["auto", "auto"]}
                width={45}
              />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                wrapperStyle={CHART_TOOLTIP_WRAPPER_STYLE}
              />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {fundNames.map((name, i) => (
                <Line
                  key={name}
                  dataKey={name}
                  stroke={CHART_COLORS_HEX[i % CHART_COLORS_HEX.length]}
                  dot={false}
                  strokeWidth={1.5}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Metrics table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border-glass text-text-secondary">
              <th className="p-2 text-left">Métrica</th>
              {data.funds.map((f) => (
                <th key={f.isin} className="p-2 text-right">
                  {f.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {METRIC_ROWS.map((key) => (
              <tr key={key} className="border-b border-border-glass/20">
                <td className="p-2 text-text-secondary">{METRIC_LABELS[key]}</td>
                {data.funds.map((f) => {
                  const raw = (f as Record<string, unknown>)[key];
                  const val =
                    raw == null
                      ? "—"
                      : typeof raw === "number"
                        ? raw.toFixed(2)
                        : String(raw);
                  return (
                    <td key={f.isin} className="p-2 text-right tabular-nums">
                      {val}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
