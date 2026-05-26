import { useMemo, useState } from "react";
import { ExternalLink, ClipboardList, RefreshCw, Target, Globe } from "lucide-react";
import { Spinner } from "@/components/ui";
import {
  useDetails,
  useBenchmark,
  usePortfolioHoldings,
  useFundDetail,
  useRefreshFundDetail,
} from "./hooks";
import { ComparisonBars, FundDetailPanel, HoldingsGrid } from "./components";
import type { FundDetailsMap } from "@/types";

/* ── Aggregate helper ─────────────────────────────────────────────── */

function aggregate(
  details: FundDetailsMap,
  key: "sector" | "region",
): Array<{ name: string; value: number }> {
  const aggr: Record<string, number> = {};

  Object.values(details).forEach((fund) => {
    const block = fund[key] ?? {};
    Object.entries(block).forEach(([name, raw]) => {
      const val = typeof raw === "number" ? raw : parseFloat(String(raw));
      aggr[name] = (aggr[name] ?? 0) + val * (fund.percentage / 100);
    });
  });

  const total = Object.values(aggr).reduce((a, b) => a + b, 0) || 1;
  return Object.entries(aggr)
    .map(([name, v]) => ({ name, value: (v / total) * 100 }))
    .filter((x) => x.value > 0.5)
    .sort((a, b) => b.value - a.value);
}

/* ── DetailsTab ────────────────────────────────────────────────────── */

