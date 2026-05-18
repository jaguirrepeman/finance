import { useMemo, useState } from "react";
import { Spinner, PillToggle } from "@/components/ui";
import {
  usePortfolioSummary,
  useRealEvolution,
  useLastUpdate,
  useOrdersSummary,
} from "./hooks";
import {
  KpiStrip,
  AllocationSection,
  FundTable,
  PortfolioChart,
  MonthlyTable,
  PerFundEvolutionChart,
  OrdersSummaryChart,
  MonthComparisonWidget,
  AdviceCard,
  TransactionOverridesPanel,
} from "./components";

export function GeneralTab() {
  const { data, isLoading, error } = usePortfolioSummary();
  const { data: evolution } = useRealEvolution();
  const { data: lastUpdate } = useLastUpdate();
  const { data: ordersSummary } = useOrdersSummary();

  const [showMonthly, setShowMonthly] = useState(false);

  const chartData = useMemo(() => {
    if (!data?.summary?.details) return [];
    return Object.entries(data.summary.details)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [data]);

  // Build ISIN → pretty name map for per-fund chart
  const fundNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (data?.funds) {
      for (const f of data.funds) {
        const prettyName = f["Morningstar Name"] ?? f.Fondo;
        if (f.ISIN) map[f.ISIN] = prettyName;
        map[f.Fondo] = prettyName;
      }
    }
    return map;
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="glass-panel mx-auto max-w-lg p-8 text-center">
        <p className="text-red-400">
          Error al cargar los datos de la cartera.
        </p>
        <p className="mt-2 text-sm text-text-secondary">
          {error instanceof Error ? error.message : "Error desconocido"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cash / advice warning */}
      {data.recommendation && (
        <AdviceCard recommendation={data.recommendation} />
      )}

      {/* KPI cards */}
      <KpiStrip funds={data.funds} />

      {/* Asset Allocation + Gestión bars */}
      <AllocationSection summary={data.summary} chartData={chartData} />

      {/* Fund table */}
      <FundTable funds={data.funds} lastDate={lastUpdate?.last_date} />

      {/* Transaction overrides management — immediately below Mi Cartera Base */}
      <TransactionOverridesPanel />

      {/* Evolution chart toggle */}
      {evolution?.series && (
        <div>
          <PillToggle
            options={[
              { key: "chart", label: "📈 Gráfico" },
              { key: "monthly", label: "📅 Mensuales" },
            ]}
            value={showMonthly ? "monthly" : "chart"}
            onChange={(v) => setShowMonthly(v === "monthly")}
            className="mb-2"
          />

          {showMonthly && evolution.monthly ? (
            <MonthlyTable monthly={evolution.monthly} />
          ) : (
            <PortfolioChart series={evolution.series} />
          )}
        </div>
      )}

      {/* Per-fund evolution */}
      {evolution?.funds && Object.keys(evolution.funds).length > 0 && (
        <PerFundEvolutionChart
          funds={evolution.funds}
          investedPerFund={evolution.invested_per_fund}
          nameMap={fundNameMap}
        />
      )}

      {/* Orders summary */}
      {ordersSummary && <OrdersSummaryChart data={ordersSummary} />}

      {/* Month comparison */}
      {evolution && evolution.monthly?.length >= 2 && (
        <MonthComparisonWidget evolution={evolution} />
      )}
    </div>
  );
}
