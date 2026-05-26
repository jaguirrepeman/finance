import { useState } from "react";
import { Search, Scale } from "lucide-react";
import { FundSearchInput, MetricCard } from "@/components/ui";
import { fmtEur, signColor } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useSimulate } from "../hooks";
import { useFavorites } from "@/features/portfolios/hooks";
import type { FundSearchResult, FundDetail } from "@/types";
import { api } from "@/api/client";

export function AnadirFondoSubTab() {
  const { data: favorites } = useFavorites();
  const [selectedFund, setSelectedFund] = useState<FundSearchResult | null>(
    null,
  );
  const [fundDetail, setFundDetail] = useState<FundDetail | null>(null);
  const [amount, setAmount] = useState(1000);
  const simulateMut = useSimulate();

  const handleSelect = async (fund: FundSearchResult) => {
    setSelectedFund(fund);
    setFundDetail(null);
    simulateMut.reset();
    try {
      const detail = await api.getFundDetail(fund.isin);
      setFundDetail(detail);
    } catch {
      /* ignore */
    }
  };

  const handleSimulate = () => {
    if (!selectedFund) return;
    simulateMut.mutate({ isin: selectedFund.isin, amount });
  };

  const sim = simulateMut.data;

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="glass-panel space-y-4 p-5">
        <h4 className="flex items-center gap-2 text-sm font-semibold"><Search className="size-4 text-accent-glow" /> Buscar fondo para añadir</h4>
        <FundSearchInput
          onSelect={handleSelect}
          favoriteIsins={(favorites ?? []).map((f) => f.isin)}
          favoritesData={favorites ?? []}
        />

        {selectedFund && (
          <div className="mt-4 rounded-lg border border-border-glass bg-white/3 p-4">
            <div className="mb-2 font-semibold">{selectedFund.name}</div>
            <div className="mb-3 text-xs text-text-secondary">
              {selectedFund.isin}
              {selectedFund.category && ` · ${selectedFund.category}`}
            </div>

            {/* Fund detail badges */}
            {fundDetail && (
              <div className="mb-4 flex flex-wrap gap-2">
                {fundDetail.category && (
                  <Badge>{fundDetail.category}</Badge>
                )}
                {fundDetail.expense_ratio != null && (
                  <Badge>TER: {fundDetail.expense_ratio}%</Badge>
                )}
                {fundDetail.srri != null && (
                  <Badge>SRRI: {fundDetail.srri}/7</Badge>
                )}
                {fundDetail.metrics?.sharpe_ratio != null && (
                  <Badge>
                    Sharpe: {fundDetail.metrics.sharpe_ratio.toFixed(2)}
                  </Badge>
                )}
                {fundDetail.metrics?.alpha != null && (
                  <Badge>
                    Alpha: {fundDetail.metrics.alpha.toFixed(2)}
                  </Badge>
                )}
              </div>
            )}

            {/* Amount + simulate */}
            <div className="flex items-end gap-3">
              <div>
                <label className="mb-1 block text-xs text-text-secondary">
                  Importe (€)
                </label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className="w-32 rounded-md border border-border-glass bg-bg-glass px-3 py-1.5 text-sm text-white"
                  min={0}
                />
              </div>
              <button
                onClick={handleSimulate}
                disabled={simulateMut.isPending}
                className="rounded-lg bg-accent-glow px-4 py-2 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {simulateMut.isPending ? "Simulando..." : "▶ Simular"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Simulation results */}
      {sim && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <MetricCard
              title="Total actual"
              value={fmtEur(sim.current_total)}
            />
            <MetricCard
              title="Aportación"
              value={fmtEur(sim.contribution)}
              valueClassName="text-accent-glow"
            />
            <MetricCard
              title="Total simulado"
              value={fmtEur(sim.updated_total)}
              valueClassName="text-green-400"
            />
          </div>

          {/* Weight changes */}
          {sim.weight_changes && sim.weight_changes.length > 0 && (
            <WeightChanges changes={sim.weight_changes} />
          )}
        </div>
      )}
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md bg-white/8 px-2.5 py-1 text-xs text-text-primary">
      {children}
    </span>
  );
}

function WeightChanges({
  changes,
}: {
  changes: Array<{ fund: string; before: number; after: number; diff: number }>;
}) {
  return (
    <div className="glass-panel overflow-x-auto p-5">
      <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Scale className="size-4 text-accent-glow" /> Cambios de Peso</h4>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border-glass text-xs text-text-secondary">
            <th className="pb-2 text-left">Fondo</th>
            <th className="pb-2 text-right">Antes</th>
            <th className="pb-2 text-right">Después</th>
            <th className="pb-2 text-right">Δ</th>
          </tr>
        </thead>
        <tbody>
          {changes.map((c) => (
            <tr
              key={c.fund}
              className="border-b border-border-glass/30"
            >
              <td className="py-2 font-medium">{c.fund}</td>
              <td className="py-2 text-right tabular-nums text-text-secondary">
                {c.before.toFixed(1)}%
              </td>
              <td className="py-2 text-right tabular-nums">
                {c.after.toFixed(1)}%
              </td>
              <td
                className={cn(
                  "py-2 text-right font-semibold tabular-nums",
                  signColor(c.diff),
                )}
              >
                {c.diff >= 0 ? "+" : ""}
                {c.diff.toFixed(1)}pp
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
