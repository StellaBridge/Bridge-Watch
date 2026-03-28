import { Suspense } from "react";
import { useMemo } from "react";
import { useAssetsWithHealth } from "../hooks/useAssets";
import { usePricesForSymbols } from "../hooks/usePrices";
import { useLocalStorageState } from "../hooks/useLocalStorageState";
import { SkeletonCard, ErrorBoundary } from "../components/Skeleton";

const MAX_COMPARE_ASSETS = 3;

export default function Analytics() {
  const { data: assetsData, isLoading, error } = useAssetsWithHealth();
  const [selectedSymbols, setSelectedSymbols] = useLocalStorageState<string[]>(
    "bridge-watch:analytics-compare:v1",
    []
  );

  const priceQueries = usePricesForSymbols(selectedSymbols);
  const selectedAssets = useMemo(
    () => (assetsData ?? []).filter((asset) => selectedSymbols.includes(asset.symbol)),
    [assetsData, selectedSymbols]
  );
  const totalTrackedAssets = assetsData?.length ?? 0;
  const avgHealthScore = useMemo(() => {
    if (!assetsData || assetsData.length === 0) return "--";
    const withScores = assetsData
      .map((asset) => asset.health?.overallScore)
      .filter((score): score is number => typeof score === "number");
    if (withScores.length === 0) return "--";
    const avg = withScores.reduce((sum, score) => sum + score, 0) / withScores.length;
    return `${avg.toFixed(1)} / 100`;
  }, [assetsData]);

  const handleToggleAsset = (symbol: string) => {
    setSelectedSymbols((prev) => {
      if (prev.includes(symbol)) return prev.filter((s) => s !== symbol);
      if (prev.length >= MAX_COMPARE_ASSETS) return prev;
      return [...prev, symbol];
    });
  };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-white">Analytics</h1>
        <p className="mt-2 text-stellar-text-secondary">
          Historical trends, cross-asset comparisons, and ecosystem health
          metrics
        </p>
      </header>

      <ErrorBoundary onRetry={() => window.location.reload()}>
        <Suspense
          fallback={
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonCard key={i} rows={2} ariaLabel="Loading analytics summary" />
              ))}
            </div>
          }
        >
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonCard key={i} rows={2} ariaLabel="Loading analytics summary" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { label: "Total Bridges Monitored", value: "--" },
                { label: "Total Assets Tracked", value: totalTrackedAssets || "--" },
                { label: "Average Health Score", value: avgHealthScore },
                { label: "Total Value Locked", value: "--" },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="bg-stellar-card border border-stellar-border rounded-lg p-6"
                >
                  <p className="text-sm text-stellar-text-secondary">{stat.label}</p>
                  <p className="mt-2 text-2xl font-bold text-white">{stat.value}</p>
                </div>
              ))}
            </div>
          )}
        </Suspense>
      </ErrorBoundary>

      <div className="bg-stellar-card border border-stellar-border rounded-lg p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-semibold text-white">
            Asset Comparison
          </h2>
          <p className="text-sm text-stellar-text-secondary">
            Select up to {MAX_COMPARE_ASSETS} assets for side-by-side comparison.
          </p>
        </div>

        <div className="mt-4">
          <ErrorBoundary onRetry={() => window.location.reload()}>
            <Suspense
              fallback={
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <SkeletonCard key={i} rows={1} ariaLabel="Loading asset filter button" />
                  ))}
                </div>
              }
            >
              {error ? (
                <p className="text-red-400" role="alert">
                  Failed to load assets for comparison.
                </p>
              ) : isLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <SkeletonCard key={i} rows={1} ariaLabel="Loading asset filter button" />
                  ))}
                </div>
              ) : assetsData && assetsData.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {assetsData.map((asset) => {
                    const selected = selectedSymbols.includes(asset.symbol);
                    const disabled = !selected && selectedSymbols.length >= MAX_COMPARE_ASSETS;
                    return (
                      <button
                        key={asset.symbol}
                        type="button"
                        onClick={() => handleToggleAsset(asset.symbol)}
                        disabled={disabled}
                        aria-pressed={selected}
                        className={`rounded-md border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-stellar-blue ${
                          selected
                            ? "border-stellar-blue bg-stellar-blue/20 text-white"
                            : "border-stellar-border bg-stellar-dark text-stellar-text-secondary hover:text-white"
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        {asset.symbol}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-stellar-text-secondary">
                  No assets are available for comparison yet.
                </p>
              )}
            </Suspense>
          </ErrorBoundary>
        </div>

        <div className="mt-6">
          {selectedAssets.length === 0 ? (
            <p className="text-stellar-text-secondary">
              Select at least one asset to view comparison metrics.
            </p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {selectedAssets.map((asset, index) => {
                const query = priceQueries[index];
                const vwap = query?.data?.vwap;
                const lastUpdated = query?.data?.lastUpdated;

                return (
                  <article
                    key={asset.symbol}
                    className="bg-stellar-dark border border-stellar-border rounded-lg p-4"
                    aria-label={`${asset.symbol} comparison metrics`}
                  >
                    <h3 className="text-lg font-semibold text-white">{asset.symbol}</h3>
                    <p className="text-sm text-stellar-text-secondary">{asset.name}</p>

                    <dl className="mt-4 space-y-2 text-sm">
                      <div className="flex justify-between gap-3">
                        <dt className="text-stellar-text-secondary">Health Score</dt>
                        <dd className="text-white font-medium">
                          {asset.health?.overallScore ?? "--"}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-stellar-text-secondary">Trend</dt>
                        <dd className="text-white font-medium">
                          {asset.health?.trend ?? "--"}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-stellar-text-secondary">VWAP</dt>
                        <dd className="text-white font-medium">
                          {typeof vwap === "number" ? `$${vwap.toFixed(4)}` : "--"}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-stellar-text-secondary">Price Sources</dt>
                        <dd className="text-white font-medium">
                          {query?.data?.sources?.length ?? 0}
                        </dd>
                      </div>
                    </dl>

                    <p className="mt-3 text-xs text-stellar-text-secondary">
                      {query?.isLoading
                        ? "Loading latest prices…"
                        : lastUpdated
                          ? `Updated: ${lastUpdated}`
                          : "No price update timestamp"}
                    </p>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Volume Analytics */}
      <div className="bg-stellar-card border border-stellar-border rounded-lg p-6">
        <h2 className="text-xl font-semibold text-white mb-4">
          Bridge Volume Analytics
        </h2>
        <div className="h-64 flex items-center justify-center">
          <p className="text-stellar-text-secondary">
            Volume analytics will render here once bridge monitoring data is
            collected
          </p>
        </div>
      </div>

      {/* Liquidity Distribution */}
      <div className="bg-stellar-card border border-stellar-border rounded-lg p-6">
        <h2 className="text-xl font-semibold text-white mb-4">
          Liquidity Distribution Across DEXs
        </h2>
        <div className="h-64 flex items-center justify-center">
          <p className="text-stellar-text-secondary">
            DEX liquidity distribution charts will render here once data is
            aggregated
          </p>
        </div>
      </div>
    </div>
  );
}
