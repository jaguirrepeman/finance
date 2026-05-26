import { useMemo } from "react";
import { BarChart2 } from "lucide-react";
import type { Fund } from "@/types";
import { fmtEur, fmtPct, signColor } from "@/lib/format";
import { cn } from "@/lib/utils";

interface FundTableProps {
  funds: Fund[];
  lastDate?: string | null;
}

export function FundTable({ funds, lastDate }: FundTableProps) {
  const sorted = useMemo(
    () => [...funds].sort((a, b) => b.Porcentaje - a.Porcentaje),
    [funds],
  );

  const totalValor = funds.reduce((s, f) => s + (f.Valor_Actual ?? 0), 0);
  const totalInv = funds.reduce((s, f) => s + (f.Capital_Invertido ?? 0), 0);
  const totalGanAbs = funds.reduce((s, f) => s + (f.Ganancia_Abs ?? 0), 0);
  const totalGanPct = totalInv > 0 ? (totalGanAbs / totalInv) * 100 : 0;

  return (
    <div className="glass-panel p-6">
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold">Mi Cartera</h3>
          {lastDate && (
            <div className="mt-0.5 text-xs text-text-secondary">
              Datos a: <strong>{lastDate}</strong>
            </div>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border-glass text-left text-xs font-medium text-text-secondary">
              <th className="pb-3">Fondo / Activo</th>
              <th className="pb-3">Tipo</th>
              <th className="pb-3 text-right">Peso</th>
              <th className="pb-3 text-right">Valor Actual</th>
              <th className="pb-3 text-right">Invertido</th>
              <th className="pb-3 text-right">Ganancia (€)</th>
              <th className="pb-3 text-right">Ganancia (%)</th>
              <th className="pb-3 text-right">NAV</th>
              <th className="pb-3">Rating</th>
            </tr>
          </thead>
          <tbody>
            {/* TOTAL ROW */}
            <tr className="border-b-2 border-chart-1/30 bg-chart-1/8 font-bold">
              <td className="py-3 font-bold text-accent-glow">
                <span className="flex items-center gap-1.5">
                  <BarChart2 className="size-3.5" />
                  TOTAL CARTERA
                </span>
              </td>
              <td />
              <td className="py-3 text-right text-accent-glow">100%</td>
              <td className="py-3 text-right tabular-nums">
                {fmtEur(totalValor)}
              </td>
              <td className="py-3 text-right tabular-nums text-text-secondary">
                {fmtEur(totalInv)}
              </td>
              <td
                className={cn(
                  "py-3 text-right tabular-nums",
                  signColor(totalGanAbs),
                )}
              >
                {totalGanAbs >= 0 ? "+" : ""}
                {fmtEur(Math.abs(totalGanAbs))}
              </td>
              <td
                className={cn(
                  "py-3 text-right tabular-nums",
                  signColor(totalGanPct),
                )}
              >
                {fmtPct(totalGanPct, 1)}
              </td>
              <td />
              <td />
              <td />
            </tr>

            {/* FUND ROWS */}
            {sorted.map((fund, idx) => {
              const ganPct = fund.Ganancia_Pct;
              const ganAbs = fund.Ganancia_Abs;
              const finectUrl =
                fund.finect_url ??
                (fund.ISIN
                  ? `https://www.finect.com/fondos-inversion/${fund.ISIN}`
                  : undefined);

              return (
                <tr
                  key={fund.ISIN ?? idx}
                  className="border-b border-border-glass/30 transition-colors hover:text-accent-glow"
                >
                  <td className="py-3 font-medium">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "inline-block h-2 w-2 shrink-0 rounded-sm",
                          fund.IsIndex ? "bg-[#00d4aa]" : "bg-[#8b5cf6]",
                        )}
                        title={fund.IsIndex ? "Indexado" : "Activo"}
                      />
                      <span>{fund.Fondo}</span>
                    </div>
                    {fund.ISIN && (
                      <div className="ml-3.5 flex items-center gap-2">
                        <span className="text-xs text-text-secondary">
                          {fund.ISIN}
                        </span>
                        {finectUrl && (
                          <a
                            href={finectUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[0.68rem] text-accent-glow opacity-70 hover:opacity-100"
                            title="Ver en Finect"
                          >
                            ↗
                          </a>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="py-3">
                    <span className="rounded-md bg-border-glass px-2 py-0.5 text-xs">
                      {fund["Categoría"] ?? fund.TIPO}
                    </span>
                  </td>
                  <td className="py-3 text-right font-semibold text-accent-glow">
                    {fund.Porcentaje.toFixed(1)}%
                  </td>
                  <td className="py-3 text-right tabular-nums">
                    {fund.Valor_Actual != null ? fmtEur(fund.Valor_Actual) : "—"}
                  </td>
                  <td className="py-3 text-right tabular-nums text-text-secondary">
                    {fund.Capital_Invertido != null
                      ? fmtEur(fund.Capital_Invertido)
                      : "—"}
                  </td>
                  <td
                    className={cn(
                      "py-3 text-right font-semibold tabular-nums",
                      signColor(ganAbs),
                    )}
                  >
                    {ganAbs != null
                      ? `${ganAbs >= 0 ? "+" : ""}${fmtEur(Math.abs(ganAbs))}`
                      : "—"}
                  </td>
                  <td
                    className={cn(
                      "py-3 text-right font-semibold tabular-nums",
                      signColor(ganPct),
                    )}
                  >
                    {ganPct != null ? fmtPct(ganPct, 1) : "—"}
                  </td>
                  <td className="py-3 text-right font-bold tabular-nums">
                    {fund["NAV (Precio)"] ?? "—"}
                  </td>
                  <td className="py-3 text-accent-secondary">
                    {fund["Estrellas MS"] ?? "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
