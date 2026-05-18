import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { RebalanceRequest } from "@/types";

export { usePortfolioSummary as useSummary } from "@/hooks/use-shared-queries";
export { useHistoryBatch as useHistoryBatchForSim } from "@/hooks/use-shared-queries";

export function usePositions() {
  return useQuery({
    queryKey: ["positions"],
    queryFn: api.getPositions,
  });
}

export function useSimulate() {
  return useMutation({
    mutationFn: (body: { isin: string; amount: number }) =>
      api.simulate(body),
  });
}

export function useRebalance() {
  return useMutation({
    mutationFn: (body: RebalanceRequest) =>
      api.rebalance(body),
  });
}
