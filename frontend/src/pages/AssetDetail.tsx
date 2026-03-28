import { Suspense } from "react";
import { useParams } from "react-router-dom";
import { useAssetHealth } from "../hooks/useAssets";
import { usePrices } from "../hooks/usePrices";
import { useRefreshControls } from "../hooks/useRefreshControls";
import HealthScoreCard from "../components/HealthScoreCard";
import PriceChart from "../components/PriceChart";
import LiquidityDepthChart from "../components/LiquidityDepthChart";
import RefreshControls from "../components/RefreshControls";
import { ErrorBoundary, LoadingSpinner } from "../components/Skeleton";

export default function AssetDetail() {
  const { symbol } = useParams<{ symbol: string }>();

  const refreshControls = useRefreshControls({
    viewId: `asset-detail-${symbol ?? "unknown"}`,
    targets: [
      { id: "health", label: "Health score", queryKey: ["asset-health", symbol ?? ""] },
      { id: "price", label: "Price", queryKey: ["prices", symbol ?? ""] },
    ],
    defaultIntervalMs: 30_000,
  });

  const { data: healthData, refetch: refetchHealth } = useAssetHealth(symbol ?? "", {
    refetchInterval: refreshControls.preferences.autoRefreshEnabled
      ? refreshControls.preferences.refreshIntervalMs
      : false,
    refetchOnWindowFocus: refreshControls.preferences.refreshOnFocus,
  });
  const {
    data: priceData,
    isLoading: priceLoading,
    refetch: refetchPrice,
  } = usePrices(symbol ?? "", {
    refetchInterval: refreshControls.preferences.autoRefreshEnabled
      ? refreshControls.preferences.refreshIntervalMs
      : false,
    refetchOnWindowFocus: refreshControls.preferences.refreshOnFocus,
  });

  if (!symbol) {
    return <div className="text-stellar-text-secondary">No asset symbol provided.</div>;
  }

  return (
    <ErrorBoundary onRetry={() => window.location.reload()}>
      <Suspense
        fallback={
          <LoadingSpinner
            message={`Loading ${symbol} details...`}
            progress={25}
            className="max-w-lg mx-auto"
          />
        }
      >
        <div className="space-y-8">
          <header>
            <h1 className="text-3xl font-bold text-white">{symbol}</h1>
            <p className="mt-2 text-stellar-text-secondary">
              Detailed monitoring for {symbol} on the Stellar network
            </p>
          </header>

          <RefreshControls
            autoRefreshEnabled={refreshControls.preferences.autoRefreshEnabled}
            onAutoRefreshEnabledChange={refreshControls.setAutoRefreshEnabled}
            refreshIntervalMs={refreshControls.preferences.refreshIntervalMs}
            onRefreshIntervalChange={refreshControls.setRefreshIntervalMs}
            refreshOnFocus={refreshControls.preferences.refreshOnFocus}
            onRefreshOnFocusChange={refreshControls.setRefreshOnFocus}
            targets={[
              { id: "health", label: "Health score", refetch: refetchHealth },
              { id: "price", label: "Price", refetch: refetchPrice },
            ]}
            selectedTargetIds={refreshControls.preferences.selectedTargetIds}
            onSelectedTargetIdsChange={refreshControls.setSelectedTargetIds}
            onRefresh={refreshControls.refreshNow}
            onCancelRefresh={refreshControls.cancelRefresh}
            isRefreshing={refreshControls.isRefreshing}
            lastUpdatedAt={refreshControls.lastUpdatedAt}
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <HealthScoreCard
              symbol={symbol}
              overallScore={healthData?.overallScore ?? null}
              factors={healthData?.factors ?? null}
              trend={healthData?.trend ?? null}
            />
            <div className="lg:col-span-2">
              <PriceChart symbol={symbol} data={priceData?.history ?? []} isLoading={priceLoading} />
            </div>
          </div>

          <LiquidityDepthChart symbol={symbol} data={[]} isLoading={false} />

          <div className="bg-stellar-card border border-stellar-border rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Price Sources</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Price sources for {symbol} including last update times</caption>
                <thead>
                  <tr className="text-left text-stellar-text-secondary border-b border-stellar-border">
                    <th scope="col" className="pb-3 pr-4">Source</th>
                    <th scope="col" className="pb-3 pr-4">Price</th>
                    <th scope="col" className="pb-3 pr-4">Last Updated</th>
                    <th scope="col" className="pb-3">Deviation</th>
                  </tr>
                </thead>
                <tbody className="text-white">
                  {priceData?.sources && priceData.sources.length > 0 ? (
                    priceData.sources.map((source) => (
                      <tr key={source.source} className="border-b border-stellar-border">
                        <th scope="row" className="py-3 pr-4 font-medium text-white">
                          {source.source}
                        </th>
                        <td className="py-3 pr-4">${source.price.toFixed(4)}</td>
                        <td className="py-3 pr-4 text-stellar-text-secondary">{source.timestamp}</td>
                        <td className="py-3">--</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-stellar-text-secondary">
                        No price source data available
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Suspense>
    </ErrorBoundary>
  );
}
