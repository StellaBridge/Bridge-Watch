import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAssets, getBridges } from "../services/api";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type SearchCategory = "assets" | "bridges" | "pages";

export interface SearchResult {
  id: string;
  /** Display title shown in the results list. */
  title: string;
  /** Optional secondary line (e.g. bridge status or asset description). */
  subtitle?: string;
  category: SearchCategory;
  /** React Router path to navigate to on selection. */
  href: string;
  /** Raw value used for highlight matching (defaults to title). */
  matchText?: string;
}

const STORAGE_KEY = "bridge-watch:recent-searches";
const MAX_RECENT = 8;
const DEBOUNCE_MS = 200;

// ─── Static page results ───────────────────────────────────────────────────────

const PAGE_RESULTS: SearchResult[] = [
  {
    id: "page-dashboard",
    title: "Dashboard",
    subtitle: "Overview of all assets and bridges",
    category: "pages",
    href: "/",
  },
  {
    id: "page-bridges",
    title: "Bridges",
    subtitle: "Cross-chain bridge status and TVL",
    category: "pages",
    href: "/bridges",
  },
  {
    id: "page-analytics",
    title: "Analytics",
    subtitle: "Historical data and performance metrics",
    category: "pages",
    href: "/analytics",
  },
];

// ─── Local storage helpers ─────────────────────────────────────────────────────

function loadRecentSearches(): SearchResult[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SearchResult[]) : [];
  } catch {
    return [];
  }
}

function saveRecentSearches(items: SearchResult[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_RECENT)));
  } catch {
    // Storage quota exceeded – ignore
  }
}

// ─── Scoring helper ───────────────────────────────────────────────────────────

/** Returns a numeric match score (higher = better). Used to rank results. */
function matchScore(text: string, query: string): number {
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  if (t === q) return 3;
  if (t.startsWith(q)) return 2;
  if (t.includes(q)) return 1;
  return 0;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseSearchReturn {
  query: string;
  setQuery: (q: string) => void;
  results: SearchResult[];
  isLoading: boolean;
  recentSearches: SearchResult[];
  addRecentSearch: (result: SearchResult) => void;
  clearRecentSearches: () => void;
  /** The debounced query that was used to compute `results`. */
  debouncedQuery: string;
}

export function useSearch(): UseSearchReturn {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [recentSearches, setRecentSearches] = useState<SearchResult[]>(
    loadRecentSearches
  );

  // ── Debounce ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // ── Data fetching ────────────────────────────────────────────────────────────
  const { data: assetsData, isLoading: assetsLoading } = useQuery({
    queryKey: ["assets"],
    queryFn: getAssets,
    staleTime: 60_000,
  });

  const { data: bridgesData, isLoading: bridgesLoading } = useQuery({
    queryKey: ["bridges"],
    queryFn: getBridges,
    staleTime: 60_000,
  });

  const isLoading = assetsLoading || bridgesLoading;

  // ── Result computation ───────────────────────────────────────────────────────
  const results = useMemo<SearchResult[]>(() => {
    const q = debouncedQuery;
    if (!q) return [];

    const scored: Array<{ result: SearchResult; score: number }> = [];

    // Assets
    if (assetsData?.assets) {
      for (const asset of assetsData.assets) {
        const nameScore = matchScore(asset.name ?? asset.symbol, q);
        const symbolScore = matchScore(asset.symbol, q);
        const score = Math.max(nameScore, symbolScore);
        if (score > 0) {
          scored.push({
            score,
            result: {
              id: `asset-${asset.symbol}`,
              title: asset.symbol,
              subtitle: asset.name,
              category: "assets",
              href: `/assets/${asset.symbol}`,
              matchText: `${asset.symbol} ${asset.name ?? ""}`.trim(),
            },
          });
        }
      }
    }

    // Bridges
    if (bridgesData?.bridges) {
      for (const bridge of bridgesData.bridges) {
        const score = matchScore(bridge.name, q);
        if (score > 0) {
          scored.push({
            score,
            result: {
              id: `bridge-${bridge.name}`,
              title: bridge.name,
              subtitle: `Status: ${bridge.status} · TVL $${(
                bridge.totalValueLocked / 1_000_000
              ).toFixed(2)}M`,
              category: "bridges",
              href: "/bridges",
              matchText: bridge.name,
            },
          });
        }
      }
    }

    // Pages
    for (const page of PAGE_RESULTS) {
      const score = Math.max(
        matchScore(page.title, q),
        matchScore(page.subtitle ?? "", q)
      );
      if (score > 0) {
        scored.push({ score, result: page });
      }
    }

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.result.title.localeCompare(b.result.title);
    });

    return scored.map((s) => s.result);
  }, [debouncedQuery, assetsData, bridgesData]);

  // ── Recent search management ─────────────────────────────────────────────────
  const addRecentSearch = useCallback((result: SearchResult) => {
    setRecentSearches((prev) => {
      const deduped = [result, ...prev.filter((r) => r.id !== result.id)];
      const trimmed = deduped.slice(0, MAX_RECENT);
      saveRecentSearches(trimmed);
      return trimmed;
    });
  }, []);

  const clearRecentSearches = useCallback(() => {
    setRecentSearches([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return {
    query,
    setQuery,
    results,
    isLoading,
    recentSearches,
    addRecentSearch,
    clearRecentSearches,
    debouncedQuery,
  };
}
