import { NavLink, Outlet } from "react-router";
import { RefreshCw } from "lucide-react";
import { useState, useCallback, useEffect } from "react";
import { UploadOrdersModal } from "./upload-orders-modal";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/", label: "General", end: true },
  { to: "/details", label: "Detalles" },
  { to: "/evolution", label: "Evolución" },
  { to: "/opportunities", label: "Oportunidades" },
  { to: "/simulator", label: "Proyección" },
  { to: "/withdrawals", label: "Retiradas" },
  { to: "/portfolios", label: "Carteras" },
  { to: "/favoritos", label: "Favoritos" },
  { to: "/providers", label: "Proveedores" },
] as const;

const STABLE = { staleTime: Infinity, gcTime: Infinity } as const;

/** Prefetch map: start fetching heavy data before the user clicks */
const PREFETCH: Record<string, (qc: ReturnType<typeof useQueryClient>) => void> = {
  "/": (qc) => {
    qc.prefetchQuery({ queryKey: ["portfolio", "real-evolution"], queryFn: api.getRealEvolution, ...STABLE });
    qc.prefetchQuery({ queryKey: ["portfolio", "orders-summary"], queryFn: api.getOrdersSummary, ...STABLE });
  },
  "/details": (qc) => {
    qc.prefetchQuery({ queryKey: ["details"], queryFn: api.getDetails, ...STABLE });
  },
  "/evolution": (qc) => {
    qc.prefetchQuery({ queryKey: ["history-batch"], queryFn: () => api.getHistoryBatch(), ...STABLE });
    qc.prefetchQuery({ queryKey: ["annual-returns"], queryFn: api.getAnnualReturns, ...STABLE });
  },
  "/simulator": (qc) => {
    qc.prefetchQuery({ queryKey: ["portfolio", "summary"], queryFn: api.getSummary, ...STABLE });
    qc.prefetchQuery({ queryKey: ["history-batch"], queryFn: () => api.getHistoryBatch(), ...STABLE });
  },
  "/withdrawals": (qc) => {
    qc.prefetchQuery({ queryKey: ["traspaso-analysis"], queryFn: api.getTraspasoAnalysis });
  },
};

export function DashboardLayout() {
  const [refreshing, setRefreshing] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const queryClient = useQueryClient();

  // Eagerly prefetch the most critical data so tabs feel instant
  useEffect(() => {
    // Batch: summary + real-evolution + history-batch (needed by 3 tabs)
    queryClient.prefetchQuery({ queryKey: ["portfolio", "summary"], queryFn: api.getSummary, ...STABLE });
    queryClient.prefetchQuery({ queryKey: ["portfolio", "real-evolution"], queryFn: api.getRealEvolution, ...STABLE });
    // Stagger heavier requests slightly so they don't clog the browser
    const t = setTimeout(() => {
      queryClient.prefetchQuery({ queryKey: ["history-batch"], queryFn: () => api.getHistoryBatch(), ...STABLE });
      queryClient.prefetchQuery({ queryKey: ["annual-returns"], queryFn: api.getAnnualReturns, ...STABLE });
    }, 400);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await api.refreshNav();
      // Invalidate all cached data so tabs fetch fresh values
      queryClient.invalidateQueries();
    } finally {
      setTimeout(() => setRefreshing(false), 2000);
    }
  }, [queryClient]);

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-6 md:px-8">
      {/* Header */}
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="gradient-text text-3xl font-bold tracking-tight md:text-4xl">
          Portfolio Tracker
        </h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsUploadModalOpen(true)}
            className={cn(
              "glass-panel-sm flex items-center gap-2 px-4 py-2 text-sm font-medium",
              "text-text-secondary transition-colors hover:text-accent-glow"
            )}
          >
            Subir Fichero
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className={cn(
              "glass-panel-sm flex items-center gap-2 px-4 py-2 text-sm font-medium",
              "text-text-secondary transition-colors hover:text-accent-glow",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            <RefreshCw
              className={cn("h-4 w-4", refreshing && "animate-spin")}
            />
            Recalcular
          </button>
        </div>
      </header>

      {/* Tab navigation */}
      <nav className="mb-6 flex gap-1 overflow-x-auto rounded-2xl border border-border-glass bg-bg-glass/30 p-1">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={"end" in tab ? tab.end : undefined}
            onMouseEnter={() => PREFETCH[tab.to]?.(queryClient)}
            className={({ isActive }) =>
              cn(
                "whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-medium transition-all",
                isActive
                  ? "bg-accent-glow/15 text-accent-glow shadow-sm"
                  : "text-text-secondary hover:bg-bg-glass-hover hover:text-text-primary",
              )
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      {/* Tab content */}
      <main>
        <Outlet />
      </main>

      {/* Modals */}
      <UploadOrdersModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
      />
    </div>
  );
}
