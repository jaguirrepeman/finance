import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { signColor, riskColor } from "@/lib/format";
import { PORTFOLIO_KEY } from "@/lib/chart";
import { computeFundMetrics } from "../lib/evolution-utils";

interface MetricsTableProps {
  datasets: Record<string, Array<{ date: string; price: number }>>;
  activeFunds: string[];
  fundColorMap: Record<string, string>;
  start: Date;
  end: Date;
  benchmarkKey?: string | null;
}

type SortField =
  | "natural"
  | "name"
  | "totalReturn"
  | "annReturn"
  | "vol"
  | "sharpe"
  | "maxDD"
  | "alpha"
  | "beta";

export function MetricsTable({
  datasets,
  activeFunds,
  fundColorMap,
  start,
  end,
  benchmarkKey,
}: MetricsTableProps) {
  const [sortField, setSortField] = useState<SortField>("natural");
  const [sortAsc, setSortAsc] = useState(false);

  const benchSeries = benchmarkKey ? datasets[benchmarkKey] : undefined;

  const rows = useMemo(() => {
    return activeFunds
      .map((fund) => {
        const series = datasets[fund];
        if (!series?.length) return null;
        const metrics = computeFundMetrics(series, start, end, benchSeries);
        if (!metrics) return null;
        return { fund, ...metrics };
      })
      .filter(Boolean) as Array<{
      fund: string;
      totalReturn: number;
      annReturn: number;
      vol: number;
      sharpe: number;
      maxDD: number;
      alpha: number | null;
      beta: number | null;
    }>;
  }, [datasets, activeFunds, start, end, benchSeries]);

  const sorted = useMemo(() => {
    // "natural": preserve activeFunds drag order
    if (sortField === "natural") {
      return [...rows].sort((a, b) => {
        const ai = activeFunds.indexOf(a.fund);
        const bi = activeFunds.indexOf(b.fund);
        return ai - bi;
      });
    }
    return [...rows].sort((a, b) => {
      if (sortField === "name") {
        return sortAsc
          ? a.fund.localeCompare(b.fund)
          : b.fund.localeCompare(a.fund);
      }
      const va = a[sortField] ?? -Infinity;
      const vb = b[sortField] ?? -Infinity;
      return sortAsc ? va - vb : vb - va;
    });
  }, [rows, sortField, sortAsc, activeFunds]);

  const toggleSort = (field: SortField) => {
    if (field === "natural") {
      setSortField("natural");
      return;
    }
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const hasBench = benchSeries && rows.some((r) => r.alpha != null);

  const fmt = (v: number | null, decimals = 2) =>
    v != null ? v.toFixed(decimals) : "—";

  const headers: Array<{ field: SortField; label: string }> = [
    { field: "name", label: "Fondo" },
    { field: "totalReturn", label: "Retorno" },
    { field: "annReturn", label: "CAGR" },
    { field: "vol", label: "Vol." },
    { field: "sharpe", label: "Sharpe" },
    { field: "maxDD", label: "Max DD" },
    ...(hasBench
      ? [
          { field: "alpha" as SortField, label: "α" },
          { field: "beta" as SortField, label: "β" },
        ]
      : []),
  ];

  return (
    <div className="glass-panel overflow-x-auto p-5">
      <h4 className="mb-4 text-sm font-semibold">
        📊 Métricas del Período
      </h4>
      <table className="w-full min-w-[600px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border-glass text-xs text-text-secondary">
            {headers.map((h) => (
              <th
                key={h.field}
                onClick={() => toggleSort(h.field)}
                className={cn(
                  "cursor-pointer pb-2 text-left font-semibold select-none",
                  h.field !== "name" && "text-right",
                  sortField === h.field && "text-accent-glow",
                )}
              >
                {h.label} {sortField === h.field ? (sortAsc ? "▲" : "▼") : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const isPortfolio = row.fund === PORTFOLIO_KEY;
            return (
              <tr
                key={row.fund}
                className={cn(
                  "border-b border-border-glass/30 transition-colors",
                  isPortfolio && "bg-yellow-400/5",
                )}
              >
                <td className="py-2 font-medium">
                  <span className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-2 w-2 rounded-sm"
                      style={{
                        backgroundColor: fundColorMap[row.fund] ?? "#888",
                      }}
                    />
                    <span
                      className={cn(
                        "max-w-[200px] truncate",
                        isPortfolio && "font-bold text-yellow-400",
                      )}
                    >
                      {row.fund}
                    </span>
                  </span>
                </td>
                <td
                  className={cn(
                    "py-2 text-right font-semibold tabular-nums",
                    signColor(row.totalReturn),
                  )}
                >
                  {row.totalReturn >= 0 ? "+" : ""}
                  {fmt(row.totalReturn)}%
                </td>
                <td
                  className={cn(
                    "py-2 text-right font-semibold tabular-nums",
                    signColor(row.annReturn),
                  )}
                >
                  {row.annReturn >= 0 ? "+" : ""}
                  {fmt(row.annReturn)}%
                </td>
                <td
                  className={cn(
                    "py-2 text-right tabular-nums",
                    riskColor(row.vol),
                  )}
                >
                  {fmt(row.vol)}%
                </td>
                <td
                  className={cn(
                    "py-2 text-right font-bold tabular-nums",
                    signColor(row.sharpe),
                  )}
                >
                  {fmt(row.sharpe)}
                </td>
                <td className="py-2 text-right tabular-nums text-red-400">
                  {fmt(row.maxDD)}%
                </td>
                {hasBench && (
                  <>
                    <td
                      className={cn(
                        "py-2 text-right tabular-nums",
                        signColor(row.alpha),
                      )}
                    >
                      {row.alpha != null
                        ? `${row.alpha >= 0 ? "+" : ""}${fmt(row.alpha)}`
                        : "—"}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {fmt(row.beta)}
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
