import { Suspense } from "react";
import type { CellContext } from "@tanstack/react-table";
import { useParams } from "react-router-dom";
import { useAssetDetail } from "../hooks/useAssetDetail";
import AssetHeader from "../components/AssetHeader";
import HealthBreakdown from "../components/HealthBreakdown";
import { EnhancedPriceChart } from "../components/PriceChart";
import LiquidityDepthChart from "../components/LiquidityDepthChart";
import RefreshControls from "../components/RefreshControls";
import { ErrorBoundary, LoadingSpinner } from "../components/Skeleton";
import CopyButton from "../components/CopyButton";
import { useAssetHealth } from "../hooks/useAssets";
import { usePrices } from "../hooks/usePrices";

type PriceSourceRow = {
  source: string;
  price: number;
  timestamp: string;
};

export default function AssetDetail() {
  const { symbol } = useParams<{ symbol: string }>();
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  const {
    assetInfo,
    health,
    priceHistory,
    priceSources,
    liquidity,
    volume,
    supply,
    healthHistory,
    alerts,
    timeframe,
    setTimeframe,
  } = useAssetDetail(symbol ?? "");

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
            <h1 className="text-3xl font-bold text-stellar-text-primary">{symbol}</h1>
            <p className="mt-2 text-stellar-text-secondary">
              Detailed monitoring for {symbol} on the Stellar network
            </p>
          </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <HealthScoreCard
          symbol={symbol}
          overallScore={healthData?.overallScore ?? null}
          factors={healthData?.factors ?? null}
          trend={healthData?.trend ?? null}
        />
      )}

      {activeTab === "liquidity" && (
        <div className="space-y-6">
          <LiquidityDepthChart
            symbol={symbol}
            data={liquidity.data ?? []}
            isLoading={liquidity.isLoading}
          />
        </div>
      )}

      {activeTab === "volume" && (
        <VolumeAnalytics data={volume.data} isLoading={volume.isLoading} />
      )}

      {activeTab === "alerts" && (
        <AlertConfigSection
          alerts={alerts.data}
          isLoading={alerts.isLoading}
        />
      )}
    </div>
  </Suspense>
</ErrorBoundary>
  );
}
