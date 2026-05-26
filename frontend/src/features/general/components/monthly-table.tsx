import type { MonthlyData } from "@/types";
import { Calendar } from "lucide-react";
import { fmtEur, fmtPct, signColor } from "@/lib/format";
import { cn } from "@/lib/utils";

interface MonthlyTableProps {
  monthly: MonthlyData[];
}

export function MonthlyTable({ monthly }: MonthlyTableProps) {
  // Show last 24 months, most recent first
  const rows = [...monthly].reverse().slice(0, 24);

  return (
    <div className="glass-panel overflow-x-auto p-5">
      <h4 className="mb-1 flex items-center gap-2 text-sm font-semibold"><Calendar className="size-4 text-accent-glow" /> Resumen Mensual</h4>
      <p className="mb-3 text-xs text-text-secondary">
        <strong className="text-text-primary">MoM</strong> = cambio del{" "}
        <strong className="text-text-primary">patrimonio</strong> respecto al
        mes anterior (variación por mercado + nuevas aportaciones).
      </p>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border-glass text-text-secondary">
            <th className="pb-2 text-left">Mes</th>
            <th className="pb-2 text-right">Patrimonio</th>
            <th className="pb-2 text-right">Invertido</th>
            <th className="pb-2 text-right">Ganancia (€)</th>
            <th className="pb-2 text-right">Ganancia (%)</th>
            <th className="pb-2 text-right" title="Cambio del patrimonio vs mes anterior">
              MoM (€)
            </th>
            <th className="pb-2 text-right" title="Cambio del patrimonio vs mes anterior en porcentaje">
              MoM (%)
            </th>
            <th className="pb-2 text-right" title="Cambio de la ganancia (beneficio/pérdida) vs mes anterior">
              ΔGanancia (€)
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m, i) => {
            const prev = i < rows.length - 1 ? rows[i + 1] : null;
            const momPct =
              prev && prev.value > 0
                ? ((m.value - prev.value) / prev.value) * 100
                : m.mom ?? null;
            const momEur = prev != null ? m.value - prev.value : null;
            const deltaGain = prev != null ? m.gain - prev.gain : null;

            return (
              <tr
                key={m.month ?? m.date ?? i}
                className="border-b border-border-glass/20"
              >
                <td className="py-1.5 font-medium">
                  {m.month ?? m.label ?? m.date}
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {fmtEur(m.value)}
                </td>
                <td className="py-1.5 text-right tabular-nums text-text-secondary">
                  {fmtEur(m.invested)}
                </td>
                <td
                  className={cn(
                    "py-1.5 text-right font-semibold tabular-nums",
                    signColor(m.gain),
                  )}
                >
                  {fmtEur(m.gain)}
                </td>
                <td
                  className={cn(
                    "py-1.5 text-right font-semibold tabular-nums",
                    signColor(m.gain_pct),
                  )}
                >
                  {fmtPct(m.gain_pct, 1)}
                </td>
                <td
                  className={cn(
                    "py-1.5 text-right tabular-nums",
                    momEur != null ? signColor(momEur) : "text-text-secondary",
                  )}
                >
                  {momEur != null ? fmtEur(momEur) : "—"}
                </td>
                <td
                  className={cn(
                    "py-1.5 text-right tabular-nums",
                    momPct != null ? signColor(momPct) : "text-text-secondary",
                  )}
                >
                  {momPct != null ? fmtPct(momPct, 1) : "—"}
                </td>
                <td
                  className={cn(
                    "py-1.5 text-right tabular-nums",
                    deltaGain != null ? signColor(deltaGain) : "text-text-secondary",
                  )}
                >
                  {deltaGain != null ? fmtEur(deltaGain) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
