import { useParams } from "react-router-dom";
import { useAssetHealth } from "../hooks/useAssets";
import { usePrices } from "../hooks/usePrices";
import HealthScoreCard from "../components/HealthScoreCard";
import PriceChart from "../components/PriceChart";
import LiquidityDepthChart from "../components/LiquidityDepthChart";
import SkeletonCard from "../components/Skeleton/SkeletonCard";
import SkeletonChart from "../components/Skeleton/SkeletonChart";
import SkeletonTable from "../components/Skeleton/SkeletonTable";
import LoadingSpinner from "../components/Skeleton/LoadingSpinner";

export default function AssetDetail() {
  const { symbol } = useParams<{ symbol: string }>();
  const { data: healthData } = useAssetHealth(symbol ?? "");
  const { data: priceData, isLoading: priceLoading } = usePrices(symbol ?? "");

  if (!symbol) {
    return (
      <div className="text-stellar-text-secondary">
        No asset symbol provided.
      </div>
    );
  }

  const isPageLoading = !healthData || priceLoading;

  if (isPageLoading) {
    return (
      <div className="space-y-8">
        <header>
          <h1 className="text-3xl font-bold text-white">{symbol}</h1>
          <p className="mt-2 text-stellar-text-secondary">
            Detailed monitoring for {symbol} on the Stellar network
          </p>
        </header>
        <LoadingSpinner
          message="Loading asset detail..."
          showProgress
          progress={healthData ? 65 : 25}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <SkeletonCard variant="dashboard" />
          <SkeletonChart title="Price" />
        </div>

        <SkeletonChart title="Liquidity depth" />

        <SkeletonTable rowCount={4} colCount={4} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-white">{symbol}</h1>
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
        <div className="lg:col-span-2">
          <PriceChart
            symbol={symbol}
            data={priceData?.history ?? []}
            isLoading={priceLoading}
          />
        </div>
      </div>

      <LiquidityDepthChart symbol={symbol} data={[]} isLoading={false} />

      <div className="bg-stellar-card border border-stellar-border rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">
          Price Sources
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-stellar-text-secondary border-b border-stellar-border">
                <th className="pb-3 pr-4">Source</th>
                <th className="pb-3 pr-4">Price</th>
                <th className="pb-3 pr-4">Last Updated</th>
                <th className="pb-3">Deviation</th>
              </tr>
            </thead>
            <tbody className="text-white">
              {priceData?.sources && priceData.sources.length > 0 ? (
                priceData.sources.map(
                  (source: {
                    source: string;
                    price: number;
                    timestamp: string;
                  }) => (
                    <tr
                      key={source.source}
                      className="border-b border-stellar-border"
                    >
                      <td className="py-3 pr-4">{source.source}</td>
                      <td className="py-3 pr-4">
                        ${source.price.toFixed(4)}
                      </td>
                      <td className="py-3 pr-4 text-stellar-text-secondary">
                        {source.timestamp}
                      </td>
                      <td className="py-3">--</td>
                    </tr>
                  )
                )
              ) : (
                <tr>
                  <td
                    colSpan={4}
                    className="py-6 text-center text-stellar-text-secondary"
                  >
                    No price source data available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
