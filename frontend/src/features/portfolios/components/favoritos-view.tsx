import { useState, useCallback } from "react";
import { Search, Star } from "lucide-react";
import { Spinner } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { api } from "@/api/client";
import { useFavorites, useAddFavorite, useRemoveFavorite } from "../hooks";
import type { FundSearchResult } from "@/types";

export function FavoritosView() {
  const { data: favorites, isLoading } = useFavorites();
  const addMut = useAddFavorite();
  const removeMut = useRemoveFavorite();

  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<FundSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const data = await api.searchFund(searchQuery.trim());
      setResults(data);
    } finally {
      setSearching(false);
    }
  }, [searchQuery]);

  const isFavorite = useCallback(
    (isin: string) => favorites?.some((f) => f.isin === isin) ?? false,
    [favorites],
  );

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Info */}
      <p className="text-sm text-text-secondary">
        Tu lista de fondos favoritos. Busca y añade fondos para seguirlos.
      </p>

      {/* Search */}
      <div className="relative">
        <div className="flex gap-2">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Buscar fondos por nombre o ISIN..."
            className="flex-1 rounded-lg border border-border-glass bg-bg-glass px-3 py-2 text-sm text-white placeholder:text-text-secondary focus:border-accent-glow focus:outline-none"
          />
          <button
            onClick={handleSearch}
            disabled={searching}
            className="rounded-lg bg-accent-glow px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-50"
          >
            {searching ? "..." : <Search className="size-3.5" />}
          </button>
        </div>

        {results.length > 0 && (
          <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-border-glass bg-bg-glass shadow-xl">
            {results.map((r) => (
              <div
                key={r.isin}
                className="flex items-center justify-between px-3 py-2 text-sm hover:bg-white/5"
              >
                <div>
                  <span className="font-medium">{r.name}</span>
                  <span className="ml-2 text-xs text-text-secondary">
                    {r.isin}
                  </span>
                  {r.in_portfolio && (
                    <span className="ml-2 rounded bg-accent-glow/15 px-1 py-0.5 text-[10px] text-accent-glow">
                      En cartera
                    </span>
                  )}
                  {isFavorite(r.isin) && (
                    <span className="ml-1 rounded bg-yellow-400/15 px-1 py-0.5 text-[10px] text-yellow-400">
                      En favoritos
                    </span>
                  )}
                </div>
                {!isFavorite(r.isin) && (
                  <button
                    onClick={() => {
                      addMut.mutate({ isin: r.isin, name: r.name });
                      setResults([]);
                      setSearchQuery("");
                    }}
                    className="text-xs text-accent-glow hover:underline"
                  >
                    ➕ Añadir
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Favorites list */}
      {(favorites ?? []).length > 0 ? (
        <div className="space-y-2">
          {favorites!.map((f) => (
            <div
              key={f.isin}
              className="glass-panel flex items-center justify-between p-3"
            >
              <div className="flex items-center gap-2">
                <span className="text-yellow-400"><Star className="size-4 fill-yellow-400" /></span>
                <div>
                  <div className="font-medium">{f.name}</div>
                  <div className="flex items-center gap-2 text-xs text-text-secondary">
                    <span>{f.isin}</span>
                    {f.category && <span>· {f.category}</span>}
                    {f.added_at && <span>· {fmtDate(f.added_at)}</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {f.url && (
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-accent-glow hover:underline"
                  >
                    Finect ↗
                  </a>
                )}
                <button
                  onClick={() => removeMut.mutate(f.isin)}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  ✕ Quitar
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="py-8 text-center text-sm text-text-secondary">
          No tienes fondos favoritos aún. Usa el buscador para añadir.
        </p>
      )}
    </div>
  );
}
