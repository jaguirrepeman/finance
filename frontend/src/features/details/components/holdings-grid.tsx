import type { PortfolioHoldingsResponse } from "@/types";

interface HoldingsGridProps {
  holdings: PortfolioHoldingsResponse;
}

export function HoldingsGrid({ holdings }: HoldingsGridProps) {
  if (!holdings.holdings?.length) return null;

  return (
    <div className="glass-panel mt-6 p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
        <h3 className="font-semibold">🏢 Holdings Ponderados de Cartera</h3>
        <span className="text-xs text-text-secondary">
          {holdings.funds_with_holdings}/{holdings.total_funds} fondos con datos
          · Cobertura: {holdings.coverage_pct}%
        </span>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2">
        {holdings.holdings.map((h, i) => (
          <div
            key={h.name}
            className="flex items-center gap-2.5 rounded-lg border border-white/6 bg-white/3 px-2.5 py-1.5"
          >
            <span className="min-w-[22px] text-right text-xs text-text-secondary">
              # {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div
                className="truncate text-sm font-semibold"
                title={h.name}
              >
                {h.name}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-sm font-bold text-accent-glow">
                {h.weight.toFixed(2)}%
              </div>
              <div
                className="mt-0.5 ml-auto h-1 rounded bg-accent-glow/60"
                style={{ width: `${Math.min(h.weight * 8, 80)}px` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
