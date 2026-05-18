import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { api } from "@/api/client";
import type { FundSearchResult } from "@/types";

/** Shared dropdown panel style matching the dashboard glass aesthetic */
const DROPDOWN_STYLE: React.CSSProperties = {
  background: "rgba(18, 18, 30, 0.97)",
  border: "1px solid rgba(139, 92, 246, 0.25)",
  borderRadius: 10,
  boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
};

interface FundSearchInputProps {
  onSelect: (fund: FundSearchResult) => void;
  placeholder?: string;
  className?: string;
  /**
   * ISINs that should appear at the top of the search results
   * (e.g. current portfolio funds + favorites).
   * @deprecated use portfolioIsins / favoriteIsins for distinct icons
   */
  priorityIsins?: string[];
  /** ISINs belonging to saved portfolios */
  portfolioIsins?: string[];
  /** ISINs that are favorited */
  favoriteIsins?: string[];
  /**
   * Full favorites list with name + ISIN.
   * When provided, favorites matching the query are pre-filtered
   * client-side and shown first — before and regardless of the API response.
   */
  favoritesData?: Array<{ isin: string; name: string }>;
}

export function FundSearchInput({
  onSelect,
  placeholder = "Buscar fondo por nombre, ISIN o ticker (ej. NUKL)...",
  className,
  priorityIsins,
  portfolioIsins,
  favoriteIsins,
  favoritesData,
}: FundSearchInputProps) {
  // Stabilize set references — only rebuild when the serialized list changes
  const allPortfolioIsins = useMemo(
    () => new Set([...(portfolioIsins ?? [])]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [portfolioIsins?.join(",")],
  );
  const allFavoriteIsins = useMemo(
    () =>
      new Set([
        ...(favoriteIsins ?? []),
        ...(priorityIsins ?? []).filter((i) => !allPortfolioIsins.has(i)),
      ]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [favoriteIsins?.join(","), priorityIsins?.join(","), allPortfolioIsins],
  );
  const allPriorityIsins = useMemo(
    () => [...allPortfolioIsins, ...allFavoriteIsins],
    [allPortfolioIsins, allFavoriteIsins],
  );

  const [query, setQuery] = useState("");
  // Raw API results cached between renders
  const rawApiResultsRef = useRef<FundSearchResult[]>([]);
  const [results, setResults] = useState<FundSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const [addedIsin, setAddedIsin] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const feedbackRef = useRef<ReturnType<typeof setTimeout>>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  /**
   * Build the final display list:
   *  1. Favorites matching the query — client-side, instant, always first
   *  2. Portfolio funds from API results
   *  3. Other API results (deduped vs favorites)
   */
  const buildDisplayList = useCallback(
    (apiResults: FundSearchResult[], currentQuery: string): FundSearchResult[] => {
      const q = currentQuery.toLowerCase().trim();

      // Client-side favorites that match the query
      const clientFavMatches: FundSearchResult[] =
        q.length >= 2
          ? (favoritesData ?? [])
              .filter(
                (f) =>
                  f.name.toLowerCase().includes(q) ||
                  f.isin.toLowerCase().includes(q),
              )
              .map((f) => ({
                isin: f.isin,
                name: f.name,
                in_portfolio: allPortfolioIsins.has(f.isin),
              }))
          : [];

      const clientFavIsins = new Set(clientFavMatches.map((f) => f.isin));

      // Sort API results: portfolio > other priority ISINs > rest
      const pSet = new Set(allPriorityIsins);
      const apiSorted = [...apiResults]
        .filter((r) => !clientFavIsins.has(r.isin)) // dedup
        .sort((a, b) => {
          const aScore =
            (a.in_portfolio || allPortfolioIsins.has(a.isin) ? 2 : 0) +
            (pSet.has(a.isin) ? 1 : 0);
          const bScore =
            (b.in_portfolio || allPortfolioIsins.has(b.isin) ? 2 : 0) +
            (pSet.has(b.isin) ? 1 : 0);
          return bScore - aScore;
        });

      return [...clientFavMatches, ...apiSorted];
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allPortfolioIsins, allFavoriteIsins, allPriorityIsins, favoritesData],
  );

  // Keep buildDisplayList in a ref so the SEARCH effect can always use the
  // latest version without being listed as a dep.
  // Priority changes should re-sort but NOT re-fetch — handled separately.
  const buildDisplayListRef = useRef(buildDisplayList);
  useEffect(() => {
    buildDisplayListRef.current = buildDisplayList;
  }, [buildDisplayList]);

  /** Recalculate dropdown position relative to the input element */
  const updateDropdownPosition = useCallback(() => {
    if (!inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    setDropdownStyle({
      position: "fixed",
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      zIndex: 9999,
    });
  }, []);

  // ── Search effect: only triggers on query change ──────────────────────────
  // Does NOT list sortByPriority / buildDisplayList as deps to avoid
  // re-fetching every time external queries load and priorities shift.
  useEffect(() => {
    if (query.length < 2) {
      rawApiResultsRef.current = [];
      setResults([]);
      setShowDropdown(false);
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);

    // Immediately show matching favorites (no API call yet)
    const immediate = buildDisplayListRef.current([], query);
    if (immediate.length > 0) {
      updateDropdownPosition();
      setResults(immediate);
      setShowDropdown(true);
    }

    timerRef.current = setTimeout(async () => {
      setSearching(true);
      updateDropdownPosition();
      try {
        const r = await api.searchFund(query);
        rawApiResultsRef.current = r;
        const sorted = buildDisplayListRef.current(r, query);
        setResults(sorted);
        if (sorted.length > 0) setShowDropdown(true);
      } catch {
        rawApiResultsRef.current = [];
        setResults([]);
        setShowDropdown(false);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, updateDropdownPosition]);

  // ── Re-sort effect: re-order existing results when priorities change ───────
  // Does NOT re-fetch. Runs only when buildDisplayList reference changes
  // (i.e. when favouriteIsins or portfolioIsins actually change).
  useEffect(() => {
    if (!query || query.length < 2) return;
    setResults(buildDisplayList(rawApiResultsRef.current, query));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildDisplayList]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (containerRef.current && !containerRef.current.contains(target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Update position on scroll/resize while dropdown is open
  useEffect(() => {
    if (!showDropdown) return;
    const update = () => updateDropdownPosition();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [showDropdown, updateDropdownPosition]);

  const handleSelect = (fund: FundSearchResult) => {
    onSelect(fund);
    setQuery("");
    setShowDropdown(false);
    setResults([]);
    rawApiResultsRef.current = [];
    // Brief checkmark feedback
    setAddedIsin(fund.isin);
    if (feedbackRef.current) clearTimeout(feedbackRef.current);
    feedbackRef.current = setTimeout(() => setAddedIsin(null), 1500);
  };

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => {
          if (results.length > 0) {
            updateDropdownPosition();
            setShowDropdown(true);
          }
        }}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border-glass bg-bg-glass px-3 py-2 text-sm text-white placeholder:text-text-secondary focus:border-accent-glow focus:outline-none"
      />
      {/* Spinner */}
      {searching && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-border-glass border-t-accent-glow" />
        </div>
      )}
      {/* Added feedback */}
      {addedIsin && !searching && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-accent-glow">
          ✓
        </div>
      )}
      {showDropdown && results.length > 0 &&
        createPortal(
          <div
            style={{ ...dropdownStyle, ...DROPDOWN_STYLE }}
            className="max-h-64 overflow-y-auto"
          >
            {results.map((fund) => {
              const isPortfolio = allPortfolioIsins.has(fund.isin) || fund.in_portfolio;
              const isFavorite = allFavoriteIsins.has(fund.isin);
              const isHighPriority = isPortfolio || isFavorite;
              return (
                <button
                  key={fund.isin}
                  onMouseDown={(e) => {
                    // prevent input blur before click fires
                    e.preventDefault();
                    handleSelect(fund);
                  }}
                  className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-white/5"
                  style={
                    isHighPriority
                      ? { borderLeft: "2px solid rgba(139, 92, 246, 0.4)" }
                      : undefined
                  }
                >
                  {/* Priority icon */}
                  {isPortfolio && (
                    <span className="shrink-0 text-sm" title="En tu cartera">📁</span>
                  )}
                  {!isPortfolio && isFavorite && (
                    <span className="shrink-0 text-sm" title="Favorito">⭐</span>
                  )}
                  {!isPortfolio && !isFavorite && (
                    <span className="shrink-0 w-5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">
                      {fund.ticker && fund.ticker !== fund.isin && (
                        <span className="mr-2 rounded bg-white/10 px-1.5 py-0.5 font-mono text-[0.7rem] text-text-secondary">
                          {fund.ticker}
                        </span>
                      )}
                      {fund.name}
                    </div>
                    <div className="text-xs text-text-secondary">
                      {fund.isin}
                      {fund.category && ` · ${fund.category}`}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {isPortfolio && (
                      <span className="rounded bg-accent-glow/20 px-1.5 py-0.5 text-[0.65rem] text-accent-glow">
                        En cartera
                      </span>
                    )}
                    {isFavorite && !isPortfolio && (
                      <span className="rounded bg-yellow-400/15 px-1.5 py-0.5 text-[0.65rem] text-yellow-400">
                        Favorito
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}