import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import type {
  SavedPortfolio,
  FavoriteFund,
  PortfolioComparisonResult,
} from "@/types";

/* ─── Portfolios CRUD ──────────────────────────────────────────────────── */

export function usePortfolios() {
  return useQuery<SavedPortfolio[]>({
    queryKey: ["portfolios"],
    queryFn: api.getPortfolios,
  });
}

export function usePortfolioDetail(id: string | null) {
  return useQuery<SavedPortfolio>({
    queryKey: ["portfolio", id],
    queryFn: () => api.getPortfolio(id!),
    enabled: !!id,
  });
}

export function useCreatePortfolio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Omit<SavedPortfolio, "id" | "created_at" | "updated_at">) =>
      api.createPortfolio(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["portfolios"] }),
  });
}

export function useUpdatePortfolio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: Partial<SavedPortfolio>;
    }) => api.updatePortfolio(id, body),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ["portfolios"] });
      qc.invalidateQueries({ queryKey: ["portfolio", id] });
      // Invalidate all comparison queries — the portfolio changed
      qc.invalidateQueries({ queryKey: ["compare-portfolio-history"] });
    },
  });
}

export function useDeletePortfolio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deletePortfolio(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["portfolios"] }),
  });
}

export function useCloneCurrentPortfolio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.cloneCurrentPortfolio(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["portfolios"] }),
  });
}

/* ─── Favorites ────────────────────────────────────────────────────────── */

export function useFavorites() {
  return useQuery<FavoriteFund[]>({
    queryKey: ["favorites"],
    queryFn: api.getFavorites,
  });
}

export function useAddFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { isin: string; name: string }) =>
      api.addFavorite(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["favorites"] }),
  });
}

export function useRemoveFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (isin: string) => api.removeFavorite(isin),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["favorites"] }),
  });
}

/* ─── Compare ──────────────────────────────────────────────────────────── */

export function useComparePortfolios() {
  return useMutation<
    PortfolioComparisonResult,
    Error,
    { portfolio_a: string; portfolio_b: string; years: number }
  >({
    mutationFn: (body) => api.comparePortfolios(body),
  });
}
