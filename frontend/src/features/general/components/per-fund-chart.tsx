import { memo, useState, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LineChart,
  Line,
} from "recharts";
import { fmtEur, fmtDate } from "@/lib/format";
import { CHART_COLORS_HEX } from "@/lib/colors";
import { CHART_TOOLTIP_STYLE, CHART_TOOLTIP_WRAPPER_STYLE, downsample } from "@/lib/chart";
import { PillToggle } from "@/components/ui";

const PERIOD_OPTIONS = [
  { key: "3M", label: "3M", months: 3 },
  { key: "6M", label: "6M", months: 6 },
  { key: "1Y", label: "1A", months: 12 },
  { key: "2Y", label: "2A", months: 24 },
  { key: "5Y", label: "5A", months: 60 },
  { key: "ALL", label: "MAX", months: 0 },
] as const;

interface PerFundChartProps {
  /** fund_name → [{date, value}] */
  funds: Record<string, Array<{ date: string; value: number }>>;
  /** fund_name → [{date, invested}] */
  investedPerFund?: Record<
    string,
    Array<{ date: string; invested: number }>
  >;
  /** ISIN or raw key → pretty display name */
  nameMap?: Record<string, string>;
}

function PerFundEvolutionChartInner({
  funds,
  investedPerFund,
  nameMap = {},
}: PerFundChartProps) {
  const fundNames = useMemo(() => Object.keys(funds), [funds]);
  const [period, setPeriod] = useState("ALL");
  const [mode, setMode] = useState<"stacked" | string>("stacked");
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const singleFund = mode !== "stacked" ? mode : null;

  // Merge all series into a single array of {date, FundA, FundB, ...}
  const chartData = useMemo(() => {
    const dateSet = new Set<string>();
    for (const series of Object.values(funds)) {
      for (const pt of series) dateSet.add(pt.date);
    }
    const dates = Array.from(dateSet).sort();

    // Period filter
    const opt = PERIOD_OPTIONS.find((p) => p.key === period);
    let filteredDates = dates;
    if (opt && opt.months > 0 && dates.length > 0) {
      const last = new Date(dates[dates.length - 1]);
      const cutoff = new Date(last);
      cutoff.setMonth(cutoff.getMonth() - opt.months);
      filteredDates = dates.filter((d) => new Date(d) >= cutoff);
    }

    // Build O(1) lookup maps per fund (instead of O(n) .find per date)
    const fundMaps = new Map<string, Map<string, number>>();
    for (const [name, series] of Object.entries(funds)) {
      fundMaps.set(name, new Map(series.map((p) => [p.date, p.value])));
    }

    // Invested map for single-fund mode
    const investedMap =
      singleFund && investedPerFund?.[singleFund]
        ? new Map(investedPerFund[singleFund].map((p) => [p.date, p.invested]))
        : null;

      return downsample(filteredDates.map((date) => {
      const entry: Record<string, number | string> = { date };
      for (const [name, map] of fundMaps) {
        const v = map.get(date);
        if (v != null) entry[name] = v;
      }
      if (investedMap) {
        const inv = investedMap.get(date);
        if (inv != null) entry["Invertido"] = inv;
      }
      return entry;
    }));
  }, [funds, investedPerFund, period, singleFund]);

  const toggleFund = (name: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  if (fundNames.length === 0) return null;

  return (
    <div className="glass-panel p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h4 className="text-sm font-semibold">
          📊 Evolución por Fondo
        </h4>
        <PillToggle
          options={PERIOD_OPTIONS}
          value={period}
          onChange={setPeriod}
        />
      </div>

      {/* Mode selector */}
      <PillToggle
        options={[
          { key: "stacked", label: "Apilado" },
          ...fundNames.map((n) => ({
            key: n,
            label: nameMap[n] ?? n,
            title: nameMap[n] ? `${nameMap[n]} (${n})` : n,
            className: "max-w-[160px] truncate",
          })),
        ]}
        value={mode}
        onChange={setMode}
        variant="outlined"
        className="mb-3"
      />

      {/* Chart */}
      <ResponsiveContainer width="100%" height={300}>
        {singleFund ? (
          <LineChart
            data={chartData}
            margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
          >
            <XAxis
              dataKey="date"
              tick={{ fill: "#999", fontSize: 10 }}
              tickFormatter={(d: string) =>
                fmtDate(d, { month: "short", year: "2-digit" })
              }
              axisLine={false}
              tickLine={false}
              minTickGap={40}
            />
            <YAxis
              tick={{ fill: "#999", fontSize: 10 }}
              tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`}
              axisLine={false}
              tickLine={false}
              width={48}
            />
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              wrapperStyle={CHART_TOOLTIP_WRAPPER_STYLE}
              formatter={(value, name) => [fmtEur(Number(value)), nameMap[name as string] ?? name]}
              labelFormatter={(l) => fmtDate(String(l))}
            />
            <Line
              dataKey={singleFund}
              stroke="#4ca1af"
              dot={false}
              strokeWidth={2}
              name={nameMap[singleFund] ?? singleFund}
              isAnimationActive
            />
            {investedPerFund?.[singleFund] && (
              <Line
                dataKey="Invertido"
                stroke="#ff9a9e"
                dot={false}
                strokeWidth={1.5}
                strokeDasharray="5 5"
                name="Invertido"
                isAnimationActive={false}
              />
            )}
          </LineChart>
        ) : (
          <AreaChart
            data={chartData}
            margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
          >
            <XAxis
              dataKey="date"
              tick={{ fill: "#999", fontSize: 10 }}
              tickFormatter={(d: string) =>
                fmtDate(d, { month: "short", year: "2-digit" })
              }
              axisLine={false}
              tickLine={false}
              minTickGap={40}
            />
            <YAxis
              tick={{ fill: "#999", fontSize: 10 }}
              tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`}
              axisLine={false}
              tickLine={false}
              width={48}
            />
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              wrapperStyle={CHART_TOOLTIP_WRAPPER_STYLE}
              formatter={(value, name) => [fmtEur(Number(value)), nameMap[name as string] ?? name]}
              labelFormatter={(l) => fmtDate(String(l))}
            />
            <Legend
              wrapperStyle={{ fontSize: 10, cursor: "pointer" }}
              formatter={(value: string) => nameMap[value] ?? value}
              onClick={(e) => {
                if (typeof e.value === "string") toggleFund(e.value);
              }}
            />
            {fundNames.map((name, i) =>
              hidden.has(name) ? null : (
                <Area
                  key={name}
                  type="monotone"
                  dataKey={name}
                  stackId="1"
                  stroke={CHART_COLORS_HEX[i % CHART_COLORS_HEX.length]}
                  fill={CHART_COLORS_HEX[i % CHART_COLORS_HEX.length]}
                  fillOpacity={0.5}
                  strokeOpacity={1}
                  strokeWidth={1.5}
                  dot={false}
                  name={name}
                  isAnimationActive
                />
              )
            )}
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

export const PerFundEvolutionChart = memo(PerFundEvolutionChartInner);
