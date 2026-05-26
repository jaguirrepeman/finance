import { memo, useMemo, useState, useEffect } from "react";
import { Calendar, ZoomIn, RotateCcw } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
} from "recharts";
import { fmtDate } from "@/lib/format";
import { CHART_TOOLTIP_STYLE, CHART_TOOLTIP_WRAPPER_STYLE, PORTFOLIO_KEY, downsample } from "@/lib/chart";
import { normalize } from "../lib/evolution-utils";

interface GrowthTooltipProps {
  active?: boolean;
  // recharts passes payload as array of data entries; typed loosely to avoid version mismatch
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[];
  label?: string | number;
  fundColorMap: Record<string, string>;
}

function GrowthTooltipContent({ active, payload, label, fundColorMap }: GrowthTooltipProps) {
  if (!active || !payload?.length) return null;

  const sorted = [...payload]
    .filter((p) => p.value != null)
    .sort((a, b) => (b.value as number) - (a.value as number));

  return (
    <div style={{ ...CHART_TOOLTIP_STYLE, minWidth: 180 }}>
      <div style={{ color: "hsl(0,0%,70%)", marginBottom: 6, fontSize: 10 }}>
        {fmtDate(String(label))}
      </div>
      {sorted.map((entry) => {
        const v = Number(entry.value);
        const name = String(entry.dataKey ?? entry.name ?? "");
        const color = fundColorMap[name] ?? entry.color ?? "#888";
        const isPositive = v >= 0;
        return (
          <div key={name} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
            <span
              style={{
                display: "inline-block",
                width: 10,
                height: 10,
                borderRadius: "50%",
                backgroundColor: color,
                flexShrink: 0,
              }}
            />
            <span
              style={{
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: 140,
                color: "hsl(0,0%,80%)",
                fontSize: 10,
              }}
              title={name}
            >
              {name.length > 22 ? `${name.slice(0, 20)}…` : name}
            </span>
            <strong style={{ color: isPositive ? "#34d399" : "#f87171", fontSize: 11, flexShrink: 0 }}>
              {isPositive ? "+" : ""}{v.toFixed(2)}%
            </strong>
          </div>
        );
      })}
    </div>
  );
}

interface GrowthChartProps {
  datasets: Record<string, Array<{ date: string; price: number }>>;
  activeFunds: string[];
  fundColorMap: Record<string, string>;
  start: Date;
  end: Date;
  /** Controlled zoom state lifted to parent so correlations/metrics react to it */
  zoomLeft: string | null;
  zoomRight: string | null;
  onZoomChange: (left: string, right: string) => void;
  onZoomReset: () => void;
}


