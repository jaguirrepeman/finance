import { MetricCard } from "@/components/ui";
import { fmtEur, fmtPct, signColor } from "@/lib/format";
import type { Fund } from "@/types";

interface KpiStripProps {
  funds: Fund[];
}

export function KpiStrip({ funds }: KpiStripProps) {
  const totalValor = funds.reduce((s, f) => s + (f.Valor_Actual ?? 0), 0);
  const totalInv = funds.reduce((s, f) => s + (f.Capital_Invertido ?? 0), 0);
  const totalGanAbs = totalValor - totalInv;
  const totalGanPct = totalInv > 0 ? (totalGanAbs / totalInv) * 100 : 0;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <MetricCard title="Patrimonio" value={fmtEur(totalValor)} valueClassName="text-accent-glow" />
      <MetricCard
        title="Capital Invertido"
        value={fmtEur(totalInv)}
        valueClassName="text-yellow-300"
      />
      <MetricCard
        title="Ganancia (€)"
        value={`${totalGanAbs >= 0 ? "+" : ""}${fmtEur(Math.abs(totalGanAbs))}`}
        valueClassName={signColor(totalGanAbs)}
      />
      <MetricCard title="Ganancia (%)" value={fmtPct(totalGanPct, 2)} valueClassName={signColor(totalGanPct)} />
    </div>
  );
}
