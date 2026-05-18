import { useQuery, useMutation, keepPreviousData } from "@tanstack/react-query";
import { api } from "@/api/client";
import type {
  TimingPresetsResponse,
  OpportunityEntry,
  OpportunityChartData,
  EnrichedFund,
  FundComparisonResult,
} from "@/types";

/* ─── Scanner hooks ────────────────────────────────────────────────────── */

export function useTimingPresets() {
  return useQuery<TimingPresetsResponse>({
    queryKey: ["timing-presets"],
    queryFn: api.getTimingPresets,
    staleTime: Infinity,
  });
}

export function useOpportunities(weights: Record<string, number>) {
  return useQuery<OpportunityEntry[]>({
    queryKey: ["opportunities", weights],
    queryFn: () => api.getOpportunities(weights),
    enabled: Object.keys(weights).length > 0,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
}

export function useOpportunityChartData(isin: string | null, months = 12) {
  return useQuery<OpportunityChartData>({
    queryKey: ["opportunity-chart", isin, months],
    queryFn: () => api.getOpportunityChartData(isin!, months),
    enabled: !!isin,
    staleTime: 10 * 60_000,
  });
}

/* ─── Explorer hooks ───────────────────────────────────────────────────── */

export function useEnrichFunds() {
  return useMutation<EnrichedFund[], Error, string[]>({
    mutationFn: (isins) => api.enrichFunds(isins),
  });
}

export function useCompareFunds() {
  return useMutation<FundComparisonResult, Error, { isins: string[]; years: number }>({
    mutationFn: ({ isins, years }) => api.compareFunds(isins, years),
  });
}
