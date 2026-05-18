import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
export { usePortfolioSummary } from "@/hooks/use-shared-queries";

/** Stable query defaults for data that rarely changes */
const STABLE = { staleTime: Infinity, gcTime: Infinity } as const;

/** Hook for real evolution data */
export function useRealEvolution() {
  return useQuery({
    queryKey: ["portfolio", "real-evolution"],
    queryFn: api.getRealEvolution,
    ...STABLE,
  });
}

/** Hook for last update date */
export function useLastUpdate() {
  return useQuery({
    queryKey: ["portfolio", "last-update"],
    queryFn: api.getLastUpdate,
    ...STABLE,
  });
}

/** Hook for orders summary (monthly/yearly) */
export function useOrdersSummary() {
  return useQuery({
    queryKey: ["portfolio", "orders-summary"],
    queryFn: api.getOrdersSummary,
    ...STABLE,
  });
}

/** Hook to add a fund to the portfolio */
export function useAddFund() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      Fondo: string;
      TIPO: string;
      Porcentaje: number;
      ISIN?: string;
      Valor_Actual?: number;
      Capital_Invertido?: number;
    }) => api.addFund(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portfolio"] });
    },
  });
}

/** Hook to delete a fund from the portfolio */
export function useDeleteFund() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (isinOrName: string) => api.deleteFund(isinOrName),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portfolio"] });
    },
  });
}
