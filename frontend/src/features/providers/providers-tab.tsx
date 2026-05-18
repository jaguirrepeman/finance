import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { Spinner } from "@/components/ui";
import type { ProviderStatus } from "@/types";
import { cn } from "@/lib/utils";

const PROVIDER_LABELS = ["Finect", "YahooFinance", "FMP"] as const;

function ProviderChips({ providers }: { providers?: Record<string, number> }) {
  if (!providers || Object.keys(providers).length === 0) {
    return <span className="text-xs text-text-secondary italic">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {PROVIDER_LABELS.map((label) => {
        const rows = providers[label];
        if (rows === undefined) return null;
        const hasData = rows > 0;
        return (
          <span
            key={label}
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px] font-mono",
              hasData
                ? "bg-green-500/15 text-green-400"
                : "bg-gray-500/15 text-text-secondary line-through",
            )}
            title={`${label}: ${rows.toLocaleString()} días`}
          >
            {label === "YahooFinance" ? "Yahoo" : label}
            {hasData && <span className="ml-0.5 opacity-60">({rows.toLocaleString()})</span>}
          </span>
        );
      })}
    </div>
  );
}

function DownloadByProviderButtons({
  onRefresh,
  currentProviders,
}: {
  onRefresh: (provider: "finect" | "yahoo" | "fmp") => void;
  currentProviders?: Record<string, number>;
}) {
  const [open, setOpen] = useState(false);

  // Determine dominant provider (most rows)
  const dominantProvider = useMemo((): string | null => {
    if (!currentProviders || Object.keys(currentProviders).length === 0) return null;
    return Object.entries(currentProviders).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }, [currentProviders]);

  const providerLabel = (p: string) =>
    p === "YahooFinance" ? "Yahoo" : p;

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded border border-border-glass px-2 py-1 text-[10px] text-text-secondary hover:border-accent-glow/50 hover:text-accent-glow transition-colors"
        title="Descargar desde un proveedor concreto"
      >
        {dominantProvider ? (
          <span className="flex items-center gap-1">
            <span className="text-accent-glow/80">{providerLabel(dominantProvider)}</span>
            <span className="opacity-50">▼</span>
          </span>
        ) : "▼ Proveedor"}
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-1 min-w-[130px] rounded-lg border border-border-glass bg-[#12172a] shadow-xl"
          onMouseLeave={() => setOpen(false)}
        >
          <div className="px-3 py-1.5 text-[9px] text-text-secondary uppercase tracking-wide border-b border-border-glass/50">
            Cambiar proveedor
          </div>
          {(["finect", "yahoo", "fmp"] as const).map((p) => {
            const label = p === "yahoo" ? "Yahoo Finance" : p === "fmp" ? "FMP" : "Finect";
            const isActive = dominantProvider === (p === "yahoo" ? "YahooFinance" : p === "fmp" ? "FMP" : "Finect");
            return (
              <button
                key={p}
                onClick={() => {
                  onRefresh(p);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-white/5",
                  isActive ? "text-accent-glow" : "text-text-secondary hover:text-white",
                )}
              >
                <span className="capitalize">{label}</span>
                {isActive && <span className="text-[9px] opacity-60">actual</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: ProviderStatus }) {
  if (status.no_data) {
    return (
      <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[11px] text-red-400">
        Sin datos
      </span>
    );
  }
  if (status.is_fresh) {
    return (
      <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-[11px] text-green-400">
        Actualizado
      </span>
    );
  }
  if (status.is_stale) {
    return (
      <span className="rounded-full bg-yellow-500/20 px-2 py-0.5 text-[11px] text-yellow-400">
        Caché expirada
      </span>
    );
  }
  return (
    <span className="rounded-full bg-gray-500/20 px-2 py-0.5 text-[11px] text-text-secondary">
      Sin caché
    </span>
  );
}

function RowsBar({ rows }: { rows: number }) {
  const max = 8000;
  const pct = Math.min((rows / max) * 100, 100);
  const color =
    rows === 0
      ? "bg-red-500"
      : rows < 500
      ? "bg-yellow-500"
      : "bg-accent-glow";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/10">
        <div
          className={cn("h-full rounded-full transition-all", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="tabular-nums text-xs text-text-secondary">
        {rows.toLocaleString()} días
      </span>
    </div>
  );
}

export function ProvidersTab() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | "nodata" | "stale">("all");
  const [search, setSearch] = useState("");
  const [refreshingIsins, setRefreshingIsins] = useState<Set<string>>(
    new Set(),
  );

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["providers-status"],
    queryFn: api.getProvidersStatus,
    staleTime: 5 * 60 * 1000,
  });

  const refreshMut = useMutation({
    mutationFn: (isin: string) => api.refreshProviderForIsin(isin),
    onMutate: (isin) =>
      setRefreshingIsins((prev) => new Set([...prev, isin])),
    onSettled: (_, __, isin) => {
      setRefreshingIsins((prev) => {
        const next = new Set(prev);
        next.delete(isin);
        return next;
      });
      // Refresh status after a short delay (pipeline running in background)
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["providers-status"] });
        qc.invalidateQueries({ queryKey: ["portfolio"] });
      }, 3000);
    },
  });

  const refreshWithChoiceMut = useMutation({
    mutationFn: ({ isin, provider }: { isin: string; provider: "finect" | "yahoo" | "fmp" }) =>
      api.refreshProviderForIsinWithChoice(isin, provider),
    onMutate: ({ isin }) =>
      setRefreshingIsins((prev) => new Set([...prev, isin])),
    onSettled: (_, __, { isin }) => {
      setRefreshingIsins((prev) => {
        const next = new Set(prev);
        next.delete(isin);
        return next;
      });
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["providers-status"] });
      }, 5000);
    },
  });

  const providers = data?.providers ?? [];

  const filtered = providers.filter((p) => {
    const matchesFilter =
      filter === "all" ||
      (filter === "nodata" && p.no_data) ||
      (filter === "stale" && (p.is_stale || (!p.is_fresh && !p.no_data)));
    const matchesSearch =
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.isin.toLowerCase().includes(search.toLowerCase()) ||
      p.canonical.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const noDataCount = providers.filter((p) => p.no_data).length;
  const staleCount = providers.filter(
    (p) => p.is_stale || (!p.is_fresh && !p.no_data),
  ).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-panel p-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">
              Proveedores de Datos
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              Estado del historial NAV para cada fondo/ETF de tu cartera. Los
              datos se obtienen de{" "}
              <span className="text-white">Finect</span>,{" "}
              <span className="text-white">Yahoo Finance</span> y{" "}
              <span className="text-white">FMP</span> (mayor cobertura gana).
            </p>
          </div>
          <button
            onClick={() => refetch()}
            className="glass-panel-sm flex items-center gap-2 px-3 py-1.5 text-xs text-text-secondary hover:text-white"
          >
            🔄 Actualizar estado
          </button>
        </div>

        {/* Summary chips */}
        {!isLoading && (
          <div className="flex flex-wrap gap-3 text-xs">
            <div className="rounded-lg border border-border-glass bg-bg-glass px-3 py-1.5">
              <span className="text-text-secondary">Total fondos: </span>
              <span className="font-semibold text-white">
                {providers.length}
              </span>
            </div>
            <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-1.5">
              <span className="text-text-secondary">Con datos: </span>
              <span className="font-semibold text-green-400">
                {providers.filter((p) => !p.no_data).length}
              </span>
            </div>
            {noDataCount > 0 && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5">
                <span className="text-text-secondary">Sin datos: </span>
                <span className="font-semibold text-red-400">
                  {noDataCount}
                </span>
              </div>
            )}
            {staleCount > 0 && (
              <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-1.5">
                <span className="text-text-secondary">Caché expirada: </span>
                <span className="font-semibold text-yellow-400">
                  {staleCount}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex gap-1 rounded-xl border border-border-glass bg-bg-glass/30 p-1 text-xs">
          {(
            [
              { key: "all", label: "Todos" },
              { key: "nodata", label: `Sin datos${noDataCount ? ` (${noDataCount})` : ""}` },
              { key: "stale", label: `Expirados${staleCount ? ` (${staleCount})` : ""}` },
            ] as const
          ).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={cn(
                "rounded-lg px-3 py-1 transition-colors",
                filter === key
                  ? "bg-accent-glow/20 text-accent-glow"
                  : "text-text-secondary hover:text-white",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          placeholder="Buscar por nombre o ISIN…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 rounded border border-border-glass bg-bg-glass px-3 py-1.5 text-xs text-white placeholder:text-text-secondary"
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner />
        </div>
      ) : error ? (
        <div className="glass-panel p-6 text-center text-red-400 text-sm">
          Error cargando el estado de proveedores.
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-panel p-6 text-center text-text-secondary text-sm">
          No hay fondos que coincidan con el filtro.
        </div>
      ) : (
        <div className="glass-panel overflow-x-auto">
          <table className="w-full min-w-[780px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border-glass text-left text-xs text-text-secondary">
                <th className="p-3 font-normal">Fondo</th>
                <th className="p-3 font-normal">ISIN</th>
                <th className="p-3 font-normal">Estado</th>
                <th className="p-3 font-normal">Historial disponible</th>
                <th className="p-3 font-normal">Proveedor</th>
                <th className="p-3 font-normal">Primer dato</th>
                <th className="p-3 font-normal">Último dato</th>
                <th className="p-3 font-normal" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const isRefreshing = refreshingIsins.has(p.isin);
                return (
                  <tr
                    key={p.isin}
                    className={cn(
                      "border-b border-border-glass/30 transition-colors hover:bg-white/5",
                      p.no_data && "opacity-80",
                    )}
                  >
                    <td className="p-3">
                      <div className="max-w-[220px] truncate font-medium text-white" title={p.name}>
                        {p.name !== p.isin ? p.name : (
                          <span className="italic text-text-secondary">Nombre no resuelto</span>
                        )}
                      </div>
                      {p.raw_isins.length > 1 && (
                        <div className="mt-0.5 text-[11px] text-text-secondary">
                          {p.raw_isins.length} clases de fondo
                        </div>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="font-mono text-xs text-white">{p.isin}</div>
                      {p.canonical !== p.isin && (
                        <div className="mt-0.5 font-mono text-[10px] text-text-secondary">
                          → {p.canonical}
                        </div>
                      )}
                    </td>
                    <td className="p-3">
                      <StatusBadge status={p} />
                    </td>
                    <td className="p-3">
                      <RowsBar rows={p.rows} />
                    </td>
                    <td className="p-3">
                      <ProviderChips providers={p.providers} />
                    </td>
                    <td className="p-3 text-xs text-text-secondary">
                      {p.first_date ?? "—"}
                    </td>
                    <td className="p-3 text-xs text-text-secondary">
                      {p.last_date ?? "—"}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => refreshMut.mutate(p.isin)}
                          disabled={isRefreshing || refreshMut.isPending}
                          title="Limpiar caché y forzar re-descarga"
                          className={cn(
                            "rounded border border-border-glass px-2 py-1 text-xs text-text-secondary",
                            "hover:border-accent-glow/50 hover:text-accent-glow",
                            "disabled:cursor-not-allowed disabled:opacity-40",
                            "transition-colors",
                          )}
                        >
                          {isRefreshing ? "⏳ Actualizando..." : "🔄 Actualizar"}
                        </button>
                        {!isRefreshing && (
                          <DownloadByProviderButtons
                            onRefresh={(provider) =>
                              refreshWithChoiceMut.mutate({ isin: p.isin, provider })
                            }
                            currentProviders={p.providers}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Info box */}
      <div className="glass-panel p-4 text-xs text-text-secondary">
        <p className="mb-1 font-semibold text-white">ℹ️ Cómo funciona</p>
        <ul className="list-disc space-y-1 pl-4">
          <li>
            Los datos de historial NAV se descargan de <strong className="text-white">Finect</strong> (prioridad),{" "}
            <strong className="text-white">Yahoo Finance</strong> y{" "}
            <strong className="text-white">FMP</strong> en paralelo; gana el que aporta más datos.
          </li>
          <li>
            La caché expira cada <strong className="text-white">3 días</strong>. Si un fondo muestra
            "Sin caché", se descargará en el próximo recálculo.
          </li>
          <li>
            Si un fondo aparece "Sin datos", prueba a pulsar{" "}
            <strong className="text-white">Actualizar</strong> para forzar una nueva descarga.
            Si persiste, es posible que el fondo no esté disponible en ningún proveedor.
          </li>
          <li>
            El historial máximo solicitado es de <strong className="text-white">30 años</strong>.
          </li>
        </ul>
      </div>
    </div>
  );
}