export function GrowthChartInner({
  datasets,
  activeFunds,
  fundColorMap,
  start,
  end,
  zoomLeft,
  zoomRight,
  onZoomChange,
  onZoomReset,
}: GrowthChartProps) {
  // ── Zoom selection state (internal, only during drag) ───────────────────
  const [refAreaLeft, setRefAreaLeft] = useState<string>("");
  const [refAreaRight, setRefAreaRight] = useState<string>("");
  const [isSelecting, setIsSelecting] = useState(false);

  // Reset zoom whenever the parent-level period changes
  useEffect(() => {
    onZoomReset();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleMouseDown = (e: any) => {
    if (e?.activeLabel) {
      setRefAreaLeft(e.activeLabel as string);
      setIsSelecting(true);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleMouseMove = (e: any) => {
    if (isSelecting && e?.activeLabel) {
      setRefAreaRight(e.activeLabel as string);
    }
  };

  const handleMouseUp = () => {
    if (!isSelecting) return;
    setIsSelecting(false);
    if (refAreaLeft && refAreaRight && refAreaLeft !== refAreaRight) {
      const [left, right] = [refAreaLeft, refAreaRight].sort();
      onZoomChange(left, right);
    }
    setRefAreaLeft("");
    setRefAreaRight("");
  };

  const { chartData, activeKeys, commonStart } = useMemo(() => {
    // Compute common start = max first-date across all active funds within [start,end]
    // so all series start from the same point and are truly comparable.
    let commonStart = start;
    for (const fund of activeFunds) {
      const series = datasets[fund];
      if (!series?.length) continue;
      const firstInRange = series.find((p) => new Date(p.date) >= start);
      if (firstInRange) {
        const d = new Date(firstInRange.date);
        if (d > commonStart) commonStart = d;
      }
    }

    // Normalize each fund series to base-100 change from commonStart
    const normalized: Record<string, Array<{ date: string; value: number }>> =
      {};
    const keys: string[] = [];

    for (const fund of activeFunds) {
      const series = datasets[fund];
      if (!series?.length) continue;
      const norm = normalize(series, commonStart, end);
      if (norm.length) {
        normalized[fund] = norm;
        keys.push(fund);
      }
    }

    // Merge all fund series into a single array keyed by date
    const dateMap = new Map<string, Record<string, number>>();
    for (const fund of keys) {
      for (const pt of normalized[fund]) {
        const row = dateMap.get(pt.date) ?? {};
        row[fund] = pt.value;
        dateMap.set(pt.date, row);
      }
    }

    const merged = [...dateMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, values]) => ({ date, ...values }));

    return { chartData: downsample(merged), activeKeys: keys, commonStart };
  }, [datasets, activeFunds, start, end]);

  if (!chartData.length) {
    return (
      <div className="py-8 text-center text-sm text-text-secondary">
        No hay datos para el período seleccionado.
      </div>
    );
  }

  // Filter chartData to the zoomed window (or show all)
  const displayData =
    zoomLeft && zoomRight
      ? chartData.filter((d) => d.date >= zoomLeft! && d.date <= zoomRight!)
      : chartData;

  const isZoomed = Boolean(zoomLeft && zoomRight);

  // Put portfolio line last so it renders on top (appears visually above other lines)
  const sortedKeys = [
    ...activeKeys.filter((k) => k !== PORTFOLIO_KEY),
    ...activeKeys.filter((k) => k === PORTFOLIO_KEY),
  ];
  // Legend order: respect activeFunds order (portfolio shown by its position)
  const legendKeys = activeKeys;

  return (
    <div className="glass-panel p-5">
      {/* Legend + Reset Zoom */}
      <div className="mb-2 flex flex-wrap items-center gap-3">
        {legendKeys.map((fund) => {
          const lastPt = chartData.findLast(
            (row) => (row as Record<string, unknown>)[fund] != null,
          );
          const lastVal =
            lastPt != null
              ? (Number((lastPt as Record<string, unknown>)[fund]) || 0)
              : 0;
          return (
            <span key={fund} className="flex items-center gap-1.5 text-xs">
              <span
                className="inline-block h-2 w-3 rounded-sm"
                style={{ backgroundColor: fundColorMap[fund] }}
              />
              <span className="max-w-[180px] truncate">{fund}</span>
              <strong
                style={{
                  color: lastVal >= 0 ? "#34d399" : "#f87171",
                }}
              >
                {lastVal >= 0 ? "+" : ""}
                {lastVal.toFixed(1)}%
              </strong>
            </span>
          );
        })}
        {isZoomed && (
          <button
            onClick={onZoomReset}
            className="ml-auto flex items-center gap-1 rounded-full border border-accent-glow/50 bg-accent-glow/10 px-3 py-1 text-xs text-accent-glow transition-colors hover:bg-accent-glow/20"
            title="Restablecer zoom"
          >
            <RotateCcw className="size-3" />
            Reset zoom
          </button>
        )}
      </div>
      {/* Common start notice */}
      {activeKeys.length > 1 && (
        <p className="mb-1 text-[0.65rem] text-text-muted">
          <Calendar className="inline size-3 align-text-bottom mr-1" />Base 100 desde {commonStart.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })} — todos los fondos se comparan desde la fecha en que todos tienen histórico.
        </p>
      )}
      {!isZoomed && (
        <p className="mb-2 text-[0.6rem] text-text-muted flex items-center gap-1">
          <ZoomIn className="size-3" />
          Haz clic y arrastra en el gráfico para hacer zoom en un período.
        </p>
      )}

      <ResponsiveContainer width="100%" height={360}>
        <LineChart
          data={displayData}
          margin={{ top: 5, right: 10, left: 10, bottom: 0 }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          style={{ cursor: isSelecting ? "crosshair" : "default" }}
        >
          <XAxis
            dataKey="date"
            tick={{ fill: "hsl(220,20%,70%)", fontSize: 10 }}
            tickFormatter={(d: string) =>
              fmtDate(d, { month: "short", year: "2-digit" })
            }
            axisLine={false}
            tickLine={false}
            minTickGap={50}
          />
          <YAxis
            tick={{ fill: "hsl(220,20%,70%)", fontSize: 10 }}
            tickFormatter={(v: number) => `${v.toFixed(0)}%`}
            axisLine={false}
            tickLine={false}
            width={50}
          />
          <ReferenceLine y={0} stroke="hsla(220,20%,70%,0.3)" strokeDasharray="5 5" />
          {!isSelecting && (
            <Tooltip
              content={(props) => (
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                <GrowthTooltipContent {...(props as any)} fundColorMap={fundColorMap} />
              )}
              wrapperStyle={CHART_TOOLTIP_WRAPPER_STYLE}
            />
          )}
          {sortedKeys.map((fund) => (
            <Line
              key={fund}
              type="monotone"
              dataKey={fund}
              stroke={fundColorMap[fund] ?? "#888"}
              strokeWidth={fund === PORTFOLIO_KEY ? 3.5 : 1.5}
              dot={false}
              connectNulls
              isAnimationActive={!isSelecting}
              animationDuration={600}
              animationEasing="ease-out"
            />
          ))}
          {/* Selection reference area */}
          {isSelecting && refAreaLeft && refAreaRight && (
            <ReferenceArea
              x1={refAreaLeft}
              x2={refAreaRight}
              strokeOpacity={0.3}
              fill="hsla(220,100%,70%,0.15)"
              stroke="hsl(220,100%,70%)"
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export const GrowthChart = memo(GrowthChartInner);
