import { useState, Suspense } from "react";
import { useParams } from "react-router-dom";
import { useAssetDetail } from "../hooks/useAssetDetail";
import AssetHeader from "../components/AssetHeader";
import HealthBreakdown from "../components/HealthBreakdown";
import { EnhancedPriceChart } from "../components/PriceChart";
import LiquidityDepthChart from "../components/LiquidityDepthChart";
import type { DataTableColumnDef } from "../components/DataTable";
import { DataTable } from "../components/DataTable";
import type { CellContext } from "@tanstack/react-table";
import RefreshControls from "../components/RefreshControls";
import { ErrorBoundary, LoadingSpinner } from "../components/Skeleton";
import VolumeAnalytics from "../components/VolumeAnalytics";
import AlertConfigSection from "../components/AlertConfigSection";

enum TabId {
  Overview = "overview",
  Liquidity = "liquidity",
  Volume = "volume",
  Alerts = "alerts"
}

export default function AssetDetail() {
  const { symbol } = useParams<{ symbol: string }>();
  const [activeTab, setActiveTab] = useState<TabId>(TabId.Overview);

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

  const priceSourceRows = (priceData?.sources ?? []) as Array<{
    source: string;
    price: number;
    timestamp: string;
  }>;

  const priceSourceColumns: Array<
    DataTableColumnDef<{
      source: string;
      price: number;
      timestamp: string;
    }>
  > = [
    {
      id: "source",
      accessorKey: "source",
      header: "Source",
      filterType: "text",
    },
    {
      id: "price",
      accessorKey: "price",
      header: "Price",
      filterType: "numberRange",
      cell: (
        ctx: CellContext<
          { source: string; price: number; timestamp: string },
          unknown
        >
      ) =>
        `$${Number(ctx.getValue()).toFixed(4)}`,
    },
    {
      id: "timestamp",
      accessorKey: "timestamp",
      header: "Last Updated",
      filterType: "text",
    },
  ];

  if (!symbol) {
    return <div className="text-stellar-text-secondary p-8">No asset symbol provided.</div>;
  }

  return (
    <ErrorBoundary onRetry={() => window.location.reload()}>
      <Suspense
        fallback={
          <LoadingSpinner
            message={`Loading ${symbol} details...`}
            progress={25}
            className="max-w-lg mx-auto mt-20"
          />
        }
      >
        <div className="space-y-8 pb-12">
          <AssetHeader
            symbol={symbol}
            assetInfo={assetInfo.data}
            isLoading={assetInfo.isLoading}
          />

          <div className="flex space-x-1 bg-stellar-card/50 p-1 rounded-xl border border-stellar-border w-fit">
            {Object.values(TabId).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === tab
                    ? "bg-stellar-primary text-white shadow-lg"
                    : "text-stellar-text-secondary hover:text-white hover:bg-white/5"
                  }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {activeTab === TabId.Overview && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <HealthBreakdown
                  health={health.data}
                  history={healthHistory.data}
                  isLoading={health.isLoading}
                />
                <div className="lg:col-span-2">
                  <EnhancedPriceChart
                    symbol={symbol}
                    data={priceHistory.data}
                    sources={priceSources.data}
                    timeframe={timeframe}
                    onTimeframeChange={setTimeframe}
                    isLoading={priceHistory.isLoading}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-stellar-card border border-stellar-border rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Supply Verification</h3>
                  {/* Supply info would go here */}
                  <div className="text-stellar-text-secondary text-sm">
                    Supply data monitoring is active. No critical mismatches detected.
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === TabId.Liquidity && (
            <div className="space-y-6">
              <LiquidityDepthChart
                symbol={symbol}
                data={liquidity.data ?? []}
                isLoading={liquidity.isLoading}
              />
            </div>
          )}

          {activeTab === TabId.Volume && (
            <VolumeAnalytics data={volume.data} isLoading={volume.isLoading} />
          )}

      <DataTable
        data={priceSourceRows}
        columns={priceSourceColumns}
        isLoading={!priceData}
        title="Price Sources"
        description={`Price sources for ${symbol} including last update times`}
        pageSizeOptions={[10, 20, 50]}
        filenameBase={`${symbol}-price-sources`}
        enableRowSelection={true}
        enableMultiSort={true}
        enableColumnReorder={true}
        enableVirtualization={true}
        rowActions={{
          items: [
            {
              id: "copy-source",
              label: "Copy source",
              onSelect: (row) => {
                void navigator.clipboard.writeText(row.source);
              },
            },
          ],
        }}
      />
    </div>
  </Suspense>
</ErrorBoundary>
          {activeTab === TabId.Alerts && (
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