export function DetailsTab() {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [benchmarkKey, setBenchmarkKey] = useState<string | null>(null);

  const { data: details, isLoading } = useDetails();
  const { data: benchmark } = useBenchmark();
  const { data: portfolioHoldings } = usePortfolioHoldings();

  // Resolve selected fund ISIN for the detail query
  const selectedIsin = selectedKey && details?.[selectedKey]?.isin;
  const { data: fundDetail, isLoading: detailLoading } = useFundDetail(
    selectedIsin ?? null,
  );
  const refreshMutation = useRefreshFundDetail();

  const fundKeys = useMemo(
    () => (details ? Object.keys(details) : []),
    [details],
  );

  const sectors = useMemo(
    () => (details ? aggregate(details, "sector") : []),
    [details],
  );
  const regions = useMemo(
    () => (details ? aggregate(details, "region") : []),
    [details],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  const hasData =
    details &&
    Object.keys(details).length > 0 &&
    Object.values(details).some(
      (f) =>
        (f.sector && Object.keys(f.sector).length > 0) ||
        (f.region && Object.keys(f.region).length > 0),
    );

  if (!hasData) {
    return (
      <div className="py-8 text-center">
        <p className="mb-4 text-text-secondary">
          No hay datos sectoriales/geográficos disponibles.
        </p>
      </div>
    );
  }

  /* ── Benchmark data resolution ──────────────────────────── */
  let benchSectors: Record<string, number> | null = null;
  let benchRegions: Record<string, number> | null = null;
  let benchLabel = "MSCI World";

  if (benchmarkKey && details?.[benchmarkKey]) {
    const bf = details[benchmarkKey];
    benchSectors = bf.sector
      ? Object.fromEntries(
          Object.entries(bf.sector).map(([k, v]) => [k, Number(v)]),
        )
      : null;
    benchRegions = bf.region
      ? Object.fromEntries(
          Object.entries(bf.region).map(([k, v]) => [k, Number(v)]),
        )
      : null;
    benchLabel = benchmarkKey.substring(0, 20);
  } else if (benchmark) {
    benchSectors = benchmark.sectors ?? null;
    benchRegions = benchmark.regions ?? null;
  }

  const selectedFund = selectedKey ? details?.[selectedKey] : null;

  return (
    <div className="space-y-6">
      {/* ── Toolbar ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2.5">
        <label className="shrink-0 text-xs text-text-secondary">
          Ver fondo:
        </label>
        <select
          value={selectedKey ?? ""}
          onChange={(e) => {
            setSelectedKey(e.target.value || null);
          }}
          className="max-w-[400px] flex-1 cursor-pointer rounded-lg border border-border-glass bg-bg-glass px-2.5 py-1.5 text-sm text-white"
        >
          <option value="">— Visión global de cartera —</option>
          {fundKeys.map((k) => (
            <option key={k} value={k}>
              {k}
              {details![k]?.isin ? ` (${details![k].isin})` : ""}
            </option>
          ))}
        </select>

        {selectedFund?.isin && (
          <a
            href={
              selectedFund.finect_url ??
              `https://www.finect.com/fondos-inversion/${selectedFund.isin}`
            }
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-accent-glow/30 bg-accent-glow/15 px-3 py-1.5 text-xs text-accent-glow"
          >
            <ExternalLink className="inline size-3.5 align-text-bottom mr-1" /> Ver en Finect
          </a>
        )}
      </div>

      {/* ── Individual fund detail ──────────────────────────── */}
      {selectedKey && selectedFund && (
        <div className="glass-panel space-y-4 p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">
              <ClipboardList className="inline size-4 align-text-bottom mr-1.5" />{selectedKey}
              {selectedFund.isin && (
                <span className="ml-2.5 text-xs font-normal text-text-secondary">
                  {selectedFund.isin}
                </span>
              )}
            </h3>
            {selectedIsin && (
              <button
                onClick={() => refreshMutation.mutate(selectedIsin)}
                disabled={refreshMutation.isPending}
                className="rounded-md border border-accent-glow/30 bg-accent-glow/15 px-3 py-1 text-xs text-accent-glow disabled:opacity-50"
              >
                <RefreshCw className="inline size-3.5 align-text-bottom mr-1" /> Recargar de Finect
              </button>
            )}
          </div>

          {detailLoading && (
            <div className="text-sm text-text-secondary">
              Cargando detalles completos...
            </div>
          )}

          {fundDetail && !detailLoading && (
            <FundDetailPanel detail={fundDetail} />
          )}

          {/* Fallback: cached sector/region */}
          {!detailLoading && !fundDetail && (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {Object.keys(selectedFund.sector ?? {}).length > 0 && (
                <div>
                  <h4 className="mb-3 text-xs font-semibold uppercase text-text-secondary">
                    Sectores
                  </h4>
                  <ComparisonBars
                    data={Object.entries(selectedFund.sector!).map(
                      ([name, v]) => ({
                        name,
                        value: Number(v),
                      }),
                    )}
                  />
                </div>
              )}
              {Object.keys(selectedFund.region ?? {}).length > 0 && (
                <div>
                  <h4 className="mb-3 text-xs font-semibold uppercase text-text-secondary">
                    Geografía
                  </h4>
                  <ComparisonBars
                    data={Object.entries(selectedFund.region!).map(
                      ([name, v]) => ({
                        name,
                        value: Number(v),
                      }),
                    )}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Global aggregate view ───────────────────────────── */}
      {!selectedKey && (
        <>
          {/* Benchmark legend bar */}
          <div className="flex flex-wrap items-center gap-4 rounded-lg border border-yellow-400/15 bg-yellow-400/6 px-3.5 py-2 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-3 rounded bg-accent-glow" />
              Mi Cartera
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-3 rounded bg-yellow-400/50" />
              {benchLabel}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <label className="text-text-secondary">Benchmark:</label>
              <select
                value={benchmarkKey ?? ""}
                onChange={(e) => setBenchmarkKey(e.target.value || null)}
                className="cursor-pointer rounded-md border border-yellow-400/30 bg-black/30 px-2 py-0.5 text-xs text-white"
              >
                <option value="">MSCI World (default)</option>
                {fundKeys.map((k) => (
                  <option key={k} value={k}>
                    {k.substring(0, 35)}
                  </option>
                ))}
              </select>
            </div>
            <span className="text-text-secondary">
              Diferencia:{" "}
              <span className="text-green-400">+sobreponderado</span> /{" "}
              <span className="text-red-400">-infraponderado</span>
            </span>
          </div>

          {/* Sector + Geography cards */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="glass-panel p-6">
              <h3 className="mb-5 flex items-center gap-2 font-semibold"><Target className="size-4 text-accent-glow" /> Exposición Sectorial</h3>
              <ComparisonBars
                data={sectors}
                benchmarkData={benchSectors}
                benchmarkLabel={benchLabel}
              />
            </div>
            <div className="glass-panel p-6">
              <h3 className="mb-5 flex items-center gap-2 font-semibold">
                <Globe className="size-4 text-accent-glow" /> Exposición Geográfica
              </h3>
              <ComparisonBars
                data={regions}
                benchmarkData={benchRegions}
                benchmarkLabel={benchLabel}
              />
            </div>
          </div>

          {/* Portfolio Holdings */}
          {portfolioHoldings && <HoldingsGrid holdings={portfolioHoldings} />}
        </>
      )}
    </div>
  );
}
