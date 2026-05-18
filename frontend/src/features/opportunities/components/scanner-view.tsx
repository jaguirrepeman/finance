import { useState, useEffect, useCallback, useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { Spinner, PillToggle, FundSearchInput } from "@/components/ui";
import { fmtEur, fmtPct } from "@/lib/format";
import { CHART_TOOLTIP_STYLE, CHART_TOOLTIP_WRAPPER_STYLE } from "@/lib/chart";
import { cn } from "@/lib/utils";
import { api } from "@/api/client";
import {
  useTimingPresets,
  useOpportunities,
  useOpportunityChartData,
} from "../hooks";
import { useFavorites } from "@/features/portfolios/hooks";
import {
  TimingScoreBar,
  SubScoreBar,
  SignalBadge,
  LevelBadge,
} from "./timing-ui";
import type { OpportunityEntry, FundSearchResult } from "@/types";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

const WEIGHT_KEYS = [
  "trend",
  "pullback",
  "divergence",
  "rsi",
  "vol_regime",
  "short_term",
] as const;

const WEIGHT_LABELS: Record<string, string> = {
  trend: "Tendencia",
  pullback: "Pullback",
  divergence: "Divergencia",
  rsi: "RSI",
  vol_regime: "Volatilidad",
  short_term: "Corto Plazo",
};

const LS_KEY = "opp_scanner_weights";

export function ScannerView() {
  const { data: presetsData, isLoading: loadingPresets } = useTimingPresets();

  const [weights, setWeights] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      /* ignore */
    }
    return {};
  });

  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [showWeights, setShowWeights] = useState(false);
  const [expandedChart, setExpandedChart] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [extraFunds, setExtraFunds] = useState<Array<{ isin: string; name: string }>>([]);

  const { data: favorites } = useFavorites();
  const favoriteIsins = useMemo(
    () => new Set((favorites ?? []).map((f) => f.isin)),
    [favorites],
  );

  // Set default weights when presets load
  useEffect(() => {
    if (presetsData && Object.keys(weights).length === 0) {
      setWeights(presetsData.default_weights);
    }
  }, [presetsData, weights]);

  // Persist weights
  useEffect(() => {
    if (Object.keys(weights).length > 0) {
      localStorage.setItem(LS_KEY, JSON.stringify(weights));
    }
  }, [weights]);

  // Stabilize weights reference: only change when the serialized JSON changes
  const weightsKey = JSON.stringify(weights);
  const stableWeights = useMemo<Record<string, number>>(
    () => weights,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [weightsKey],
  );

  const {
    data: opportunities,
    isLoading,
    refetch,
  } = useOpportunities(stableWeights);

  // Fetch opportunity data for favorites + extra funds not already in portfolio scan
  const portfolioIsins = useMemo(
    () => new Set((opportunities ?? []).map((o) => o.isin)),
    [opportunities],
  );
  const externalIsins = useMemo(
    () => [
      ...(favorites ?? []).filter((f) => !portfolioIsins.has(f.isin)).map((f) => f.isin),
      ...extraFunds.filter((f) => !portfolioIsins.has(f.isin)).map((f) => f.isin),
    ],
    [favorites, portfolioIsins, extraFunds],
  );

  const externalQueries = useQueries({
    queries:
      Object.keys(stableWeights).length > 0
        ? externalIsins.map((isin) => ({
            queryKey: ["opportunity-detail", isin],
            queryFn: () => api.getOpportunityDetail(isin),
            staleTime: 10 * 60_000,
          }))
        : [],
  });

  // Stabilize external queries: only re-derive when actual data changes
  const extDataStamp = externalQueries.map((q) => q.dataUpdatedAt).join(",");
  const externalOpportunities: OpportunityEntry[] = useMemo(
    () => externalQueries.map((q) => q.data).filter((d): d is OpportunityEntry => !!d),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [extDataStamp],
  );

  const applyPreset = useCallback(
    (key: string) => {
      if (!presetsData) return;
      const preset = presetsData.presets[key];
      if (preset) {
        setWeights(preset.weights);
        setActivePreset(key);
      }
    },
    [presetsData],
  );

  const normalizeWeights = useCallback(() => {
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    if (total === 0) return;
    const norm: Record<string, number> = {};
    for (const [k, v] of Object.entries(weights)) {
      norm[k] = Math.round((v / total) * 100) / 100;
    }
    setWeights(norm);
    setActivePreset(null);
  }, [weights]);

  const handleAddExtraFund = (fund: FundSearchResult) => {
    setExtraFunds((prev) => {
      if (prev.some((f) => f.isin === fund.isin)) return prev;
      return [...prev, { isin: fund.isin, name: fund.name }];
    });
  };

  const handleRemoveExtraFund = (isin: string) => {
    setExtraFunds((prev) => prev.filter((f) => f.isin !== isin));
  };

  if (loadingPresets) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  // Merge portfolio + external opportunities
  const allOpportunities: OpportunityEntry[] = [
    ...(opportunities ?? []),
    ...externalOpportunities,
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold">Escáner de Oportunidades</h3>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setShowInfo(!showInfo)}
            className={cn(
              "rounded-lg border border-border-glass px-3 py-1.5 text-xs hover:bg-white/5",
              showInfo && "bg-white/5",
            )}
            title="Explicación de indicadores"
          >
            ℹ️ Indicadores
          </button>
          <button
            onClick={() => setShowWeights(!showWeights)}
            className="rounded-lg border border-border-glass px-3 py-1.5 text-xs hover:bg-white/5"
          >
            ⚙️ Configurar Pesos
          </button>
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="rounded-lg bg-accent-glow px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-50"
          >
            {isLoading ? "Escaneando..." : "🔄 Recalcular"}
          </button>
        </div>
      </div>

      {/* Info panel — indicator explanations */}
      {showInfo && <IndicatorInfoPanel />}

      {/* Scanner info */}
      <div className="rounded-lg border border-border-glass bg-white/3 p-4 text-xs text-text-secondary">
        <p>
          El escáner analiza 6 dimensiones de timing para cada fondo de tu
          cartera y tus favoritos: tendencia, pullback, divergencia precio/regresión, RSI,
          régimen de volatilidad y momentum a corto plazo.
        </p>
        <div className="mt-2 flex flex-wrap gap-3">
          <span className="text-green-400">● Alto (≥70)</span>
          <span className="text-yellow-400">● Medio (50-70)</span>
          <span className="text-orange-400">● Bajo (30-50)</span>
          <span className="text-red-400">● Muy Bajo (&lt;30)</span>
        </div>
      </div>

      {/* Add fund to scanner */}
      <div className="glass-panel p-4 space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold">➕ Añadir fondo al escáner</h4>
          {(favorites ?? []).length > 0 && (
            <button
              onClick={() => {
                for (const fav of favorites ?? []) {
                  if (!portfolioIsins.has(fav.isin)) {
                    setExtraFunds((prev) =>
                      prev.some((f) => f.isin === fav.isin)
                        ? prev
                        : [...prev, { isin: fav.isin, name: fav.name }],
                    );
                  }
                }
              }}
              className="rounded-full border border-yellow-400/40 px-3 py-1 text-xs text-yellow-400 hover:bg-yellow-400/10 transition-colors"
            >
              ⭐ Añadir todos los favoritos ({(favorites ?? []).length})
            </button>
          )}
        </div>
        <FundSearchInput
          onSelect={handleAddExtraFund}
          placeholder="Buscar fondo para añadir al escáner..."
          portfolioIsins={[...portfolioIsins]}
          favoriteIsins={(favorites ?? []).map((f) => f.isin)}
          favoritesData={favorites ?? []}
        />
        {extraFunds.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-1">
            {extraFunds.map((f) => (
              <span
                key={f.isin}
                className="flex items-center gap-1 rounded-full bg-white/8 px-2.5 py-0.5 text-xs"
              >
                {f.name}
                <button
                  onClick={() => handleRemoveExtraFund(f.isin)}
                  className="ml-1 text-red-400 hover:text-red-300"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Weight panel */}
      {showWeights && presetsData && (
        <div className="glass-panel space-y-4 p-4">
          <PillToggle
            options={Object.entries(presetsData.presets).map(([key, preset]) => ({
              key,
              label: preset.label,
              title: preset.description,
            }))}
            value={activePreset ?? ""}
            onChange={applyPreset}
            variant="outlined"
          />

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {WEIGHT_KEYS.map((k) => (
              <div key={k}>
                <label className="mb-1 flex items-center justify-between text-xs text-text-secondary">
                  <span>{WEIGHT_LABELS[k]}</span>
                  <span className="tabular-nums">
                    {((weights[k] ?? 0) * 100).toFixed(0)}%
                  </span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={50}
                  value={(weights[k] ?? 0) * 100}
                  onChange={(e) => {
                    setWeights((prev) => ({
                      ...prev,
                      [k]: Number(e.target.value) / 100,
                    }));
                    setActivePreset(null);
                  }}
                  className="w-full accent-accent-glow"
                />
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              onClick={normalizeWeights}
              className="rounded-md border border-border-glass px-3 py-1 text-xs hover:bg-white/5"
            >
              Normalizar a 100%
            </button>
            <button
              onClick={() => {
                if (presetsData) {
                  setWeights(presetsData.default_weights);
                  setActivePreset(null);
                }
              }}
              className="rounded-md border border-border-glass px-3 py-1 text-xs hover:bg-white/5"
            >
              Reset
            </button>
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      )}

      {/* Opportunity cards */}
      {allOpportunities.length > 0 && (() => {
        // Sort: portfolio funds first (sorted by score), then favorites, then extra
        const sorted = [...allOpportunities].sort((a, b) => {
          const aInPortfolio = portfolioIsins.has(a.isin) ? 2 : 0;
          const bInPortfolio = portfolioIsins.has(b.isin) ? 2 : 0;
          const aFav = favoriteIsins.has(a.isin) ? 1 : 0;
          const bFav = favoriteIsins.has(b.isin) ? 1 : 0;
          const aGroup = aInPortfolio + aFav;
          const bGroup = bInPortfolio + bFav;
          if (aGroup !== bGroup) return bGroup - aGroup;
          return (b.timing_score ?? 0) - (a.timing_score ?? 0);
        });
        return (
          <div className="space-y-4">
            {sorted.map((opp) => (
              <OpportunityCard
                key={opp.isin}
                opp={opp}
                isFavorite={favoriteIsins.has(opp.isin)}
                isInPortfolio={portfolioIsins.has(opp.isin)}
                isExpanded={expandedChart === opp.isin}
                onToggleChart={() =>
                  setExpandedChart(
                    expandedChart === opp.isin ? null : opp.isin,
                  )
                }
                onAddToScanner={
                  !portfolioIsins.has(opp.isin) && !extraFunds.some((f) => f.isin === opp.isin)
                    ? () => setExtraFunds((prev) => [...prev, { isin: opp.isin, name: opp.name }])
                    : undefined
                }
              />
            ))}
            {sorted.length === 0 && (
              <p className="py-8 text-center text-sm text-text-secondary">
                No se encontraron oportunidades con los pesos actuales.
              </p>
            )}
          </div>
        );
      })()}
    </div>
  );
}

/* ── Indicator Info Panel ─────────────────────────────────────────────── */

const INDICATOR_EXPLANATIONS = [
  {
    key: "trend",
    label: "📈 Tendencia",
    color: "text-blue-400",
    description:
      "Mide si el fondo está en una tendencia alcista sostenida. Se calcula comparando el precio actual con la regresión lineal de los últimos 12 meses. Un score alto indica que el precio está por encima de su línea de tendencia.",
    example: "Si el fondo cotiza en 120 y su regresión dice 100, el z_trend es positivo (+2σ). Para timing de compra buscamos z_trend < 0 (precio por debajo de tendencia).",
    goodWhen: "z_trend < 0 (precio debajo de tendencia → oportunidad de entrada)",
  },
  {
    key: "pullback",
    label: "📉 Pullback",
    color: "text-orange-400",
    description:
      "Detecta si el fondo ha sufrido una corrección reciente desde su máximo de los últimos 3-6 meses. Un pullback del -10% en un fondo con buena tendencia es una oportunidad típica de entrada.",
    example: "Si el fondo ha caído -12% desde su máximo de 3 meses, pull_3M = -12%. Pulls entre -5% y -20% suelen ser los mejores puntos de entrada.",
    goodWhen: "pull_3M entre -5% y -25% (corrección but no colapso)",
  },
  {
    key: "divergence",
    label: "⚡ Divergencia",
    color: "text-purple-400",
    description:
      "Compara el precio actual con su valor de regresión estadística. Una divergencia negativa significa que el precio está 'barato' respecto a su valor esperado por el modelo.",
    example: "Si la regresión dice 100 y el precio es 93, hay una divergencia de -7%. El modelo espera que vuelva al valor de regresión.",
    goodWhen: "Divergencia negativa (precio por debajo de su valor de regresión)",
  },
  {
    key: "rsi",
    label: "🔋 RSI",
    color: "text-yellow-400",
    description:
      "Relative Strength Index a 14 días. Mide si el fondo está sobrecomprado (>70) o sobrevendido (<30). Para timing de compra, un RSI bajo indica que hay momentum de venta agotado.",
    example: "RSI-14 = 28 significa sobrevendido. Históricamente, muchos fondos rebotan desde niveles < 30.",
    goodWhen: "RSI < 40 (zona de sobreventa, buen punto de entrada)",
  },
  {
    key: "vol_regime",
    label: "🌪️ Volatilidad",
    color: "text-red-400",
    description:
      "Detecta si estamos en un régimen de alta o baja volatilidad. Se calcula como la ratio de volatilidad reciente (1 mes) vs histórica (1 año). Ratio < 1 indica calma; > 1.5 indica estrés.",
    example: "vol_ratio = 0.8 → volatilidad actual es el 80% de la histórica (ambiente tranquilo). vol_ratio = 2.1 → alta incertidumbre, esperar.",
    goodWhen: "vol_ratio < 1.2 (volatilidad normalizada, mercado más predecible)",
  },
  {
    key: "short_term",
    label: "⚡ Corto Plazo",
    color: "text-green-400",
    description:
      "Momentum a 1 mes que detecta si hay señales de recuperación inmediata. Combina cambio de precio últimos 20 días con aceleración del momentum. Ideal para aprovechar micro-rebotes.",
    example: "mom_1M = +2% después de un pullback de -10% señala que la caída puede estar terminando.",
    goodWhen: "mom_1M > 0% después de un pullback significativo",
  },
] as const;

const SIGNAL_EXPLANATIONS: Record<string, { label: string; desc: string }> = {
  z_trend: { label: "z_trend", desc: "Desviaciones estándar del precio respecto a la regresión. Negativo = barato; positivo = caro." },
  pull_3M: { label: "pull_3M", desc: "Caída desde el máximo de 3 meses. -10% significa que ha caído un 10% desde su máximo reciente." },
  mom_1M: { label: "mom_1M", desc: "Rendimiento del último mes. Busca valores positivos después de un pullback." },
  mom_6M: { label: "mom_6M", desc: "Rendimiento de los últimos 6 meses. Indica la tendencia de medio plazo." },
  "RSI-14": { label: "RSI-14", desc: "Índice de Fuerza Relativa a 14 días. <30 = sobrevendido; >70 = sobrecomprado." },
  vol_ratio: { label: "vol_ratio", desc: "Ratio de volatilidad reciente/histórica. <1 = mercado calmado; >1.5 = estrés." },
  sharpe: { label: "sharpe", desc: "Ratio Sharpe anualizado. Retorno ajustado por riesgo. >1 es bueno; >2 es excelente." },
  maxDD: { label: "maxDD", desc: "Caída máxima desde pico en el período analizado. Menor magnitud = menor riesgo." },
};

function IndicatorInfoPanel() {
  return (
    <div className="glass-panel space-y-4 p-5">
      <h4 className="font-semibold">ℹ️ Guía de Indicadores de Timing</h4>
      <p className="text-xs text-text-secondary">
        El escáner busca oportunidades de entrada en fondos analizando 6 dimensiones de timing.
        El objetivo es detectar fondos sólidos que han sufrido correcciones temporales — no fondos en caída libre.
        El score total (0-100) pondera estas 6 dimensiones según los pesos configurados.
      </p>

      {/* 6 main indicators */}
      <div className="grid gap-3 md:grid-cols-2">
        {INDICATOR_EXPLANATIONS.map((ind) => (
          <div
            key={ind.key}
            className="rounded-lg border border-border-glass/50 bg-white/3 p-3 space-y-1"
          >
            <div className={cn("text-sm font-semibold", ind.color)}>{ind.label}</div>
            <p className="text-xs text-text-secondary">{ind.description}</p>
            <div className="rounded bg-white/5 p-2 text-xs text-text-secondary">
              <span className="font-medium text-white">Ejemplo: </span>{ind.example}
            </div>
            <div className="text-xs text-green-400">✓ {ind.goodWhen}</div>
          </div>
        ))}
      </div>

      {/* Signal badges explanation */}
      <div>
        <h5 className="mb-2 text-sm font-semibold">Señales de detalle (indicadores secundarios)</h5>
        <div className="grid gap-2 md:grid-cols-2">
          {Object.values(SIGNAL_EXPLANATIONS).map((s) => (
            <div key={s.label} className="flex gap-2 text-xs">
              <span className="shrink-0 font-mono font-medium text-accent-glow">{s.label}</span>
              <span className="text-text-secondary">{s.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Reading the score */}
      <div className="rounded-lg border border-border-glass/50 bg-white/3 p-3 text-xs">
        <div className="font-semibold mb-1">¿Cómo leer el score total?</div>
        <div className="space-y-0.5 text-text-secondary">
          <div><span className="text-green-400 font-medium">70-100 (Alto):</span> Múltiples señales de entrada confluyen. Momento favorable para una aportación.</div>
          <div><span className="text-yellow-400 font-medium">50-70 (Medio):</span> Algunas señales positivas. Aportación parcial o esperar confirmación.</div>
          <div><span className="text-orange-400 font-medium">30-50 (Bajo):</span> Señales mixtas. No es el mejor momento; esperar un pullback mayor.</div>
          <div><span className="text-red-400 font-medium">0-30 (Muy Bajo):</span> Fondo sobrecomprado o en tendencia negativa. Evitar nuevas entradas.</div>
        </div>
      </div>
    </div>
  );
}

/* ── Opportunity Card ─────────────────────────────────────────────────── */

function OpportunityCard({
  opp,
  isFavorite,
  isInPortfolio,
  isExpanded,
  onToggleChart,
  onAddToScanner,
}: {
  opp: OpportunityEntry;
  isFavorite?: boolean;
  isInPortfolio?: boolean;
  isExpanded: boolean;
  onToggleChart: () => void;
  onAddToScanner?: () => void;
}) {
  const subScores = {
    trend: opp.trend_score,
    pullback: opp.pullback_score,
    divergence: opp.divergence_score,
    rsi: opp.rsi_score,
    vol_regime: opp.vol_regime_score,
    short_term: opp.short_term_score,
  };

  return (
    <div className="glass-panel space-y-3 p-4">
      {/* Header row */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5">
            {isInPortfolio && (
              <span className="text-xs font-semibold rounded px-1 py-0.5 bg-accent-glow/20 text-accent-glow" title="En tu cartera">📊 cartera</span>
            )}
            {isFavorite && (
              <span className="text-yellow-400" title="Favorito">⭐</span>
            )}
            <h4 className="font-semibold">{opp.name}</h4>
          </div>
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            <span>{opp.isin}</span>
            {opp.fund_type && (
              <span className="rounded bg-white/8 px-1.5 py-0.5 text-[10px] uppercase">
                {opp.fund_type}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {onAddToScanner && (
            <button
              onClick={onAddToScanner}
              className="rounded-lg border border-border-glass px-2 py-1 text-xs hover:bg-white/5"
              title="Añadir al escáner fijo"
            >
              ➕ Escáner
            </button>
          )}
          {opp.valor_actual != null && (
            <span className="text-sm tabular-nums">{fmtEur(opp.valor_actual)}</span>
          )}
          {opp.ganancia_pct != null && (
            <span
              className={cn(
                "text-sm font-semibold tabular-nums",
                opp.ganancia_pct >= 0 ? "text-success" : "text-danger",
              )}
            >
              {fmtPct(opp.ganancia_pct)}
            </span>
          )}
          <LevelBadge level={opp.level} />
        </div>
      </div>

      {/* Timing score */}
      <TimingScoreBar score={opp.timing_score} />

      {/* Sub-scores */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 md:grid-cols-3">
        {Object.entries(subScores).map(([k, v]) => (
          <SubScoreBar key={k} label={k} score={v} />
        ))}
      </div>

      {/* Signals */}
      <div className="flex flex-wrap gap-1">
        <SignalBadge label="z_trend" value={opp.z_trend} goodIf="negative" />
        <SignalBadge
          label="pull_3M"
          value={opp.pullback_3m_pct}
          goodIf="negative"
        />
        <SignalBadge label="mom_1M" value={opp.momentum_1m} goodIf="positive" />
        <SignalBadge label="mom_6M" value={opp.momentum_6m} goodIf="positive" />
        <SignalBadge label="RSI-14" value={opp.rsi_14} goodIf="low" />
        <SignalBadge
          label="vol_ratio"
          value={opp.vol_regime_ratio}
          goodIf="negative"
        />
        <SignalBadge label="sharpe" value={opp.sharpe} goodIf="positive" />
        <SignalBadge
          label="maxDD"
          value={opp.max_drawdown_pct}
          goodIf="negative"
        />
      </div>

      {/* Description */}
      {opp.description && (
        <p className="text-xs text-text-secondary">{opp.description}</p>
      )}

      {/* Chart toggle */}
      <button
        onClick={onToggleChart}
        className="text-xs text-accent-glow hover:underline"
      >
        {isExpanded ? "▲ Ocultar gráfico" : "▼ Ver gráfico de timing"}
      </button>

      {isExpanded && <TimingChartPanel isin={opp.isin} />}
    </div>
  );
}

/* ── Timing Chart Panel ───────────────────────────────────────────────── */

function TimingChartPanel({ isin }: { isin: string }) {
  const { data, isLoading } = useOpportunityChartData(isin);

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <Spinner size="sm" />
      </div>
    );
  }

  if (!data?.chart?.price_series) {
    return (
      <p className="py-4 text-center text-xs text-text-secondary">
        No hay datos de gráfico disponibles.
      </p>
    );
  }

  const { price_series, regression, band_1_upper, band_1_lower, sma200 } =
    data.chart;

  // Merge all series by date
  const merged = price_series.map((p) => {
    const date = p.date;
    const entry: Record<string, number | string> = {
      date,
      price: p.price,
    };
    const regPt = regression?.find((r) => r.date === date);
    if (regPt) entry.regression = regPt.value;
    const b1u = band_1_upper?.find((r) => r.date === date);
    if (b1u) entry.band_upper = b1u.value;
    const b1l = band_1_lower?.find((r) => r.date === date);
    if (b1l) entry.band_lower = b1l.value;
    const smaP = sma200?.find((r) => r.date === date);
    if (smaP) entry.sma200 = smaP.value;
    return entry;
  });

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={merged}>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "#999" }}
            tickFormatter={(v: string) => v.slice(5)}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#999" }}
            domain={["auto", "auto"]}
            width={50}
          />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            wrapperStyle={CHART_TOOLTIP_WRAPPER_STYLE}
          />
          <Line
            dataKey="price"
            stroke="#4ca1af"
            dot={false}
            strokeWidth={2}
            name="Precio"
          />
          {regression && (
            <Line
              dataKey="regression"
              stroke="#ff9a9e"
              dot={false}
              strokeWidth={1}
              strokeDasharray="4 4"
              name="Regresión"
            />
          )}
          {band_1_upper && (
            <Line
              dataKey="band_upper"
              stroke="rgba(255,255,255,0.15)"
              dot={false}
              strokeWidth={1}
              name="+1σ"
            />
          )}
          {band_1_lower && (
            <Line
              dataKey="band_lower"
              stroke="rgba(255,255,255,0.15)"
              dot={false}
              strokeWidth={1}
              name="-1σ"
            />
          )}
          {sma200 && (
            <Line
              dataKey="sma200"
              stroke="#fbc2eb"
              dot={false}
              strokeWidth={1}
              strokeDasharray="3 3"
              name="SMA 200"
            />
          )}
          {data.chart.pullback_levels &&
            Object.entries(data.chart.pullback_levels).map(([label, val]) => (
              <ReferenceLine
                key={label}
                y={val}
                stroke="rgba(255,200,0,0.3)"
                strokeDasharray="3 3"
                label={{
                  value: label,
                  fontSize: 9,
                  fill: "rgba(255,200,0,0.5)",
                }}
              />
            ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
