import { useState, useMemo } from "react";
import { BarChart2, Wallet, Scissors, RefreshCw, Euro, ClipboardList, Lightbulb, HelpCircle, AlertTriangle } from "lucide-react";
import { Spinner, MetricCard } from "@/components/ui";
import { fmtEur, signColor } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  useTraspasoAnalysis,
  useTraspasoOptimize,
  useTaxOptimize,
} from "./hooks";

/* ── Grouping helpers ─────────────────────────────────────────────── */

interface LotRecord {
  ISIN?: string;
  Fondo?: string;
  fondo?: string;
  Fecha_Compra?: string;
  fecha_compra?: string;
  Participaciones?: number;
  Importe?: number;
  Importe_Traspasado?: number;
  Ganancia_Patrimonial?: number;
  Plusvalia_Diferida?: number;
  es_etf?: boolean;
  nota?: string;
  Nota?: string;
  Destination_ISIN?: string;
  Destination_Fondo?: string;
  [key: string]: unknown;
}

interface FundGroup {
  isin: string;
  name: string;
  isEtf: boolean;
  totalAmount: number;
  totalGain: number;
  totalPlusvaliaDiferida: number;
  lots: LotRecord[];
}

function groupByFund(lots: LotRecord[]): FundGroup[] {
  const map = new Map<string, FundGroup>();
  for (const lot of lots) {
    const isin = String(lot.ISIN ?? "");
    const name = String(lot.Fondo ?? lot.fondo ?? isin);
    if (!map.has(isin)) {
      map.set(isin, {
        isin,
        name,
        isEtf: Boolean(lot.es_etf),
        totalAmount: 0,
        totalGain: 0,
        totalPlusvaliaDiferida: 0,
        lots: [],
      });
    }
    const g = map.get(isin)!;
    g.totalAmount += Number(lot.Importe ?? lot.Importe_Traspasado ?? 0);
    g.totalGain += Number(lot.Ganancia_Patrimonial ?? 0);
    g.totalPlusvaliaDiferida += Number(lot.Plusvalia_Diferida ?? 0);
    g.lots.push(lot);
  }
  // ETFs first, then by amount desc
  return [...map.values()].sort(
    (a, b) => Number(b.isEtf) - Number(a.isEtf) || b.totalAmount - a.totalAmount,
  );
}

