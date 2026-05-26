import { useState, useMemo } from "react";
import { Wallet } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { fmtEur } from "@/lib/format";
import { CHART_TOOLTIP_STYLE, CHART_TOOLTIP_WRAPPER_STYLE } from "@/lib/chart";
import { PillToggle } from "@/components/ui";
import type { OrdersSummaryResponse } from "@/types";

interface OrdersChartProps {
  data: OrdersSummaryResponse;
}

export function OrdersSummaryChart({ data }: OrdersChartProps) {
  const [view, setView] = useState<"monthly" | "yearly">("monthly");

  const chartData = useMemo(() => {
    const source =
      view === "monthly" ? data.monthly : data.yearly;
    return Object.entries(source)
      .map(([label, amount]) => ({ label, amount }))
      .sort((a, b) => (a.label < b.label ? -1 : 1));
  }, [data, view]);

  const total = chartData.reduce((s, d) => s + d.amount, 0);

  if (chartData.length === 0) return null;

  return (
    <div className="glass-panel p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
            <Wallet className="size-4 text-accent-glow" />
            Capital Aportado
          </h4>
          <p className="mt-0.5 text-xs text-text-secondary">
            <span>Total: </span>
            <strong className="text-accent-glow">{fmtEur(total)}</strong>
          </p>
        </div>
        <PillToggle
          options={[
            { key: "monthly", label: "Mensual" },
            { key: "yearly", label: "Anual" },
          ]}
          value={view}
          onChange={(v) => setView(v as "monthly" | "yearly")}
        />
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <BarChart
          data={chartData}
          margin={{ top: 5, right: 10, left: 10, bottom: 0 }}
        >
          <XAxis
            dataKey="label"
            tick={{ fill: "#999", fontSize: 10 }}
            tickFormatter={(v: string) =>
              view === "monthly" ? v.slice(2) : v
            }
            axisLine={false}
            tickLine={false}
            interval={view === "monthly" ? "preserveStartEnd" : 0}
          />
          <YAxis
            tick={{ fill: "#999", fontSize: 10 }}
            tickFormatter={(v: number) =>
              v >= 1000 ? `${(v / 1000).toFixed(0)}K` : `${v}`
            }
            axisLine={false}
            tickLine={false}
            width={45}
          />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            wrapperStyle={CHART_TOOLTIP_WRAPPER_STYLE}
            labelStyle={{ color: "hsl(0,0%,90%)" }}
            itemStyle={{ color: "hsl(0,0%,82%)" }}
            formatter={(value) => [fmtEur(Number(value)), "Aportado"]}
          />
          <Bar dataKey="amount" radius={[3, 3, 0, 0]}>
            {chartData.map((_, i) => (
              <Cell
                key={i}
                fill="hsl(210, 100%, 65%)"
                fillOpacity={0.7}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
