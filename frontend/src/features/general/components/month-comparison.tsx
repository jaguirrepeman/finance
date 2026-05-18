import { useState, useMemo } from "react";
import type { MonthlyData, RealEvolution } from "@/types";
import { fmtEur, fmtPct, signColor } from "@/lib/format";
import { cn } from "@/lib/utils";

interface MonthComparisonProps {
  evolution: RealEvolution;
}

export function MonthComparisonWidget({ evolution }: MonthComparisonProps) {
  const monthly = evolution.monthly;
  const monthLabels = useMemo(
    () => monthly.map((m) => m.month ?? m.label ?? m.date ?? ""),
    [monthly],
  );

  // Map from display label → ISO date (for matching monthly_per_fund series)
  const labelToDate = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of monthly) {
      const label = m.month ?? m.label ?? m.date ?? "";
      if (m.date) map[label] = m.date;
    }
    return map;
  }, [monthly]);

  const [monthA, setMonthA] = useState(
    monthLabels.length > 0 ? monthLabels[monthLabels.length - 1] : "",
  );
  const [monthB, setMonthB] = useState(
    monthLabels.length > 1 ? monthLabels[monthLabels.length - 2] : "",
  );
  const [showPerFund, setShowPerFund] = useState(false);

  const findMonth = (label: string): MonthlyData | undefined =>
    monthly.find(
      (m) =>
        (m.month ?? m.label ?? m.date) === label,
    );

  const a = findMonth(monthA);
  const b = findMonth(monthB);

  if (monthLabels.length < 2) return null;

  const rows = a && b
    ? [
        {
          label: "Patrimonio",
          va: a.value,
          vb: b.value,
        },
        {
          label: "Capital Invertido",
          va: a.invested,
          vb: b.invested,
        },
        {
          label: "Ganancia (€)",
          va: a.gain,
          vb: b.gain,
        },
        {
          label: "Ganancia (%)",
          va: a.gain_pct,
          vb: b.gain_pct,
          isPct: true,
        },
      ]
    : [];

  return (
    <div className="glass-panel p-5">
      <h4 className="mb-3 text-sm font-semibold">🔄 Comparación de Meses</h4>

      {/* Selectors */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs text-text-secondary">
            Mes A (Actual)
          </label>
          <select
            value={monthA}
            onChange={(e) => setMonthA(e.target.value)}
            className="w-full rounded border border-border-glass bg-bg-glass px-2 py-1.5 text-xs text-white"
          >
            {monthLabels.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-secondary">
            Mes B (Anterior)
          </label>
          <select
            value={monthB}
            onChange={(e) => setMonthB(e.target.value)}
            className="w-full rounded border border-border-glass bg-bg-glass px-2 py-1.5 text-xs text-white"
          >
            {monthLabels.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Comparison table */}
      {a && b && (
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border-glass text-text-secondary">
              <th className="pb-2 text-left">Métrica</th>
              <th className="pb-2 text-right">{monthA} (A)</th>
              <th className="pb-2 text-right">{monthB} (B)</th>
              <th className="pb-2 text-right">A−B</th>
              <th className="pb-2 text-right">Δ%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const delta = r.va - r.vb;
              const deltaPct =
                r.vb !== 0 ? (delta / Math.abs(r.vb)) * 100 : 0;

              return (
                <tr
                  key={r.label}
                  className="border-b border-border-glass/20"
                >
                  <td className="py-1.5 text-text-secondary">{r.label}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {r.isPct ? fmtPct(r.va, 1) : fmtEur(r.va)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {r.isPct ? fmtPct(r.vb, 1) : fmtEur(r.vb)}
                  </td>
                  <td
                    className={cn(
                      "py-1.5 text-right font-semibold tabular-nums",
                      signColor(delta),
                    )}
                  >
                    {r.isPct ? fmtPct(delta, 1) : fmtEur(delta)}
                  </td>
                  <td
                    className={cn(
                      "py-1.5 text-right tabular-nums",
                      signColor(deltaPct),
                    )}
                  >
                    {fmtPct(deltaPct, 1)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* Per-fund breakdown toggle */}
      {evolution.monthly_per_fund && (
        <button
          onClick={() => setShowPerFund(!showPerFund)}
          className="mt-3 text-xs text-accent-glow hover:underline"
        >
          {showPerFund ? "▲ Ocultar detalle" : "▼ Ver detalle por fondo"}
        </button>
      )}

      {showPerFund && evolution.monthly_per_fund && a && b && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="border-b border-border-glass text-text-secondary">
                <th className="pb-1 text-left">Fondo</th>
                <th className="pb-1 text-right">Valor A</th>
                <th className="pb-1 text-right">Valor B</th>
                <th className="pb-1 text-right">Δ</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(evolution.monthly_per_fund).map(
                ([fundName, series]) => {
                  // Match using ISO date (labelToDate) with fallback to label itself
                  const isoA = labelToDate[monthA] ?? monthA;
                  const isoB = labelToDate[monthB] ?? monthB;
                  const fa = series.find((s) => s.date === isoA);
                  const fb = series.find((s) => s.date === isoB);
                  const va = fa?.value ?? 0;
                  const vb = fb?.value ?? 0;
                  const d = va - vb;
                  if (va === 0 && vb === 0) return null;
                  return (
                    <tr
                      key={fundName}
                      className="border-b border-border-glass/20"
                    >
                      <td className="max-w-[140px] truncate py-1">
                        {fundName}
                      </td>
                      <td className="py-1 text-right tabular-nums">
                        {fmtEur(va)}
                      </td>
                      <td className="py-1 text-right tabular-nums">
                        {fmtEur(vb)}
                      </td>
                      <td
                        className={cn(
                          "py-1 text-right font-semibold tabular-nums",
                          signColor(d),
                        )}
                      >
                        {fmtEur(d)}
                      </td>
                    </tr>
                  );
                },
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