function ExpandableFundGroup({
  group,
  variant,
}: {
  group: FundGroup;
  variant: "reembolso" | "traspaso";
}) {
  const [open, setOpen] = useState(false);
  const borderCls =
    group.isEtf
      ? "border-orange-400/25 bg-orange-400/5"
      : variant === "traspaso"
        ? "border-accent-glow/20 bg-accent-glow/5"
        : "border-border-glass bg-white/3";

  return (
    <div className={cn("rounded-lg border p-3 text-xs", borderCls)}>
      {/* Summary row */}
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">{group.name}</span>
          {group.isEtf && (
            <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase bg-orange-400/15 text-orange-400 border border-orange-400/30">
              ETF/ETP
            </span>
          )}
          <span className="text-text-secondary">
            ({group.lots.length} {group.lots.length === 1 ? "lote" : "lotes"})
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="tabular-nums font-semibold">{fmtEur(group.totalAmount)}</span>
          {variant === "reembolso" && (
            <span className={cn("tabular-nums font-semibold", signColor(group.totalGain))}>
              {fmtEur(group.totalGain)}
            </span>
          )}
          {variant === "traspaso" && group.totalPlusvaliaDiferida !== 0 && (
            <span className="tabular-nums text-yellow-400">
              Diferida: {fmtEur(group.totalPlusvaliaDiferida)}
            </span>
          )}
          <span className="text-text-secondary text-[10px]">{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {/* Expanded lot details */}
      {open && (
        <table className="mt-2 w-full text-xs">
          <thead>
            <tr className="border-b border-border-glass/50 text-text-secondary">
              <th className="pb-1 text-left">Fecha compra</th>
              <th className="pb-1 text-right">Participaciones</th>
              <th className="pb-1 text-right">Importe</th>
              {variant === "reembolso" && <th className="pb-1 text-right">Ganancia</th>}
              {variant === "traspaso" && <th className="pb-1 text-right">Plusvalía diferida</th>}
            </tr>
          </thead>
          <tbody>
            {group.lots.map((lot, i) => {
              const amount = Number(lot.Importe ?? lot.Importe_Traspasado ?? 0);
              return (
                <tr key={i} className="border-b border-border-glass/20">
                  <td className="py-1">{String(lot.Fecha_Compra ?? lot.fecha_compra ?? "—")}</td>
                  <td className="py-1 text-right tabular-nums">
                    {Number(lot.Participaciones ?? 0).toFixed(4)}
                  </td>
                  <td className="py-1 text-right tabular-nums">{fmtEur(amount)}</td>
                  {variant === "reembolso" && (
                    <td className={cn("py-1 text-right tabular-nums font-semibold", signColor(Number(lot.Ganancia_Patrimonial ?? 0)))}>
                      {fmtEur(Number(lot.Ganancia_Patrimonial ?? 0))}
                    </td>
                  )}
                  {variant === "traspaso" && (
                    <td className="py-1 text-right tabular-nums text-yellow-400">
                      {fmtEur(Number(lot.Plusvalia_Diferida ?? 0))}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function WithdrawalsTab() {
  const { data: analysis, isLoading: analysisLoading } = useTraspasoAnalysis();
  const traspasoMut = useTraspasoOptimize();
  const fifoMut = useTaxOptimize();

  const [targetAmount, setTargetAmount] = useState(5000);
  const [fifoAmount, setFifoAmount] = useState(5000);
  const [showExplainer, setShowExplainer] = useState(false);
  const [showFifoDetail, setShowFifoDetail] = useState(false);

  return (
    <div className="space-y-6">
      {/* Explainer section */}
      <div className="glass-panel p-5">
        <button
          onClick={() => setShowExplainer(!showExplainer)}
          className="flex w-full items-center justify-between text-left"
        >
          <h3 className="font-semibold"><HelpCircle className="inline size-4 align-text-bottom mr-1.5" /> ¿Cómo funciona?</h3>
          <span className="text-text-secondary">
            {showExplainer ? "▲" : "▼"}
          </span>
        </button>
        {showExplainer && (
          <div className="mt-4 space-y-3 text-sm text-text-secondary">
            <p>
              <strong className="text-text-primary">FIFO (First In, First Out):</strong>{" "}
              Al vender participaciones, se venden primero las más antiguas en orden
              cronológico estricto. Este es el orden que exige Hacienda sin planificación.
              La ganancia patrimonial tributa en el IRPF como renta del ahorro.
            </p>
            <p>
              <strong className="text-text-primary">Tramos IRPF 2024:</strong>{" "}
              19% (0–6.000€), 21% (6.000–50.000€), 23% (50.000–200.000€),
              27% (200.000–300.000€), 28% (+300.000€).
            </p>
            <p>
              <strong className="text-text-primary">Traspasos (Art. 94 LIRPF):</strong>{" "}
              Los traspasos entre fondos de inversión españoles/UCITS no tributan.
              Permite diferir la ganancia fiscal al mover el capital. Los ETFs NO son traspasables.
            </p>
            <p>
              <strong className="text-orange-400"><AlertTriangle className="inline size-3.5 align-text-bottom mr-1" />ETFs y ETPs (no traspasables):</strong>{" "}
              Los ETFs (iShares Bitcoin, Physical Gold, etc.) cotizan en bolsa y{" "}
              <strong>no se pueden traspasar</strong> según la legislación española.
              Solo pueden reembolsarse directamente, tributando siempre por la ganancia.
              El algoritmo los prioriza para vender cuando el porcentaje de ganancia es
              igual al de un fondo traspasable.
            </p>
            <p>
              <strong className="text-text-primary">Estrategia combinada:</strong>{" "}
              El optimizador NO respeta el orden cronológico puro. En su lugar, analiza
              todos los lotes por % de ganancia y elige inteligentemente cuáles vender
              (los de menor ganancia) y cuáles traspasar (los de mayor ganancia). Esto
              minimiza el impuesto total al aprovechar que los traspasos no tributan.
            </p>
          </div>
        )}
      </div>

      {/* Transfer analysis table */}
      <div className="glass-panel overflow-x-auto p-5">
        <h3 className="mb-1 flex items-center gap-2 font-semibold">
          <RefreshCw className="size-4 text-accent-glow" />
          Análisis de Ganancia Latente por Fondo
        </h3>
        <p className="mb-4 text-xs text-text-secondary">
          Muestra cuánta ganancia acumulada tiene cada fondo y cuánto impuesto pagarías
          si vendieras ya. Los fondos con calificación ALTO son los mejores candidatos
          para <strong className="text-accent-glow">traspasar</strong> primero (no tributan).
        </p>
        {analysisLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : analysis && analysis.funds.length > 0 ? (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-glass text-xs text-text-secondary">
                  <th className="pb-2 text-left">Fondo</th>
                  <th className="pb-2 text-right">Valor</th>
                  <th className="pb-2 text-right">Ganancia Latente</th>
                  <th className="pb-2 text-right">Impuesto si Vende</th>
                  <th className="pb-2 text-right">Ahorro Traspaso</th>
                  <th className="pb-2 text-left">Calificación</th>
                </tr>
              </thead>
              <tbody>
                {analysis.funds.map((f) => (
                  <tr
                    key={f.isin}
                    className="border-b border-border-glass/30"
                  >
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{f.fund}</span>
                        {f.is_etf && (
                          <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase bg-orange-400/15 text-orange-400 border border-orange-400/30">
                            ETF/ETP
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-text-secondary">{f.isin}</div>
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {fmtEur(f.current_value)}
                    </td>
                    <td
                      className={cn(
                        "py-2 text-right font-semibold tabular-nums",
                        signColor(f.latent_gain),
                      )}
                    >
                      {fmtEur(f.latent_gain)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-red-400">
                      {fmtEur(f.tax_if_sold)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-green-400">
                      {f.is_etf ? (
                        <span className="text-orange-400">— No traspasable</span>
                      ) : (
                        fmtEur(f.transfer_savings)
                      )}
                    </td>
                    <td className="py-2">
                      {f.is_etf ? (
                        <span className="rounded-md px-2 py-0.5 text-xs font-semibold bg-orange-400/15 text-orange-400">
                          No Traspasable
                        </span>
                      ) : (
                        <span
                          className={cn(
                            "rounded-md px-2 py-0.5 text-xs font-semibold",
                            f.qualification === "ALTO"
                              ? "bg-green-400/15 text-green-400"
                              : f.qualification === "MEDIO"
                                ? "bg-yellow-400/15 text-yellow-400"
                                : "bg-white/8 text-text-secondary",
                          )}
                        >
                          {f.qualification}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <MetricCard
                title="Ganancia Diferible"
                value={fmtEur(analysis.total_deferrable_gain)}
                valueClassName="text-accent-glow"
              />
              <MetricCard
                title="Ahorro Fiscal Potencial"
                value={fmtEur(analysis.total_tax_savings)}
                valueClassName="text-green-400"
              />
            </div>
          </>
        ) : (
          <p className="py-4 text-sm text-text-secondary">No hay datos de análisis disponibles.</p>
        )}
      </div>

      {/* Combined strategy: transfer + reimburse */}
      <div className="glass-panel space-y-4 p-5">
        <div>
          <h3 className="flex items-center gap-2 font-semibold">
            <Euro className="size-4 text-accent-glow" />
            Simulador de Retirada
          </h3>
          <p className="mt-1 text-sm text-text-secondary">
            Calcula el plan fiscal óptimo para retirar una cantidad: primero traspasa los lotes con
            más plusvalía acumulada a otro fondo (sin tributar, Art. 94 LIRPF), y luego reembolsa
            los lotes con menos ganancia. Se muestra una comparativa entre la{" "}
            <strong className="text-text-primary">venta directa FIFO</strong> y la{" "}
            <strong className="text-accent-glow">estrategia traspaso+reembolso</strong>, para
            que veas exactamente cuánto impuesto ahorras.
          </p>
        </div>
        <div className="flex items-end gap-3">
          <div>
            <label className="mb-1 block text-xs text-text-secondary">
              Importe a retirar (€)
            </label>
            <input
              type="number"
              value={targetAmount === 0 ? "" : targetAmount}
              placeholder="0"
              onChange={(e) => setTargetAmount(e.target.value === "" ? 0 : Number(e.target.value))}
              onFocus={(e) => e.target.select()}
              className="w-40 rounded-md border border-border-glass bg-bg-glass px-3 py-1.5 text-sm text-white focus:border-accent-glow focus:outline-none"
              min={0}
            />
          </div>
          <button
            onClick={() => traspasoMut.mutate(targetAmount)}
            disabled={traspasoMut.isPending || targetAmount <= 0}
            className="rounded-lg bg-accent-glow px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
          >
            {traspasoMut.isPending ? "Calculando..." : "▶ Optimizar"}
          </button>
        </div>

        {traspasoMut.isError && (
          <div className="rounded-lg border border-red-400/30 bg-red-400/8 px-4 py-3 text-sm text-red-400">
            Error calculando el plan: {(traspasoMut.error as Error)?.message ?? "Error desconocido"}
          </div>
        )}
        {traspasoMut.data && (
          <TraspasoResult data={traspasoMut.data} />
        )}
      </div>

      {/* Simple FIFO withdrawal */}
      <div className="glass-panel space-y-4 p-5">
        <div>
          <h3 className="flex items-center gap-2 font-semibold">
            <BarChart2 className="size-4 text-accent-glow" />
            Reembolso Directo sin Estrategia (FIFO puro)
          </h3>
          <p className="mt-1 text-xs text-text-secondary">
            Vende directamente los lotes más antiguos primero (normativa FIFO), sin ninguna
            optimización previa. Útil para comparar cuánto pagarías de IRPF si no usas traspasos.
            Usa el simulador de arriba para ver cuánto ahorras con la estrategia combinada.
          </p>
        </div>
        <div className="flex items-end gap-3">
          <div>
            <label className="mb-1 block text-xs text-text-secondary">
              Importe a retirar (€)
            </label>
            <input
              type="number"
              value={fifoAmount === 0 ? "" : fifoAmount}
              placeholder="0"
              onChange={(e) => setFifoAmount(e.target.value === "" ? 0 : Number(e.target.value))}
              onFocus={(e) => e.target.select()}
              className="w-40 rounded-md border border-border-glass bg-bg-glass px-3 py-1.5 text-sm text-white focus:border-accent-glow focus:outline-none"
              min={0}
            />
          </div>
          <button
            onClick={() => fifoMut.mutate(fifoAmount)}
            disabled={fifoMut.isPending || fifoAmount <= 0}
            className="rounded-lg bg-accent-secondary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {fifoMut.isPending ? "Calculando..." : "▶ Calcular FIFO"}
          </button>
        </div>

        {fifoMut.isError && (
          <div className="rounded-lg border border-red-400/30 bg-red-400/8 px-4 py-3 text-sm text-red-400">
            Error calculando el plan FIFO: {(fifoMut.error as Error)?.message ?? "Error desconocido"}
          </div>
        )}
        {fifoMut.data && <FifoResult data={fifoMut.data} showDetail={showFifoDetail} toggleDetail={() => setShowFifoDetail(!showFifoDetail)} />}
      </div>
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────────────── */

function TraspasoResult({
  data,
}: {
  data: import("@/types").TraspasoOptimizeResult;
}) {
  const savings = data.ahorro_fiscal ?? data.optimized?.savings ?? 0;
  const directo = data.escenario_directo ?? {
    ganancia_patrimonial: data.direct_fifo?.total_gain ?? 0,
    impuesto: data.direct_fifo?.tax ?? 0,
    neto_recibido: data.direct_fifo?.net ?? 0,
    detalle: [],
  };
  const optimizado = data.escenario_optimizado ?? {
    ganancia_patrimonial: data.optimized?.total_gain ?? 0,
    impuesto: data.optimized?.tax ?? 0,
    neto_recibido: data.optimized?.net ?? 0,
    detalle: [],
  };

  const traspasoGroups = useMemo(
    () => groupByFund((data.plan_traspasos ?? []) as LotRecord[]),
    [data.plan_traspasos],
  );
  const reembolsoGroups = useMemo(
    () => groupByFund((data.plan_reembolso ?? []) as LotRecord[]),
    [data.plan_reembolso],
  );

  const totalReembolsoLots = reembolsoGroups.reduce((s, g) => s + g.lots.length, 0);
  const totalTraspasoLots = traspasoGroups.reduce((s, g) => s + g.lots.length, 0);

  return (
    <div className="mt-4 space-y-4">
      {/* Warning: portfolio couldn't fully fund the requested withdrawal */}
      {(() => {
        const directWithdrawn = directo.withdrawn_amount ?? 0;
        const unfulfilled = data.target_amount - directWithdrawn;
        if (directWithdrawn > 0 && unfulfilled > 100) {
          return (
            <div className="rounded-lg border border-yellow-400/30 bg-yellow-400/8 px-4 py-3 text-sm">
              <p className="font-semibold text-yellow-400">
                <AlertTriangle className="inline size-3.5 align-text-bottom mr-1" />Liquidez insuficiente: solo se pueden retirar {fmtEur(directWithdrawn)}
              </p>
              <p className="mt-1 text-xs text-text-secondary">
                El portfolio no tiene suficientes activos con precio conocido para cubrir{" "}
                {fmtEur(data.target_amount)}. Los impuestos mostrados corresponden a la cantidad
                que sí se puede retirar ({fmtEur(directWithdrawn)}), no a la solicitada.
              </p>
            </div>
          );
        }
        return null;
      })()}

      {/* Comparison cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-red-400/20 bg-red-400/5 p-4">
          <h5 className="mb-2 text-xs font-semibold uppercase text-red-400">
            Venta Directa — FIFO Cronológico
          </h5>
          <p className="mb-2 text-[10px] text-text-secondary">
            Vende lotes en orden estricto de fecha de compra (sin planificación fiscal)
          </p>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-text-secondary">Ganancia</span>
              <span className="tabular-nums">
                {fmtEur(directo.ganancia_patrimonial)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">Impuesto</span>
              <span className="font-semibold text-red-400 tabular-nums">
                {fmtEur(directo.impuesto)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">Neto</span>
              <span className="font-semibold tabular-nums">
                {fmtEur(directo.neto_recibido)}
              </span>
            </div>
          </div>
          {/* Gain/loss breakdown */}
          {(directo.ganancias_brutas != null || directo.perdidas_brutas != null) && (
            <div className="mt-3 border-t border-red-400/10 pt-2 space-y-0.5 text-xs">
              <div className="flex justify-between">
                <span className="text-text-secondary">Ganancias brutas</span>
                <span className="tabular-nums text-green-400">+{fmtEur(directo.ganancias_brutas ?? 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Pérdidas brutas</span>
                <span className="tabular-nums text-red-400">{fmtEur(directo.perdidas_brutas ?? 0)}</span>
              </div>
              {(directo.compensacion_aplicada ?? 0) > 0 && (
                <div className="flex justify-between">
                  <span className="text-text-secondary">Compensación aplicada</span>
                  <span className="tabular-nums text-yellow-400">{fmtEur(directo.compensacion_aplicada ?? 0)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold">
                <span className="text-text-secondary">Saldo neto (tributa)</span>
                <span className={cn("tabular-nums", (directo.saldo_neto ?? 0) > 0 ? "text-red-400" : "text-green-400")}>
                  {fmtEur(directo.saldo_neto ?? 0)}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-green-400/20 bg-green-400/5 p-4">
          <h5 className="mb-2 text-xs font-semibold uppercase text-green-400">
            Traspaso + Reembolso (Optimizado)
          </h5>
          <p className="mb-2 text-[10px] text-text-secondary">
            Traspasa lotes antiguos con alta ganancia, reembolsa lotes recientes con menor ganancia
          </p>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-text-secondary">Ganancia</span>
              <span className="tabular-nums">
                {fmtEur(optimizado.ganancia_patrimonial)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">Impuesto</span>
              <span className="font-semibold text-green-400 tabular-nums">
                {fmtEur(optimizado.impuesto)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">Neto</span>
              <span className="font-semibold tabular-nums">
                {fmtEur(optimizado.neto_recibido)}
              </span>
            </div>
          </div>
          {/* Gain/loss breakdown */}
          {(optimizado.ganancias_brutas != null || optimizado.perdidas_brutas != null) && (
            <div className="mt-3 border-t border-green-400/10 pt-2 space-y-0.5 text-xs">
              <div className="flex justify-between">
                <span className="text-text-secondary">Ganancias brutas</span>
                <span className="tabular-nums text-green-400">+{fmtEur(optimizado.ganancias_brutas ?? 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Pérdidas brutas</span>
                <span className="tabular-nums text-red-400">{fmtEur(optimizado.perdidas_brutas ?? 0)}</span>
              </div>
              {(optimizado.compensacion_aplicada ?? 0) > 0 && (
                <div className="flex justify-between">
                  <span className="text-text-secondary">Compensación aplicada</span>
                  <span className="tabular-nums text-yellow-400">{fmtEur(optimizado.compensacion_aplicada ?? 0)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold">
                <span className="text-text-secondary">Saldo neto (tributa)</span>
                <span className={cn("tabular-nums", (optimizado.saldo_neto ?? 0) > 0 ? "text-red-400" : "text-green-400")}>
                  {fmtEur(optimizado.saldo_neto ?? 0)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Savings highlight */}
      {savings > 0 && (
        <div className="rounded-lg border border-accent-glow/30 bg-accent-glow/8 px-4 py-3 text-center">
          <span className="text-sm text-text-secondary">Ahorro fiscal: </span>
          <span className="text-lg font-bold text-green-400">
            {fmtEur(savings)}
          </span>
          {data.ahorro_fiscal_pct > 0 && (
            <span className="ml-2 text-sm text-green-400">
              ({data.ahorro_fiscal_pct.toFixed(1)}%)
            </span>
          )}
        </div>
      )}

      {/* Non-traspasable warning */}
      {data.non_traspasable_isins && data.non_traspasable_isins.length > 0 && (
        <div className="rounded-lg border border-orange-400/30 bg-orange-400/8 p-3 text-sm">
          <span className="font-semibold text-orange-400"><AlertTriangle className="inline size-3.5 align-text-bottom mr-1" />ETFs/ETPs en cartera (no traspasables): </span>
          <span className="text-text-secondary">
            Los siguientes productos <strong className="text-orange-400">no pueden traspasarse</strong>{" "}
            según la legislación española y deben reembolsarse directamente (tributan siempre):
          </span>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {data.non_traspasable_isins.map((isin) => (
              <span key={isin} className="rounded px-2 py-0.5 text-xs font-mono bg-orange-400/15 text-orange-400 border border-orange-400/30">
                {isin}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Strategy explanation */}
      <div className="rounded-lg border border-border-glass/50 bg-white/3 p-3 text-xs text-text-secondary space-y-1">
        <p className="font-semibold text-text-primary text-sm"><ClipboardList className="inline size-3.5 align-text-bottom mr-1" /> Estrategia del algoritmo</p>
        <p>
          El plan ordena todos los lotes por <strong className="text-text-primary">ganancia % ascendente</strong>:
          primero se venden los lotes con menor plusvalía (o pérdidas), que generan menos impuestos.
          Esto es óptimo porque los tramos IRPF son marginalmente crecientes.
        </p>
        <p>
          En caso de empate, se priorizan <strong className="text-orange-400">ETFs/ETPs</strong> sobre
          fondos de inversión, ya que los ETFs no pueden traspasarse y conviene liquidarlos antes
          para preservar la opción de traspaso exento en fondos.
        </p>
        <p>
          <strong className="text-text-primary">Compensación de pérdidas (Art. 49.1.b Ley 35/2006):</strong>{" "}
          Los lotes con pérdidas latentes se venden (en vez de traspasarse) para que la pérdida
          realizada compense las ganancias del mismo ejercicio fiscal, reduciendo la base
          imponible del ahorro. Solo tributa el saldo neto positivo.
        </p>
      </div>

      {/* Legal compliance note */}
      <div className="rounded-lg border border-blue-400/20 bg-blue-400/5 p-3 text-xs text-text-secondary space-y-1">
        <p className="font-semibold text-blue-400 text-[11px]">
          <Lightbulb className="inline size-3 align-text-bottom mr-1" />
          Normativa española aplicada
        </p>
        <ul className="list-disc list-inside space-y-0.5 text-[11px]">
          <li><strong>Art. 94 Ley 35/2006 (LIRPF):</strong> Traspasos entre IICs exentos de tributación</li>
          <li><strong>Art. 37.1.c:</strong> Ganancia = Valor transmisión − Valor adquisición (método FIFO)</li>
          <li><strong>Art. 49.1.b:</strong> Compensación automática de ganancias y pérdidas patrimoniales en la misma base</li>
          <li><strong>Art. 66:</strong> Tramos de la base del ahorro (19%–28%)</li>
          <li><strong>Art. 33.5.f:</strong> Norma anti-aplicación: pérdidas no deducibles si se recompran valores homogéneos en 2 meses (ETFs) o 1 año (fondos)</li>
        </ul>
      </div>

      {/* Plan de traspasos — grouped by fund */}
      {traspasoGroups.length > 0 && (
        <div className="space-y-2">
          <h5 className="text-xs font-semibold uppercase text-text-secondary">
            Paso 1 — Traspasos exentos ({traspasoGroups.length}{" "}
            {traspasoGroups.length === 1 ? "fondo" : "fondos"}, {totalTraspasoLots} lotes)
          </h5>
          <p className="text-[11px] text-text-secondary">
            Estos lotes se traspasan al fondo destino <strong className="text-accent-glow">sin tributar</strong> (Art. 94 LIRPF).
            Haz clic en cada fondo para ver el detalle por lote.
          </p>
          <div className="space-y-1.5">
            {traspasoGroups.map((g) => (
              <ExpandableFundGroup key={g.isin} group={g} variant="traspaso" />
            ))}
          </div>
        </div>
      )}

      {/* Plan de reembolso — grouped by fund */}
      {reembolsoGroups.length > 0 && (
        <div className="space-y-2">
          <h5 className="text-xs font-semibold uppercase text-text-secondary">
            Paso 2 — Reembolsos en efectivo ({reembolsoGroups.length}{" "}
            {reembolsoGroups.length === 1 ? "fondo" : "fondos"}, {totalReembolsoLots} lotes — tributan)
          </h5>
          <p className="text-[11px] text-text-secondary">
            Estos lotes se venden al contado. La ganancia patrimonial tributa en IRPF.
            Haz clic en cada fondo para ver el detalle por lote.
          </p>
          <div className="space-y-1.5">
            {reembolsoGroups.map((g) => (
              <ExpandableFundGroup key={g.isin} group={g} variant="reembolso" />
            ))}
          </div>
        </div>
      )}

      {/* Tax-Loss Harvesting suggestion */}
      <LossHarvestingSection harvesting={data.loss_harvesting} />

      {/* Destination fund suggestion */}
      {data.destination_fund && (
        <div className="rounded-lg border border-accent-glow/20 bg-accent-glow/5 p-3 text-sm">
          <span className="font-semibold text-accent-glow">Fondo destino sugerido: </span>
          <span>{data.destination_fund.nombre}</span>
          {data.destination_fund.motivo && (
            <p className="mt-1 text-xs text-text-secondary">{data.destination_fund.motivo}</p>
          )}
        </div>
      )}

      {data.notas && (
        <p className="text-xs text-text-secondary">{data.notas}</p>
      )}
    </div>
  );
}

function FifoResult({
  data,
  showDetail,
  toggleDetail,
}: {
  data: import("@/types").TaxOptimizeResult;
  showDetail: boolean;
  toggleDetail: () => void;
}) {
  const fifoGroups = useMemo(() => {
    if (!data.optimal_plan?.length) return [];
    const lots: LotRecord[] = data.optimal_plan.map((p) => ({
      ISIN: p.isin ?? "",
      Fondo: p.fund,
      Fecha_Compra: p.purchase_date,
      Participaciones: p.shares,
      Importe: p.amount,
      Ganancia_Patrimonial: p.gain,
      es_etf: p.is_etf ?? false,
    }));
    return groupByFund(lots);
  }, [data.optimal_plan]);

  const totalLots = fifoGroups.reduce((s, g) => s + g.lots.length, 0);

  return (
    <div className="mt-4 space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard title="Retirado" value={fmtEur(data.withdraw_amount)} />
        <MetricCard
          title="Ganancia"
          value={fmtEur(data.total_gain)}
          valueClassName={signColor(data.total_gain)}
        />
        <MetricCard
          title="Impuesto Estimado"
          value={fmtEur(data.estimated_tax)}
          valueClassName="text-red-400"
        />
        <MetricCard
          title="Neto"
          value={fmtEur(data.net_after_tax)}
          valueClassName="text-green-400"
        />
      </div>

      {/* Optimal plan — grouped by fund */}
      {fifoGroups.length > 0 && (
        <div className="overflow-x-auto">
          <button
            onClick={toggleDetail}
            className="mb-2 text-xs text-accent-glow"
          >
            {showDetail
              ? "▲ Ocultar detalle"
              : `▼ Ver plan de venta (${fifoGroups.length} fondos, ${totalLots} lotes)`}
          </button>
          {showDetail && (
            <div className="space-y-1.5">
              {fifoGroups.map((g) => (
                <ExpandableFundGroup key={g.isin} group={g} variant="reembolso" />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tax brackets */}
      {data.tax_brackets && data.tax_brackets.length > 0 && (
        <div className="glass-panel overflow-x-auto p-4">
          <h5 className="mb-2 text-xs font-semibold uppercase text-text-secondary">
            Desglose por Tramos (Renta del Ahorro 2024)
          </h5>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border-glass text-text-secondary">
                <th className="pb-1 text-left">Tramo</th>
                <th className="pb-1 text-right">Tipo</th>
                <th className="pb-1 text-right">Base</th>
                <th className="pb-1 text-right">Cuota</th>
              </tr>
            </thead>
            <tbody>
              {data.tax_brackets.map((b, i) => (
                <tr key={i} className="border-b border-border-glass/20">
                  <td className="py-1">{b.bracket}</td>
                  <td className="py-1 text-right">{b.rate}%</td>
                  <td className="py-1 text-right tabular-nums">
                    {fmtEur(b.amount)}
                  </td>
                  <td className="py-1 text-right font-semibold tabular-nums text-red-400">
                    {fmtEur(b.tax)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── Tax-Loss / Gain Harvesting (bidirectional) ──────────────────── */

type HarvestingData = NonNullable<
  import("@/types").TraspasoOptimizeResult["loss_harvesting"]
>;

function LossHarvestingSection({
  harvesting,
}: {
  harvesting?: HarvestingData | null;
}) {
  const [showDetail, setShowDetail] = useState(false);

  if (
    !harvesting ||
    harvesting.candidates.length === 0 ||
    (harvesting.tax_savings <= 0 && harvesting.additional_cash <= 0)
  )
    return null;

  const isGainHarvest = harvesting.direction === "harvest_gains";

  return (
    <div className="space-y-3">
      <h5 className="text-xs font-semibold uppercase text-text-secondary">
        {isGainHarvest
          ? <><Wallet className="inline size-3.5 align-text-bottom mr-1" /> Harvest Gains — Aprovechar pérdidas del plan</>
          : <><Scissors className="inline size-3.5 align-text-bottom mr-1" /> Tax-Loss Harvesting — Compensar ganancias</>}
      </h5>

      {/* Summary card */}
      <div
        className={cn(
          "rounded-lg border p-4 space-y-3",
          isGainHarvest
            ? "border-green-400/25 bg-green-400/5"
            : "border-blue-400/25 bg-blue-400/5",
        )}
      >
        {isGainHarvest ? (
          <p className="text-sm text-text-secondary">
            Tu plan de retirada genera <strong className="text-red-400">pérdidas netas</strong> que
            se desperdiciarían si no se emparejan con ganancias en el mismo ejercicio fiscal.
            <br />
            Vendiendo <strong className="text-text-primary">adicionalmente</strong> lotes
            con plusvalías latentes, las pérdidas las compensan automáticamente →{" "}
            <strong className="text-green-400">dinero extra sin coste fiscal</strong>{" "}
            (Art. 49.1.b Ley 35/2006).
          </p>
        ) : (
          <p className="text-sm text-text-secondary">
            Vendiendo <strong className="text-text-primary">voluntariamente</strong> lotes
            con pérdidas latentes puedes compensar las ganancias del plan anterior
            dentro del mismo ejercicio fiscal (Art. 49.1.b Ley 35/2006).
            <br />
            La ganancia neta baja y pagas menos IRPF — recibes efectivo adicional.
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div>
            <div className="text-[10px] uppercase text-text-secondary">
              {isGainHarvest ? "Pérdida neta del plan" : "Ganancia neta actual"}
            </div>
            <div className={cn("text-sm font-semibold tabular-nums", signColor(harvesting.base_net_gain))}>
              {fmtEur(harvesting.base_net_gain)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-text-secondary">
              {isGainHarvest ? "Ganancias aprovechables" : "Pérdidas cosechables"}
            </div>
            <div className={cn(
              "text-sm font-semibold tabular-nums",
              isGainHarvest ? "text-green-400" : "text-red-400",
            )}>
              {fmtEur(harvesting.total_harvestable_loss)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-text-secondary">
              Saldo neto con harvest
            </div>
            <div className={cn("text-sm font-semibold tabular-nums", signColor(harvesting.net_gain_after_harvest))}>
              {fmtEur(harvesting.net_gain_after_harvest)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-text-secondary">
              {isGainHarvest ? "Impuesto evitado" : "Ahorro fiscal estimado"}
            </div>
            <div className="text-sm font-bold tabular-nums text-green-400">
              {fmtEur(harvesting.tax_savings)}
            </div>
          </div>
        </div>

        {isGainHarvest ? (
          <div className="flex items-center gap-4 text-xs text-text-secondary">
            <span>
              El plan ya no genera impuesto (pérdida neta).
            </span>
            {harvesting.additional_cash > 0 && (
              <>
                <span className="text-border-glass">|</span>
                <span>
                  Efectivo adicional libre de impuestos:{" "}
                  <strong className="text-green-400">{fmtEur(harvesting.additional_cash)}</strong>
                </span>
              </>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-4 text-xs text-text-secondary">
            <span>
              Impuesto sin harvest: <strong className="text-red-400">{fmtEur(harvesting.base_tax)}</strong>
            </span>
            <span>→</span>
            <span>
              Impuesto con harvest: <strong className="text-green-400">{fmtEur(harvesting.tax_after_harvest)}</strong>
            </span>
            {harvesting.additional_cash > 0 && (
              <>
                <span className="text-border-glass">|</span>
                <span>
                  Efectivo adicional: <strong className="text-text-primary">{fmtEur(harvesting.additional_cash)}</strong>
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Candidate detail */}
      <button
        onClick={() => setShowDetail(!showDetail)}
        className="text-xs text-accent-glow"
      >
        {showDetail
          ? "▲ Ocultar lotes"
          : `▼ Ver ${harvesting.candidates.length} lotes candidatos`}
      </button>

      {showDetail && (
        <div className="space-y-2">
          {harvesting.candidates.map((c, i) => (
            <div
              key={i}
              className={cn(
                "rounded-lg border p-3 text-xs",
                c.es_etf
                  ? "border-orange-400/20 bg-orange-400/5"
                  : isGainHarvest
                    ? "border-green-400/20 bg-green-400/5"
                    : "border-blue-400/20 bg-blue-400/5",
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{c.Fondo}</span>
                  {c.es_etf && (
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-orange-400/15 text-orange-400 border border-orange-400/30">
                      ETF
                    </span>
                  )}
                </div>
                <span className="text-text-secondary">{c.Fecha_Compra ?? ""}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-text-secondary">
                <span>
                  {isGainHarvest ? "Ganancia del lote" : "Pérdida del lote"}:{" "}
                  <strong className={isGainHarvest ? "text-green-400" : "text-red-400"}>
                    {fmtEur(c.lot_loss)}
                  </strong>
                </span>
                <span>
                  Valor lote: <strong className="text-text-primary">{fmtEur(c.lot_value)}</strong>
                </span>
                {c.preceding_forced_gain !== 0 && (
                  <span>
                    {isGainHarvest ? "P&L forzado (FIFO ETF)" : "Ganancia forzada (FIFO ETF)"}:{" "}
                    <strong className={signColor(c.preceding_forced_gain)}>
                      {fmtEur(c.preceding_forced_gain)}
                    </strong>
                  </span>
                )}
                {c.preceding_transfer_value > 0 && (
                  <span>
                    Traspaso previo:{" "}
                    <strong className="text-accent-glow">{fmtEur(c.preceding_transfer_value)}</strong>
                    {" (exento)"}
                  </span>
                )}
                <span>
                  {isGainHarvest ? "Ganancia neta aprovechable" : "Beneficio neto"}:{" "}
                  <strong className={signColor(c.net_harvest_gain)}>
                    {fmtEur(c.net_harvest_gain)}
                  </strong>
                </span>
              </div>
              {!isGainHarvest && (
                <div className="mt-1 text-[10px] text-yellow-400/80">
                  <AlertTriangle className="inline size-3 align-text-bottom mr-1" />Norma antiaplicación (Art. 33.5.f): no recomprar valores homogéneos
                  en <strong>{c.antiaplicacion_plazo}</strong>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Anti-wash-sale warning (only relevant when harvesting losses) */}
      {!isGainHarvest && (
        <div className="rounded-lg border border-yellow-400/20 bg-yellow-400/5 p-3 text-xs text-text-secondary space-y-1">
          <p className="font-semibold text-yellow-400 text-sm">
            <AlertTriangle className="inline size-3.5 align-text-bottom mr-1" />Norma antiaplicación (Art. 33.5.f Ley 35/2006)
          </p>
          <p>
            Las pérdidas patrimoniales <strong className="text-text-primary">no son deducibles</strong>{" "}
            si se recompran valores homogéneos en:
          </p>
          <ul className="ml-4 list-disc space-y-0.5">
            <li>
              <strong className="text-orange-400">2 meses</strong> para valores cotizados (ETFs, acciones)
            </li>
            <li>
              <strong className="text-text-primary">1 año</strong> para valores no cotizados (fondos de inversión)
            </li>
          </ul>
          <p>
            Para evitarla puedes comprar un fondo/ETF <strong className="text-text-primary">similar pero con diferente ISIN</strong>{" "}
            (ej. otro indexado al MSCI World de diferente gestora).
          </p>
        </div>
      )}

      {/* Gain harvest info box */}
      {isGainHarvest && (
        <div className="rounded-lg border border-green-400/20 bg-green-400/5 p-3 text-xs text-text-secondary space-y-1">
          <p className="font-semibold text-green-400 text-sm">
            <Lightbulb className="inline size-3.5 align-text-bottom mr-1" /> ¿Por qué vender ganancias?
          </p>
          <p>
            Las <strong className="text-text-primary">pérdidas del plan base</strong> compensan
            automáticamente las ganancias del mismo ejercicio fiscal (Art. 49.1.b).
            Sin emparejar, esas pérdidas se desperdician — el año que viene seguirías
            pagando impuestos al vender esos lotes con plusvalía.
          </p>
          <p>
            Vendiendo ahora aprovechas la «ventana fiscal» → recibes el valor de
            mercado de los lotes <strong className="text-green-400">sin tributar por la plusvalía</strong>.
          </p>
          <p className="text-yellow-400/80 mt-1">
            <AlertTriangle className="inline size-3 align-text-bottom mr-1" />La norma antiaplicación (Art. 33.5.f) aplica a las pérdidas del plan base:
            no recompres los valores vendidos a pérdida en 2 meses (ETFs) / 1 año (fondos).
          </p>
        </div>
      )}
    </div>
  );
}
