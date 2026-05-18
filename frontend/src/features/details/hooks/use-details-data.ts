import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";

/** Stable query defaults */
const STABLE = { staleTime: Infinity, gcTime: Infinity } as const;

/** Fetch the fund details map (sector/region data per fund) */
export function useDetails() {
  return useQuery({
    queryKey: ["details"],
    queryFn: api.getDetails,
    ...STABLE,
  });
}

/** Fetch benchmark (MSCI World) data */
export function useBenchmark() {
  return useQuery({
    queryKey: ["benchmark-msci"],
    queryFn: api.getBenchmarkMsci,
    ...STABLE,
  });
}

/** Fetch aggregated portfolio holdings */
export function usePortfolioHoldings() {
  return useQuery({
    queryKey: ["portfolio-holdings"],
    queryFn: api.getPortfolioHoldings,
    ...STABLE,
  });
}

/** Fetch individual fund detail */
export function useFundDetail(isin: string | null) {
  return useQuery({
    queryKey: ["fund-detail", isin],
    queryFn: () => api.getFundDetail(isin!),
    enabled: !!isin,
    ...STABLE,
  });
}

/** Mutation to force-refresh a fund's detail from Finect */
export function useRefreshFundDetail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (isin: string) => api.getFundDetail(isin, true),
    onSuccess: (data, isin) => {
      qc.setQueryData(["fund-detail", isin], data);
    },
  });
}
