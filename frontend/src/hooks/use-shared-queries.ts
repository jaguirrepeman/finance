import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";

/** Stable query defaults — data that barely changes during a session */
const STABLE = { staleTime: Infinity, gcTime: Infinity } as const;

/**
 * Shared portfolio summary query — canonical hook used by both
 * the General tab and the Simulator.
 */
export function usePortfolioSummary() {
  return useQuery({
    queryKey: ["portfolio", "summary"],
    queryFn: api.getSummary,
    ...STABLE,
  });
}

/**
 * Shared NAV history-batch query — canonical hook used by both
 * the Evolution tab and the Simulator.
 */
export function useHistoryBatch() {
  return useQuery({
    queryKey: ["history-batch"],
    queryFn: () => api.getHistoryBatch(),
    ...STABLE,
  });
}

/**
 * Shared positions query — returns ISINs of all current portfolio positions.
 * Used by fund-search pickers to highlight portfolio funds.
 */
export function usePortfolioPositions() {
  return useQuery({
    queryKey: ["portfolio", "positions"],
    queryFn: api.getPositions,
    staleTime: 5 * 60 * 1000,
  });
}
