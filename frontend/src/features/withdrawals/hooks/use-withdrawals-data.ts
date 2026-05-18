import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/api/client";

const FIVE_MIN = 5 * 60 * 1000;

export function useTraspasoAnalysis() {
  return useQuery({
    queryKey: ["traspaso-analysis"],
    queryFn: api.getTraspasoAnalysis,
    staleTime: FIVE_MIN,
    gcTime: FIVE_MIN * 2,
  });
}

export function useTraspasoOptimize() {
  return useMutation({
    mutationFn: (targetAmount: number) =>
      api.traspasoOptimize({ target_amount: targetAmount }),
  });
}

export function useTaxOptimize() {
  return useMutation({
    mutationFn: (targetAmount: number) =>
      api.taxOptimize({ target_amount: targetAmount }),
  });
}
