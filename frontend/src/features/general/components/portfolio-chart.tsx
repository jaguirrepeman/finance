import { memo, useMemo, useState } from "react";
import { TrendingUp } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { EvolutionPoint } from "@/types";
import { fmtEur, fmtDate } from "@/lib/format";
import { CHART_TOOLTIP_STYLE, CHART_TOOLTIP_WRAPPER_STYLE, downsample } from "@/lib/chart";
import { PillToggle } from "@/components/ui";

const PERIOD_OPTIONS = [
  { key: "3M", label: "3M", months: 3 },
  { key: "6M", label: "6M", months: 6 },
  { key: "1Y", label: "1A", months: 12 },
  { key: "2Y", label: "2A", months: 24 },
  { key: "ALL", label: "MAX", months: 0 },
] as const;

interface PortfolioChartProps {
  series: EvolutionPoint[];
}

export function PortfolioChartInner({ series }: PortfolioChartProps) {
  const [period, setPeriod] = useState<string>("ALL");

  const filtered = useMemo(() => {
    if (!series?.length) return [];
    const opt = PERIOD_OPTIONS.find((p) => p.key === period);
    if (!opt || opt.months === 0) return downsample(series);

    const last = new Date(series[series.length - 1].date);
    const cutoff = new Date(last);
    cutoff.setMonth(cutoff.getMonth() - opt.months);
    return downsample(series.filter((d) => new Date(d.date) >= cutoff));
  }, [series, period]);

  if (!filtered.length) {
    return (
      <div className="py-8 text-center text-sm text-text-secondary">
        Sin datos de evolución. Pulsa "Recalcular".
      </div>
    );
  }

  return (
    <div className="glass-panel p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 className="flex items-center gap-2 text-sm font-semibold">
            <TrendingUp className="size-4 text-accent-glow" />
            Evolución Real del Patrimonio
          </h4>
          <p className="mt-0.5 text-xs text-text-secondary">
            Basada en órdenes reales — NO en pesos objetivo
          </p>
        </div>
        <PillToggle
          options={PERIOD_OPTIONS}
          value={period}
          onChange={setPeriod}
        />
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <AreaChart
          data={filtered}
          margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
        >
          <defs>
            <linearGradient id="gradValue" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="5%"
                stopColor="hsl(210, 100%, 65%)"
                stopOpacity={0.3}
              />
              <stop
                offset="95%"
                stopColor="hsl(210, 100%, 65%)"
                stopOpacity={0}
              />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            tick={{ fill: "hsl(220, 20%, 70%)", fontSize: 10 }}
            tickFormatter={(d: string) =>
              fmtDate(d, { month: "short", year: "2-digit" })
            }
            axisLine={false}
            tickLine={false}
            minTickGap={40}
          />
          <YAxis
            tick={{ fill: "hsl(220, 20%, 70%)", fontSize: 10 }}
            tickFormatter={(v: number) =>
              `${(v / 1000).toFixed(0)}K`
            }
            axisLine={false}
            tickLine={false}
            width={50}
          />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            wrapperStyle={CHART_TOOLTIP_WRAPPER_STYLE}
            formatter={(value, name) => [
              fmtEur(Number(value)),
              name === "invested" ? "Invertido" : "Valor",
            ]}
            labelFormatter={(label) => fmtDate(String(label))}
          />
          <Area
            type="monotone"
            dataKey="invested"
            stroke="hsla(220, 20%, 70%, 0.5)"
            strokeDasharray="5 5"
            fillOpacity={0}
            strokeWidth={1.5}
            dot={false}
            name="invested"
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="hsl(210, 100%, 65%)"
            fill="url(#gradValue)"
            strokeWidth={2}
            dot={false}
            name="value"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export const PortfolioChart = memo(PortfolioChartInner);
