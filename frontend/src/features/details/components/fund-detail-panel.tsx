import { cn } from "@/lib/utils";
import { fmtPctPlain, signColor, riskColor } from "@/lib/format";
import type { FundDetail, FundMetrics } from "@/types";

/* ── Component ───────────────────────────────────────────────────── */

interface FundDetailPanelProps {
  detail: FundDetail;
}

export function FundDetailPanel({
  detail,
}: FundDetailPanelProps) {
  const finectUrl =
    detail.finect_url ??
    `https://www.finect.com/fondos-inversion/${detail.isin}`;

  return (
    <div>
      {/* Badges */}
      <div className="mb-4 flex flex-wrap gap-2">
        {detail.category && (
          <Badge color="accent-glow">{detail.category}</Badge>
        )}
        {detail.management_company && (
          <Badge color="accent-secondary">{detail.management_company}</Badge>
        )}
        {detail.srri != null && <Badge>SRRI: {detail.srri}/7</Badge>}
        {detail.expense_ratio != null && (
          <Badge>TER: {detail.expense_ratio}%</Badge>
        )}
        {detail.aum != null && (
          <Badge>
            AUM:{" "}
            {typeof detail.aum === "number"
              ? `€${(detail.aum / 1e6).toFixed(0)}M`
              : detail.aum}
          </Badge>
        )}
        {detail.inception_date && (
          <Badge>Fecha inicio: {detail.inception_date}</Badge>
        )}
      </div>

      {/* Metrics */}
      {detail.metrics && Object.keys(detail.metrics).length > 0 && (
        <MetricsRow metrics={detail.metrics} />
      )}

      {/* Sectors + Regions side by side */}
      <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        {Object.keys(detail.sectors ?? {}).length > 0 && (
          <BreakdownBars
            title="Sectores"
            data={detail.sectors}
            color="bg-accent-glow"
          />
        )}
        {Object.keys(detail.countries ?? {}).length > 0 && (
          <BreakdownBars
            title="Geografía"
            data={detail.countries}
            color="bg-accent-secondary"
          />
        )}
      </div>

      {/* Holdings */}
      <div className="border-t border-white/8 pt-6">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
            Top Holdings{" "}
            {detail.holdings?.length
              ? `(${detail.holdings.length})`
              : ""}
          </h4>
          <a
            href={finectUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-accent-glow opacity-80 hover:opacity-100"
          >
            Ver en Finect ↗
          </a>
        </div>

        {detail.holdings?.length ? (
          <div className="flex flex-col gap-1">
            {detail.holdings.map((h, i) => {
              const name =
                (h.name as string) ??
                (h.Name as string) ??
                (h.company as string) ??
                (h.ticker as string) ??
                `Holding ${i + 1}`;
              const weight = parseFloat(
                String(h.weight ?? h.Weight ?? h.percentage ?? 0),
              );
              return (
                <div
                  key={i}
                  className="flex items-center gap-2.5 border-b border-white/4 py-1.5 text-sm"
                >
                  <span className="w-5 shrink-0 text-right text-xs text-text-secondary">
                    {i + 1}.
                  </span>
                  <span className="flex-1 text-text-primary">{name}</span>
                  {weight > 0 && (
                    <>
                      <div className="h-1 w-20 shrink-0 rounded bg-border-glass">
                        <div
                          className="h-full rounded bg-accent-glow"
                          style={{
                            width: `${Math.min(weight * 4, 100)}%`,
                          }}
                        />
                      </div>
                      <span className="w-12 shrink-0 text-right font-semibold text-accent-glow">
                        {weight.toFixed(1)}%
                      </span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="py-2 text-sm italic text-text-secondary">
            Sin datos de holdings disponibles en caché.{" "}
            <a
              href={finectUrl}
              target="_blank"
              rel="noreferrer"
              className="text-accent-glow"
            >
              Consultar en Finect ↗
            </a>
          </p>
        )}
      </div>
    </div>
  );
}

/* ── Sub-pieces ──────────────────────────────────────────────────── */

function Badge({
  children,
  color,
}: {
  children: React.ReactNode;
  color?: string;
}) {
  const bg =
    color === "accent-glow"
      ? "bg-accent-glow/15 text-accent-glow"
      : color === "accent-secondary"
        ? "bg-accent-secondary/15 text-accent-secondary"
        : "bg-white/8 text-text-primary";

  return (
    <span className={cn("rounded-md px-2.5 py-1 text-xs", bg)}>
      {children}
    </span>
  );
}

function MetricsRow({ metrics }: { metrics: FundMetrics }) {
  const items = [
    {
      label: "Sharpe",
      value: metrics.sharpe_ratio,
      fmt: (v: number) => v.toFixed(2),
      color: signColor,
    },
    {
      label: "Alpha",
      value: metrics.alpha,
      fmt: (v: number) => v.toFixed(2),
      color: signColor,
    },
    {
      label: "Beta",
      value: metrics.beta,
      fmt: (v: number) => v.toFixed(2),
      color: () => "text-text-primary",
    },
    {
      label: "Volatilidad",
      value: metrics.standard_deviation,
      fmt: (v: number) => fmtPctPlain(v, 2),
      color: (v: number) => riskColor(v),
    },
    {
      label: "Max Caída",
      value: metrics.max_drawdown,
      fmt: (v: number) => fmtPctPlain(v, 2),
      color: () => "text-danger",
    },
    {
      label: "T. Error",
      value: metrics.tracking_error,
      fmt: (v: number) => fmtPctPlain(v, 2),
      color: () => "text-text-primary",
    },
  ];

  return (
    <div className="mb-6 flex flex-wrap gap-2.5 border-b border-white/8 pb-6">
      {items
        .filter((it) => it.value != null)
        .map((it) => (
          <div
            key={it.label}
            className="rounded-lg bg-black/20 px-3.5 py-2 text-center"
          >
            <div className="text-[0.65rem] uppercase text-text-secondary">
              {it.label}
            </div>
            <div className={cn("font-bold", it.color(it.value!))}>
              {it.fmt(it.value!)}
            </div>
          </div>
        ))}
    </div>
  );
}

function BreakdownBars({
  title,
  data,
  color,
}: {
  title: string;
  data: Record<string, number>;
  color: string;
}) {
  const sorted = Object.entries(data)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);

  return (
    <div>
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-secondary">
        {title}
      </h4>
      <div className="flex flex-col gap-1.5">
        {sorted.map(([name, val]) => (
          <div key={name} className="text-sm">
            <div className="mb-0.5 flex justify-between">
              <span className="text-text-secondary">{name}</span>
              <strong>{val.toFixed(1)}%</strong>
            </div>
            <div className="h-1 rounded bg-border-glass">
              <div
                className={cn("h-full rounded", color)}
                style={{ width: `${Math.min(val, 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
