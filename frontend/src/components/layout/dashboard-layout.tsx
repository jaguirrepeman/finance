import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { RefreshCw, Upload } from "lucide-react";
import { useState, useCallback, useEffect, useRef } from "react";
import { UploadOrdersModal } from "./upload-orders-modal";
import { MobileNav } from "./mobile-nav";
import { TABS, TAB_PATHS } from "./nav-tabs";
import { useAppGestures } from "@/hooks/use-app-gestures";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { cn } from "@/lib/utils";

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
  const location = useLocation();
  const navigate = useNavigate();

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

  const handlePrefetch = useCallback(
    (to: string) => PREFETCH[to]?.(queryClient),
    [queryClient],
  );

  // --- Navegación por deslizamiento (móvil) ---
  const currentIdx = TAB_PATHS.indexOf(location.pathname);
  const goRelative = useCallback(
    (delta: number) => {
      const i = TAB_PATHS.indexOf(location.pathname);
      if (i === -1) return; // ruta fuera del set de pestañas → no navegar
      const next = i + delta;
      if (next < 0 || next >= TAB_PATHS.length) return; // sin wrap-around
      handlePrefetch(TAB_PATHS[next]);
      navigate(TAB_PATHS[next]);
    },
    [location.pathname, navigate, handlePrefetch],
  );

  const { ref: gestureRef, pull, refreshing: pulling } = useAppGestures({
    onSwipeLeft: () => goRelative(1),
    onSwipeRight: () => goRelative(-1),
    onPull: handleRefresh,
  });

  // --- Dirección de la transición (según el orden de pestañas) ---
  const [dir, setDir] = useState(1);
  const prevIdxRef = useRef(currentIdx);
  useEffect(() => {
    if (currentIdx !== -1 && prevIdxRef.current !== -1 && currentIdx !== prevIdxRef.current) {
      setDir(currentIdx > prevIdxRef.current ? 1 : -1);
    }
    prevIdxRef.current = currentIdx;
  }, [currentIdx]);

  const pullY = pulling ? 50 : pull;

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-6 pb-24 md:px-8 md:pb-6">
      {/* Indicador de pull-to-refresh (solo móvil) */}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-[8000] flex justify-center md:hidden"
        style={{
          transform: `translateY(${pullY}px)`,
          opacity: pullY > 6 ? 1 : 0,
          transition: pull > 0 && !pulling ? "none" : "transform .2s ease, opacity .2s ease",
        }}
      >
        <div className="glass-panel-sm mt-1 rounded-full p-2">
          <RefreshCw
            className={cn(
              "h-5 w-5 text-accent-glow",
              (pulling || pull >= 70) && "animate-spin",
            )}
          />
        </div>
      </div>

      {/* Header */}
      <header className="mb-6 flex flex-row items-center justify-between gap-3 md:mb-8">
        <h1 className="gradient-text text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl">
          Portfolio Tracker
        </h1>
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => setIsUploadModalOpen(true)}
            aria-label="Subir fichero"
            className={cn(
              "glass-panel-sm flex items-center gap-2 px-3 py-2 text-sm font-medium sm:px-4",
              "text-text-secondary transition-colors hover:text-accent-glow",
            )}
          >
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline">Subir Fichero</span>
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            aria-label="Recalcular"
            className={cn(
              "glass-panel-sm flex items-center gap-2 px-3 py-2 text-sm font-medium sm:px-4",
              "text-text-secondary transition-colors hover:text-accent-glow",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            <span className="hidden sm:inline">Recalcular</span>
          </button>
        </div>
      </header>

      {/* Tab navigation (escritorio) — en móvil se usa la barra inferior */}
      <nav className="mb-6 hidden gap-1 overflow-x-auto rounded-2xl border border-border-glass bg-bg-glass/30 p-1 md:flex">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
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

      {/* Tab content — contenedor de gestos táctiles */}
      <main ref={gestureRef} className="overflow-x-hidden">
        <div
          key={location.pathname}
          className={cn("page-transition", dir >= 0 ? "page-from-right" : "page-from-left")}
        >
          <Outlet />
        </div>
      </main>

      {/* Navegación inferior (solo móvil) */}
      <MobileNav tabs={TABS} primaryCount={4} onPrefetch={handlePrefetch} />

      {/* Modals */}
      <UploadOrdersModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
      />
    </div>
  );
}
