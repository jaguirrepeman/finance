import { Routes, Route, Navigate } from "react-router";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { GeneralTab } from "@/features/general";
import { Spinner } from "@/components/ui/spinner";
import { Suspense, lazy } from "react";

// Lazy-loaded tabs
const DetailsTab = lazy(() =>
  import("@/features/details").then((m) => ({ default: m.DetailsTab })),
);
const EvolutionTab = lazy(() =>
  import("@/features/evolution").then((m) => ({ default: m.EvolutionTab })),
);
const OpportunitiesTab = lazy(() =>
  import("@/features/opportunities").then((m) => ({
    default: m.OpportunitiesTab,
  })),
);
const SimulatorTab = lazy(() =>
  import("@/features/simulator").then((m) => ({ default: m.SimulatorTab })),
);
const WithdrawalsTab = lazy(() =>
  import("@/features/withdrawals").then((m) => ({
    default: m.WithdrawalsTab,
  })),
);
const PortfoliosTab = lazy(() =>
  import("@/features/portfolios").then((m) => ({
    default: m.PortfoliosTab,
  })),
);
const ProvidersTab = lazy(() =>
  import("@/features/providers").then((m) => ({
    default: m.ProvidersTab,
  })),
);

function TabFallback() {
  return (
    <div className="flex items-center justify-center py-20">
      <Spinner />
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route element={<DashboardLayout />}>
        <Route index element={<GeneralTab />} />
        <Route
          path="details"
          element={
            <Suspense fallback={<TabFallback />}>
              <DetailsTab />
            </Suspense>
          }
        />
        <Route
          path="evolution"
          element={
            <Suspense fallback={<TabFallback />}>
              <EvolutionTab />
            </Suspense>
          }
        />
        <Route
          path="opportunities"
          element={
            <Suspense fallback={<TabFallback />}>
              <OpportunitiesTab />
            </Suspense>
          }
        />
        <Route
          path="simulator"
          element={
            <Suspense fallback={<TabFallback />}>
              <SimulatorTab />
            </Suspense>
          }
        />
        <Route
          path="withdrawals"
          element={
            <Suspense fallback={<TabFallback />}>
              <WithdrawalsTab />
            </Suspense>
          }
        />
        <Route
          path="portfolios"
          element={
            <Suspense fallback={<TabFallback />}>
              <PortfoliosTab />
            </Suspense>
          }
        />
        <Route
          path="providers"
          element={
            <Suspense fallback={<TabFallback />}>
              <ProvidersTab />
            </Suspense>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
