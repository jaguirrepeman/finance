import { useState, useMemo } from "react";
import { TrendingUp, SlidersHorizontal } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { MetricCard, Spinner } from "@/components/ui";
import { fmtEur } from "@/lib/format";
import { CHART_TOOLTIP_STYLE, CHART_TOOLTIP_WRAPPER_STYLE } from "@/lib/chart";
import { useHistoryBatchForSim, useSummary } from "../hooks";

const LOOKBACKS = [
  { key: "3Y", label: "3 años", years: 3 },
  { key: "5Y", label: "5 años", years: 5 },
  { key: "10Y", label: "10 años", years: 10 },
  { key: "MAX", label: "Máximo", years: 0 },
] as const;

export function ProyeccionSubTab() {
  const { data: histData, isLoading: histLoading } = useHistoryBatchForSim();
  const { data: summaryData, isLoading: sumLoading } = useSummary();

  const [extraInversion, setExtraInversion] = useState(0);
  const [aporteAnual, setAporteAnual] = useState(0);
  const [years, setYears] = useState(10);
  const [sigma, setSigma] = useState(1);
  const [lookback, setLookback] = useState("5Y");
  const [inflacion, setInflacion] = useState(2.5);

  const isLoading = histLoading || sumLoading;

  // Compute portfolio CAGR & volatility from history_batch "Mi Cartera" series
  const stats = useMemo(() => {
    if (!histData?.series) return null;
    const portfolioKey = Object.keys(histData.series).find((k) =>
      k.includes("Mi Cartera"),
    );
    if (!portfolioKey) return null;

    let series = histData.series[portfolioKey];
    if (!series?.length) return null;

    // Apply lookback filter
    const lb = LOOKBACKS.find((l) => l.key === lookback);
    if (lb && lb.years > 0) {
      const cutoff = new Date(series[series.length - 1].date);
      cutoff.setFullYear(cutoff.getFullYear() - lb.years);
      series = series.filter((s) => new Date(s.date) >= cutoff);
    }

    if (series.length < 20) return null;

    const firstP = series[0].price;
    const lastP = series[series.length - 1].price;
    const daysSpan =
      (new Date(series[series.length - 1].date).getTime() -
        new Date(series[0].date).getTime()) /
      86_400_000;

    const cagr = (Math.pow(lastP / firstP, 365 / daysSpan) - 1) * 100;

    // volatility
    const logReturns: number[] = [];
    for (let i = 1; i < series.length; i++) {
      if (series[i - 1].price > 0) {
        logReturns.push(Math.log(series[i].price / series[i - 1].price));
      }
    }
    const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
    const variance =
      logReturns.reduce((s, r) => s + (r - mean) ** 2, 0) /
      (logReturns.length - 1);
    const vol = Math.sqrt(variance) * Math.sqrt(252) * 100;

    return { cagr, vol };
  }, [histData, lookback]);

  // Current portfolio value
  const currentValue = useMemo(() => {
    if (!summaryData?.funds) return 0;
    return summaryData.funds.reduce(
      (s, f) => s + (f.Valor_Actual ?? 0),
      0,
    );
  }, [summaryData]);

  // Generate projection data
  const projectionData = useMemo(() => {
    if (!stats) return [];
    const startVal = currentValue + extraInversion;
    const r = stats.cagr / 100;
    const volFrac = stats.vol / 100;
    const inflFrac = inflacion / 100;

    const data: Array<{
      year: number;
      base: number;
      optimistic: number;
      pessimistic: number;
      invested: number;
    }> = [];

    let invested = startVal;
    let base = startVal;
    let opt = startVal;
    let pess = startVal;

    for (let y = 0; y <= years; y++) {
      const realR = r - inflFrac;
      if (y > 0) {
        base = base * (1 + realR) + aporteAnual;
        opt = opt * (1 + realR + sigma * volFrac) + aporteAnual;
        pess = pess * (1 + realR - sigma * volFrac) + aporteAnual;
        invested += aporteAnual;
      }
      data.push({
        year: y,
        base: Math.max(base, 0),
        optimistic: Math.max(opt, 0),
        pessimistic: Math.max(pess, 0),
        invested,
      });
    }
    return data;
  }, [stats, currentValue, extraInversion, aporteAnual, years, sigma, inflacion]);

  const lastProjection = projectionData[projectionData.length - 1];

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="glass-panel p-5">
        <h4 className="mb-4 flex items-center gap-2 text-sm font-semibold"><SlidersHorizontal className="size-4 text-accent-glow" /> Parámetros de Proyección</h4>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {/* Numeric inputs */}
          <ControlInput
            label="Inversión extra (€)"
            value={extraInversion}
            onChange={setExtraInversion}
            min={0}
          />
          <ControlInput
            label="Aporte anual (€)"
            value={aporteAnual}
            onChange={setAporteAnual}
            min={0}
          />

          {/* Horizonte slider */}
          <SliderInput
            label="Horizonte (años)"
            value={years}
            onChange={(v) => setYears(Math.round(v))}
            min={1}
            max={50}
            step={1}
            format={(v) => `${Math.round(v)} años`}
          />

          {/* Bandas slider */}
          <SliderInput
            label="Bandas de incertidumbre (σ)"
            value={sigma}
            onChange={setSigma}
            min={0.5}
            max={3}
            step={0.5}
            format={(v) => `${v}σ`}
          />

          {/* Inflación slider */}
          <SliderInput
            label="Inflación anual (%)"
            value={inflacion}
            onChange={setInflacion}
            min={0}
            max={10}
            step={0.5}
            format={(v) => `${v.toFixed(1)}%`}
          />

          {/* Lookback slider */}
          <SliderInput
            label="Lookback histórico"
            value={LOOKBACKS.findIndex((l) => l.key === lookback)}
            onChange={(i) => setLookback(LOOKBACKS[i]?.key ?? "5Y")}
            min={0}
            max={LOOKBACKS.length - 1}
            step={1}
            format={(i) => LOOKBACKS[Math.round(i)]?.label ?? ""}
          />
        </div>
      </div>

      {/* Summary KPIs */}
      {stats && lastProjection && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <MetricCard
            title="Valor Inicial"
            value={fmtEur(currentValue + extraInversion)}
          />
          <MetricCard
            title="CAGR Histórico"
            value={`${stats.cagr.toFixed(1)}%`}
            valueClassName={stats.cagr >= 0 ? "text-green-400" : "text-red-400"}
          />
          <MetricCard
            title="Volatilidad"
            value={`${stats.vol.toFixed(1)}%`}
          />
          <MetricCard
            title="Proyección Base"
            value={fmtEur(lastProjection.base)}
            valueClassName="text-accent-glow"
          />
          <MetricCard
            title="Rango"
            value={`${fmtEur(lastProjection.pessimistic)} — ${fmtEur(lastProjection.optimistic)}`}
            valueClassName="text-sm"
          />
        </div>
      )}

      {/* Projection chart */}
      {projectionData.length > 0 && (
        <div className="glass-panel p-5">
          <h4 className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <TrendingUp className="size-4 text-accent-glow" />
            Proyección a {years} años (real, descontada inflación)
          </h4>
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={projectionData}>
              <defs>
                <linearGradient id="gradBand" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4aa2af" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#4aa2af" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="year"
                tick={{ fill: "hsl(220,20%,70%)", fontSize: 11 }}
                tickFormatter={(v: number) => `Año ${v}`}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "hsl(220,20%,70%)", fontSize: 10 }}
                tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`}
                axisLine={false}
                tickLine={false}
                width={55}
              />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                wrapperStyle={CHART_TOOLTIP_WRAPPER_STYLE}
                formatter={(value) => [fmtEur(Number(value)), ""]}
                labelFormatter={(label) => `Año ${label}`}
              />
              <Area
                type="monotone"
                dataKey="optimistic"
                stroke="hsla(160,60%,60%,0.4)"
                fill="url(#gradBand)"
                strokeDasharray="4 4"
                dot={false}
                name="Optimista"
              />
              <Area
                type="monotone"
                dataKey="pessimistic"
                stroke="hsla(0,60%,60%,0.4)"
                fillOpacity={0}
                strokeDasharray="4 4"
                dot={false}
                name="Pesimista"
              />
              <Area
                type="monotone"
                dataKey="invested"
                stroke="hsla(220,20%,70%,0.5)"
                fillOpacity={0}
                strokeDasharray="5 5"
                strokeWidth={1.5}
                dot={false}
                name="Invertido"
              />
              <Area
                type="monotone"
                dataKey="base"
                stroke="#4aa2af"
                fill="none"
                strokeWidth={2.5}
                dot={false}
                name="Base"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {!stats && (
        <div className="py-8 text-center text-sm text-text-secondary">
          No hay datos históricos suficientes para la proyección.
        </div>
      )}
    </div>
  );
}

function ControlInput({
  label,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs text-text-secondary">{label}</label>
      <input
        type="number"
        value={value === 0 ? "" : value}
        placeholder="0"
        onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
        onFocus={(e) => e.target.select()}
        min={min}
        max={max}
        step={step}
        className="w-full rounded-md border border-border-glass bg-bg-glass px-2.5 py-1.5 text-sm text-white tabular-nums focus:border-accent-glow focus:outline-none"
      />
    </div>
  );
}

function SliderInput({
  label,
  value,
  onChange,
  min,
  max,
  step,
  format,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="text-xs text-text-secondary">{label}</label>
        <span className="text-xs font-semibold text-accent-glow tabular-nums">
          {format(value)}
        </span>
      </div>
      <input
        type="range"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-border-glass accent-accent-glow"
      />
      <div className="mt-0.5 flex justify-between text-[0.6rem] text-text-muted">
        <span>{format(min)}</span>
        <span>{format(max)}</span>
      </div>
    </div>
  );
}
