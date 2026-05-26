import { useState, useCallback } from "react";
import { FundSearchInput } from "@/components/ui";
import type { FundSearchResult } from "@/types";
import { useAddFund } from "../hooks";
import { useFavorites } from "@/features/portfolios/hooks";

const FUND_TYPES = [
  "INDEX",
  "VALUE",
  "SPECIALIZED",
  "RF",
  "ORO",
  "CRYPTO",
  "CASH",
] as const;

export function AddFundForm() {
  const addMut = useAddFund();
  const { data: favorites } = useFavorites();
  const [selectedFund, setSelectedFund] = useState<FundSearchResult | null>(null);
  const [form, setForm] = useState({
    TIPO: "INDEX" as string,
    Valor_Actual: "" as string | number,
    Capital_Invertido: "" as string | number,
  });

  const valorActual = Number(form.Valor_Actual) || 0;
  const capitalInvertido =
    form.Capital_Invertido === "" ? valorActual : Number(form.Capital_Invertido);

  const handleAdd = useCallback(async () => {
    if (!selectedFund) return;
    await addMut.mutateAsync({
      Fondo: selectedFund.name,
      TIPO: form.TIPO,
      Porcentaje: 0,
      ISIN: selectedFund.isin || undefined,
      Valor_Actual: valorActual || undefined,
      Capital_Invertido: capitalInvertido || undefined,
    });
    setSelectedFund(null);
    setForm({ TIPO: "INDEX", Valor_Actual: "", Capital_Invertido: "" });
  }, [form, addMut, valorActual, capitalInvertido, selectedFund]);

  return (
    <tr className="border-t border-accent-glow/20 bg-accent-glow/5">
      <td className="px-2 py-2">
        {selectedFund ? (
          <div className="flex items-start gap-1">
            <div className="flex-1 min-w-0">
              <div
                className="text-xs font-semibold text-white truncate"
                title={selectedFund.name}
              >
                {selectedFund.name}
              </div>
              <div className="text-[10px] text-text-secondary font-mono mt-0.5">
                {selectedFund.isin}
              </div>
            </div>
            <button
              onClick={() => setSelectedFund(null)}
              className="shrink-0 mt-0.5 text-text-secondary hover:text-white text-xs leading-none"
              title="Cambiar fondo"
            >
              ✕
            </button>
          </div>
        ) : (
          <FundSearchInput
            onSelect={setSelectedFund}
            placeholder="Buscar por nombre o ISIN…"
            className="w-full"
            favoriteIsins={(favorites ?? []).map((f) => f.isin)}
            favoritesData={favorites ?? []}
          />
        )}
      </td>
      <td className="px-2 py-2">
        <select
          value={form.TIPO}
          onChange={(e) => setForm({ ...form, TIPO: e.target.value })}
          className="rounded border border-border-glass bg-bg-glass px-2 py-1 text-xs text-white"
        >
          {FUND_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </td>
      {/* Peso column: not used for manual entry */}
      <td className="px-2 py-2 text-center text-xs text-text-secondary">—</td>
      {/* Valor Actual (€) */}
      <td className="px-2 py-2">
        <div className="flex items-center gap-1">
          <span className="text-xs text-text-secondary">€</span>
          <input
            type="number"
            value={form.Valor_Actual}
            onChange={(e) =>
              setForm({ ...form, Valor_Actual: e.target.value })
            }
            onFocus={(e) => e.target.select()}
            placeholder="Valor actual"
            min={0}
            step={0.01}
            className="w-28 rounded border border-border-glass bg-bg-glass px-2 py-1 text-right text-xs text-white placeholder:text-text-secondary"
          />
        </div>
      </td>
      {/* Capital Invertido (€, default = actual) */}
      <td className="px-2 py-2">
        <div className="flex items-center gap-1">
          <span className="text-xs text-text-secondary">€</span>
          <input
            type="number"
            value={form.Capital_Invertido}
            onChange={(e) =>
              setForm({ ...form, Capital_Invertido: e.target.value })
            }
            onFocus={(e) => e.target.select()}
            placeholder={valorActual > 0 ? String(valorActual) : "= Actual"}
            min={0}
            step={0.01}
            className="w-28 rounded border border-border-glass bg-bg-glass px-2 py-1 text-right text-xs text-white placeholder:text-text-secondary"
          />
        </div>
      </td>
      <td colSpan={3} />
      <td className="px-2 py-2 text-right">
        <button
          onClick={handleAdd}
          disabled={addMut.isPending || !selectedFund}
          className="rounded-md bg-accent-glow px-3 py-1 text-xs font-semibold text-black disabled:opacity-50"
        >
          {addMut.isPending ? "..." : "Añadir"}
        </button>
      </td>
    </tr>
  );
}
