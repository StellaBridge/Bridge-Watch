import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import { useNavigate } from "react-router-dom";
import { useSearch, type SearchResult } from "../../hooks/useSearch";
import {
  SearchResults,
  RecentSearches,
  EmptyState,
} from "./SearchResults";

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SearchModal({ isOpen, onClose }: SearchModalProps) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    query,
    setQuery,
    results,
    isLoading,
    recentSearches,
    addRecentSearch,
    clearRecentSearches,
    debouncedQuery,
  } = useSearch();

  const [activeIndex, setActiveIndex] = useState(-1);

  // Flat ordered list of items visible right now (used for keyboard nav)
  const flatItems = useMemo<SearchResult[]>(() => {
    if (debouncedQuery) return results;
    return recentSearches;
  }, [debouncedQuery, results, recentSearches]);

  // Reset active index whenever the list changes
  useEffect(() => {
    setActiveIndex(-1);
  }, [flatItems]);

  // Focus input when modal opens, clear query on close
  useEffect(() => {
    if (isOpen) {
      // Small delay so the CSS transition doesn't interrupt focus
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    } else {
      setQuery("");
      setActiveIndex(-1);
    }
  }, [isOpen, setQuery]);

  // ── Selection handler ────────────────────────────────────────────────────────
  const handleSelect = useCallback(
    (result: SearchResult) => {
      addRecentSearch(result);
      onClose();
      navigate(result.href);
    },
    [addRecentSearch, onClose, navigate]
  );

  // ── Keyboard navigation ──────────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setActiveIndex((i) => Math.min(i + 1, flatItems.length - 1));
          break;

        case "ArrowUp":
          e.preventDefault();
          setActiveIndex((i) => Math.max(i - 1, -1));
          break;

        case "Enter":
          e.preventDefault();
          if (activeIndex >= 0 && flatItems[activeIndex]) {
            handleSelect(flatItems[activeIndex]);
          }
          break;

        case "Escape":
          e.preventDefault();
          onClose();
          break;

        default:
          break;
      }
    },
    [activeIndex, flatItems, handleSelect, onClose]
  );

  const showResults = debouncedQuery.length > 0;
  const showEmpty = showResults && !isLoading && results.length === 0;
  const showRecent = !showResults && recentSearches.length > 0;

  if (!isOpen) return null;

  return (
    // Backdrop – click outside to close
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4"
      aria-modal="true"
      role="dialog"
      aria-label="Global search"
    >
      {/* Blurred overlay */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal panel */}
      <div
        className="relative w-full max-w-xl bg-stellar-card border border-stellar-border rounded-xl shadow-2xl overflow-hidden"
        onKeyDown={handleKeyDown}
      >
        {/* Input row */}
        <div className="flex items-center gap-3 px-4 border-b border-stellar-border">
          {/* Search icon */}
          <svg
            className="flex-none w-5 h-5 text-stellar-text-secondary"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 1 0 6.5 6.5a7.5 7.5 0 0 0 10.15 10.15z"
            />
          </svg>

          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search assets, bridges, pages…"
            className="flex-1 bg-transparent py-4 text-white placeholder-stellar-text-secondary text-sm outline-none"
            aria-autocomplete="list"
            aria-controls="search-results-list"
            autoComplete="off"
            spellCheck={false}
          />

          {/* Loading spinner */}
          {isLoading && debouncedQuery && (
            <svg
              className="flex-none w-4 h-4 text-stellar-text-secondary animate-spin"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
              />
            </svg>
          )}

          {/* Clear button (visible when typing) */}
          {query && !isLoading && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="flex-none text-stellar-text-secondary hover:text-white transition-colors"
              aria-label="Clear search"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}

          {/* ESC pill */}
          <kbd className="flex-none hidden sm:inline-flex items-center gap-1 px-2 py-1 text-xs font-mono rounded bg-stellar-border text-stellar-text-secondary">
            ESC
          </kbd>
        </div>

        {/* Results / recent / empty state */}
        <div
          id="search-results-list"
          className="max-h-[60vh] overflow-y-auto py-2"
        >
          {showResults && !showEmpty && (
            <SearchResults
              results={results}
              query={debouncedQuery}
              activeIndex={activeIndex}
              onSelect={handleSelect}
              onHover={setActiveIndex}
              flatItems={flatItems}
            />
          )}

          {showEmpty && <EmptyState query={debouncedQuery} />}

          {showRecent && (
            <RecentSearches
              items={recentSearches}
              activeIndex={activeIndex}
              onSelect={handleSelect}
              onHover={setActiveIndex}
              onClear={clearRecentSearches}
            />
          )}

          {!showResults && !showRecent && (
            <div className="px-4 py-8 text-center text-xs text-stellar-text-secondary">
              Start typing to search across assets, bridges, and pages.
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-stellar-border flex items-center gap-4 text-xs text-stellar-text-secondary">
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded bg-stellar-border font-mono">↑</kbd>
            <kbd className="px-1.5 py-0.5 rounded bg-stellar-border font-mono">↓</kbd>
            navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded bg-stellar-border font-mono">↵</kbd>
            select
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded bg-stellar-border font-mono">ESC</kbd>
            close
          </span>
        </div>
      </div>
    </div>
  );
}
