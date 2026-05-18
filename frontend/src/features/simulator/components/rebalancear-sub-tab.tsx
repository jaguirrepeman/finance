import { useState } from "react";
import { FundSearchInput, Spinner } from "@/components/ui";
import { fmtEur } from "@/lib/format";
import { usePositions, useRebalance } from "../hooks";
import { useFavorites } from "@/features/portfolios/hooks";
import type { FundSearchResult } from "@/types";

interface Transfer {
  id: number;
  from_isin: string;
  from_name: string;
  to_isin: string;
  to_name: string;
  amount: number;
}

interface StandaloneAdd {
  id: number;
  isin: string;
  name: string;
  amount: number;
}

export function RebalancearSubTab() {
  const { data: posData, isLoading } = usePositions();
  const rebalanceMut = useRebalance();
  const { data: favorites } = useFavorites();

  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [standaloneAdds, setStandaloneAdds] = useState<StandaloneAdd[]>([]);
  const [nextId, setNextId] = useState(1);

  // Add transfer row
  const [fromIsin, setFromIsin] = useState("");
  const [toIsin, setToIsin] = useState("");
  const [toName, setToName] = useState("");
  const [transferAmt, setTransferAmt] = useState(0);
  const [addAmt, setAddAmt] = useState(0);

  const positions = posData?.positions ?? [];
  const portfolioIsins = positions.map((p) => p.ISIN);
  const favoriteIsins = (favorites ?? []).map((f) => f.isin);

  const handleAddTransfer = () => {
    if (!fromIsin || !toIsin || transferAmt <= 0) return;
    const fromName =
      positions.find((p) => p.ISIN === fromIsin)?.Fondo ?? fromIsin;
    setTransfers((prev) => [
      ...prev,
      {
        id: nextId,
        from_isin: fromIsin,
        from_name: fromName,
        to_isin: toIsin,
        to_name: toName || toIsin,
        amount: transferAmt,
      },
    ]);
    setNextId((n) => n + 1);
    setTransferAmt(0);
  };

  const handleSelectNewFund = (fund: FundSearchResult) => {
    setToIsin(fund.isin);
    setToName(fund.name);
  };

  const handleAddStandalone = (fund: FundSearchResult) => {
    if (addAmt <= 0) return;
    setStandaloneAdds((prev) => [
      ...prev,
      { id: nextId, isin: fund.isin, name: fund.name, amount: addAmt },
    ]);
    setNextId((n) => n + 1);
    setAddAmt(0);
  };

  const handleSimulate = () => {
    rebalanceMut.mutate({
      transfers: transfers.map((t) => ({
        from_isin: t.from_isin,
        to_isin: t.to_isin,
        amount: t.amount,
      })),
      standalone_adds: standaloneAdds.map((a) => ({
        isin: a.isin,
        name: a.name,
        amount: a.amount,
      })),
    });
  };

  const result = rebalanceMut.data;

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Current positions */}
      <div className="glass-panel overflow-x-auto p-5">
        <h4 className="mb-3 text-sm font-semibold">
          💼 Posiciones Actuales
        </h4>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-glass text-xs text-text-secondary">
              <th className="pb-2 text-left">Fondo</th>
              <th className="pb-2 text-right">Saldo</th>
              <th className="pb-2 text-right">Peso</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => (
              <tr key={p.ISIN} className="border-b border-border-glass/30">
                <td className="py-2">
                  <div className="font-medium">{p.Fondo}</div>
                  <div className="text-xs text-text-secondary">{p.ISIN}</div>
                </td>
                <td className="py-2 text-right tabular-nums">
                  {fmtEur(p.Valor_Actual ?? p.Capital_Invertido)}
                </td>
                <td className="py-2 text-right tabular-nums text-accent-glow">
                  {posData
                    ? (
                        ((p.Valor_Actual ?? p.Capital_Invertido) /
                          posData.total_value) *
                        100
                      ).toFixed(1)
                    : "—"}
                  %
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Transfer planner */}
      <div className="glass-panel space-y-4 p-5">
        <h4 className="text-sm font-semibold">🔄 Planificar Traspasos</h4>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs text-text-secondary">
              Origen
            </label>
            <select
              value={fromIsin}
              onChange={(e) => setFromIsin(e.target.value)}
              className="rounded-md border border-border-glass bg-bg-glass px-2 py-1.5 text-sm text-white"
            >
              <option value="">Seleccionar fondo...</option>
              {positions.map((p) => (
                <option key={p.ISIN} value={p.ISIN}>
                  {p.Fondo} ({fmtEur(p.Valor_Actual ?? 0)})
                </option>
              ))}
            </select>
          </div>

          <span className="pb-2 text-text-secondary">→</span>

          <div className="flex-1">
            <label className="mb-1 block text-xs text-text-secondary">
              Destino (buscar nuevo fondo)
            </label>
            {toIsin ? (
              <div className="flex items-center gap-2">
                <span className="text-sm">
                  {toName} ({toIsin})
                </span>
                <button
                  onClick={() => {
                    setToIsin("");
                    setToName("");
                  }}
                  className="text-xs text-red-400"
                >
                  ✕
                </button>
              </div>
            ) : (
              <FundSearchInput
                onSelect={handleSelectNewFund}
                portfolioIsins={portfolioIsins}
                favoriteIsins={favoriteIsins}
              />
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs text-text-secondary">
              Importe (€)
            </label>
            <input
              type="number"
              value={transferAmt || ""}
              onChange={(e) => setTransferAmt(Number(e.target.value))}
              className="w-28 rounded-md border border-border-glass bg-bg-glass px-2 py-1.5 text-sm text-white"
              min={0}
            />
          </div>

          <button
            onClick={handleAddTransfer}
            disabled={!fromIsin || !toIsin || transferAmt <= 0}
            className="rounded-lg bg-accent-secondary px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            + Añadir
          </button>
        </div>
      </div>

      {/* Planned transfers list */}
      {transfers.length > 0 && (
        <div className="glass-panel p-5">
          <h4 className="mb-3 text-sm font-semibold">
            📋 Traspasos Planificados
          </h4>
          <div className="space-y-2">
            {transfers.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-3 rounded-lg border border-border-glass/50 bg-white/3 px-3 py-2 text-sm"
              >
                <span className="flex-1 truncate">{t.from_name}</span>
                <span className="text-text-secondary">→</span>
                <span className="flex-1 truncate">{t.to_name}</span>
                <span className="font-semibold text-accent-glow tabular-nums">
                  {fmtEur(t.amount)}
                </span>
                <button
                  onClick={() =>
                    setTransfers((prev) => prev.filter((x) => x.id !== t.id))
                  }
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Standalone adds */}
      <div className="glass-panel space-y-3 p-5">
        <h4 className="text-sm font-semibold">
          ➕ Aportaciones Adicionales
        </h4>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <FundSearchInput
              onSelect={handleAddStandalone}
              portfolioIsins={portfolioIsins}
              favoriteIsins={favoriteIsins}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-text-secondary">
              Importe (€)
            </label>
            <input
              type="number"
              value={addAmt || ""}
              onChange={(e) => setAddAmt(Number(e.target.value))}
              className="w-28 rounded-md border border-border-glass bg-bg-glass px-2 py-1.5 text-sm text-white"
              min={0}
            />
          </div>
        </div>
        {standaloneAdds.length > 0 && (
          <div className="mt-2 space-y-1">
            {standaloneAdds.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-3 text-sm"
              >
                <span className="flex-1 truncate">{a.name}</span>
                <span className="font-semibold text-accent-glow tabular-nums">
                  {fmtEur(a.amount)}
                </span>
                <button
                  onClick={() =>
                    setStandaloneAdds((prev) =>
                      prev.filter((x) => x.id !== a.id),
                    )
                  }
                  className="text-xs text-red-400"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Simulate button */}
      {(transfers.length > 0 || standaloneAdds.length > 0) && (
        <button
          onClick={handleSimulate}
          disabled={rebalanceMut.isPending}
          className="rounded-lg bg-accent-glow px-6 py-2.5 text-sm font-bold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {rebalanceMut.isPending ? "Simulando..." : "▶ Simular Rebalanceo"}
        </button>
      )}

      {/* Results */}
      {result?.positions_after && (
        <div className="glass-panel overflow-x-auto p-5">
          <h4 className="mb-3 text-sm font-semibold">
            📊 Resultado del Rebalanceo
          </h4>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-glass text-xs text-text-secondary">
                <th className="pb-2 text-left">Fondo</th>
                <th className="pb-2 text-right">Saldo Antes</th>
                <th className="pb-2 text-right">Saldo Después</th>
                <th className="pb-2 text-right">Peso Nuevo</th>
              </tr>
            </thead>
            <tbody>
              {result.positions_after.map((pos) => {
                const before = result.positions_before?.find(
                  (b) => b.isin === pos.isin,
                );
                return (
                  <tr
                    key={pos.isin}
                    className="border-b border-border-glass/30"
                  >
                    <td className="py-2 font-medium">{pos.fund}</td>
                    <td className="py-2 text-right tabular-nums text-text-secondary">
                      {before ? fmtEur(before.balance) : "—"}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {fmtEur(pos.balance)}
                    </td>
                    <td className="py-2 text-right font-semibold tabular-nums text-accent-glow">
                      {pos.weight.toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
