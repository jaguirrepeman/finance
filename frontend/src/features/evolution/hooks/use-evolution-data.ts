import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";

export { useHistoryBatch } from "@/hooks/use-shared-queries";

/** Stable query defaults */
const STABLE = { staleTime: Infinity, gcTime: Infinity } as const;

/** Fetch server-side correlation matrix */
export function useCorrelation() {
  return useQuery({
    queryKey: ["correlation"],
    queryFn: api.getCorrelation,
    ...STABLE,
  });
}

/** Fetch annual returns data */
export function useAnnualReturns() {
  return useQuery({
    queryKey: ["annual-returns"],
    queryFn: api.getAnnualReturns,
    ...STABLE,
  });
}
