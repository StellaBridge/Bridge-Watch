/* eslint-disable @typescript-eslint/no-explicit-any */
import { Suspense, useMemo, useRef, useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useBridges } from "../hooks/useBridges";
import { useFavorites } from "../hooks/useFavorites";
import { useRefreshControls } from "../hooks/useRefreshControls";
import { usePullToRefresh } from "../hooks/usePullToRefresh";
import { useSearchSuggestions } from "../hooks/useSearchSuggestions";
import BridgeStatusCard from "../components/BridgeStatusCard";
import BridgeNotesPanel from "../components/BridgeNotesPanel";
import BridgePauseReasonPanel from "../components/BridgePauseReasonPanel";
import EvmLockDetailsPanel from "../components/EvmLockDetailsPanel";
import FavoriteTagChip from "../components/favorites/FavoriteTagChip";
import RefreshControls from "../components/RefreshControls";
import PullToRefresh from "../components/PullToRefresh";
import { SkeletonCard, ErrorBoundary } from "../components/Skeleton";

export default function Bridges() {
  const [searchParams] = useSearchParams();
  const selectedBridge = searchParams.get("selected") ?? null;
  const navigate = useNavigate();

  const {
    favoritesFilterMode,
    setFavoritesFilterMode,
    toggleFavoriteBridge,
    favoriteBridges,
  } = useFavorites();

  const refreshControls = useRefreshControls({
    viewId: "bridges",
    targets: [{ id: "bridges", label: "Bridge status", queryKey: ["bridges"] }],
    defaultIntervalMs: 30_000,
  });

  const { data, isLoading, refetch } = useBridges({
    refetchInterval: refreshControls.preferences.autoRefreshEnabled
      ? refreshControls.preferences.refreshIntervalMs
      : false,
    refetchOnWindowFocus: refreshControls.preferences.refreshOnFocus,
  });
  const pullToRefresh = usePullToRefresh({
    enabled: true,
    onRefresh: refreshControls.refreshNow,
  });

  const filteredBridges = useMemo(() => {
    const bridges = data?.bridges ?? [];
    if (favoritesFilterMode !== "favorites") return bridges;
    return bridges.filter((b) => favoriteBridges.includes(b.name));
  }, [data?.bridges, favoritesFilterMode, favoriteBridges]);

  const {
    query,
    setQuery,
    suggestions,
    activeIndex,
    moveDown,
    moveUp,
    resetActiveIndex,
    addRecentSearch
  } = useSearchSuggestions();
  
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsSearchFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveDown();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveUp();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < suggestions.length) {
        handleSuggestionSelect(suggestions[activeIndex]);
      }
    } else if (e.key === "Escape") {
      setIsSearchFocused(false);
      resetActiveIndex();
    }
  };

  const handleSuggestionSelect = (result: any) => {
    addRecentSearch(result);
    setQuery("");
    setIsSearchFocused(false);
    resetActiveIndex();
    if (result.category === "bridge") {
      navigate(`?selected=${encodeURIComponent(result.title)}`);
    } else if (result.category === "asset") {
      navigate(`/assets/${encodeURIComponent(result.title)}`);
    }
  };

  return (
    <div className="space-y-8">
      <PullToRefresh
        isPulling={pullToRefresh.isPulling}
        pullDistance={pullToRefresh.pullDistance}
        progress={pullToRefresh.progress}
        isRefreshing={pullToRefresh.isRefreshing}
      />

      <div>
        <h1 className="text-3xl font-bold text-stellar-text-primary">Bridges</h1>
        <p className="mt-2 text-stellar-text-secondary">
          Monitor cross-chain bridge status, supply consistency, and performance
        </p>
      </div>

      <div className="relative z-10 w-full max-w-2xl" ref={searchContainerRef}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsSearchFocused(true)}
          onKeyDown={handleSearchKeyDown}
          placeholder="Search bridges by name or asset..."
          className="w-full min-h-[44px] rounded-md border border-stellar-border bg-stellar-card px-4 py-2 text-stellar-text-primary placeholder:text-stellar-text-secondary focus:border-stellar-blue focus:outline-none focus:ring-1 focus:ring-stellar-blue"
        />
        {isSearchFocused && query.length > 0 && suggestions.length > 0 && (
          <div className="absolute left-0 mt-1 w-full rounded-md border border-stellar-border bg-stellar-card shadow-lg z-20">
            <ul className="max-h-60 overflow-auto py-1">
              {suggestions.map((result, i) => (
                <li
                  key={result.id}
                  onClick={() => handleSuggestionSelect(result)}
                  className={`cursor-pointer px-4 py-2.5 min-h-[44px] text-sm flex flex-col justify-center ${
                    activeIndex === i ? "bg-stellar-blue/20 text-stellar-text-primary" : "text-stellar-text-secondary hover:bg-stellar-border"
                  }`}
                >
                  <span className="font-medium text-stellar-text-primary">{result.title}</span>
                  {result.subtitle && <span className="text-xs">{result.subtitle}</span>}
                  <span className="text-xs uppercase mt-0.5 text-stellar-blue/70">{result.category}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <RefreshControls
        autoRefreshEnabled={refreshControls.preferences.autoRefreshEnabled}
        onAutoRefreshEnabledChange={refreshControls.setAutoRefreshEnabled}
        refreshIntervalMs={refreshControls.preferences.refreshIntervalMs}
        onRefreshIntervalChange={refreshControls.setRefreshIntervalMs}
        refreshOnFocus={refreshControls.preferences.refreshOnFocus}
        onRefreshOnFocusChange={refreshControls.setRefreshOnFocus}
        targets={[{ id: "bridges", label: "Bridge status", refetch }]}
        selectedTargetIds={refreshControls.preferences.selectedTargetIds}
        onSelectedTargetIdsChange={refreshControls.setSelectedTargetIds}
        onRefresh={refreshControls.refreshNow}
        onCancelRefresh={refreshControls.cancelRefresh}
        isRefreshing={refreshControls.isRefreshing}
        lastUpdatedAt={refreshControls.lastUpdatedAt}
      />

      <div className="flex flex-wrap items-center justify-end gap-3">
        <div className="inline-flex rounded-full border border-stellar-border p-1 gap-1">
          <button
            type="button"
            className={`min-h-[44px] rounded-full px-4 py-2 text-xs font-medium transition-colors inline-flex items-center justify-center ${
              favoritesFilterMode === "all"
                ? "bg-stellar-blue text-white"
                : "text-stellar-text-secondary hover:text-white"
            }`}
            aria-pressed={favoritesFilterMode === "all"}
            onClick={() => setFavoritesFilterMode("all")}
          >
            All bridges
          </button>
          <button
            type="button"
            className={`min-h-[44px] rounded-full px-4 py-2 text-xs font-medium transition-colors inline-flex items-center justify-center ${
              favoritesFilterMode === "favorites"
                ? "bg-stellar-blue text-white"
                : "text-stellar-text-secondary hover:text-white"
            }`}
            aria-pressed={favoritesFilterMode === "favorites"}
            onClick={() => setFavoritesFilterMode("favorites")}
          >
            Favorites only
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            void pullToRefresh.refresh();
          }}
          className="min-h-[44px] inline-flex items-center justify-center rounded-md border border-stellar-border px-4 py-2 text-sm text-white hover:bg-stellar-border focus:outline-none focus:ring-2 focus:ring-stellar-blue"
        >
          Refresh now
        </button>
      </div>

      <ErrorBoundary onRetry={() => window.location.reload()}>
        <Suspense
          fallback={
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {[1, 2, 3].map((i) => (
                <SkeletonCard key={i} rows={6} ariaLabel={`Loading bridge card ${i}`} />
              ))}
            </div>
          }
        >
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {[1, 2, 3].map((i) => (
                <SkeletonCard key={i} rows={6} ariaLabel={`Loading bridge card ${i}`} />
              ))}
            </div>
          ) : data && data.bridges && data.bridges.length > 0 ? (
            filteredBridges.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {filteredBridges.map((bridge) => (
                  <BridgeStatusCard
                    key={bridge.name}
                    {...bridge}
                    topRight={
                      <FavoriteTagChip
                        compact
                        label={bridge.name}
                        active={favoriteBridges.includes(bridge.name)}
                        onToggle={() => toggleFavoriteBridge(bridge.name)}
                      />
                    }
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-stellar-border bg-stellar-card p-8 text-center">
                <p className="text-stellar-text-secondary">
                  No bridges match your favorites filter. Clear the filter or star bridges from each card.
                </p>
              </div>
            )
          ) : (
            <div className="bg-stellar-card border border-stellar-border rounded-lg p-8 text-center">
              <p className="text-stellar-text-secondary">
                No bridge data available. Bridge monitoring will populate this page once configured and running.
              </p>
            </div>
          )}
        </Suspense>
      </ErrorBoundary>

      <div className="bg-stellar-card border border-stellar-border rounded-lg p-4 sm:p-6">
        <h2 className="text-xl font-semibold text-white mb-4">Bridge Performance</h2>
        <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
          <table className="min-w-[640px] w-full text-sm">
            <caption className="sr-only">Bridge performance metrics table</caption>
            <thead>
              <tr className="text-left text-stellar-text-secondary border-b border-stellar-border">
                <th scope="col" className="pb-3 pr-4">Bridge</th>
                <th scope="col" className="pb-3 pr-4">24h Volume</th>
                <th scope="col" className="pb-3 pr-4">7d Volume</th>
                <th scope="col" className="pb-3 pr-4">Avg Transfer Time</th>
                <th scope="col" className="pb-3">30d Uptime</th>
              </tr>
            </thead>
            <tbody className="text-stellar-text-primary">
              <tr>
                <td colSpan={5} className="py-6 text-center text-stellar-text-secondary">
                  Performance data will appear once bridge monitoring is active
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      {/* EVM lock details + notes panels — shown when a bridge card is clicked */}
      {selectedBridge && (
        <>
          <BridgePauseReasonPanel bridgeName={selectedBridge} />
          <EvmLockDetailsPanel bridgeName={selectedBridge} />
          <BridgeNotesPanel bridgeName={selectedBridge} />
        </>
      )}
    </div>
  );
}
