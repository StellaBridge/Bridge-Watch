import { useState } from "react";
import { useParams } from "react-router-dom";
import { useAssetDetail } from "../hooks/useAssetDetail";
import AssetHeader from "../components/AssetHeader";
import HealthBreakdown from "../components/HealthBreakdown";
import { EnhancedPriceChart } from "../components/PriceChart";
import LiquidityDepthChart from "../components/LiquidityDepthChart";
import PriceSourceTable from "../components/PriceSourceTable";
import type { VolumeData, SupplyVerification, AlertConfig } from "../types";

type TabId = "overview" | "health" | "liquidity" | "volume" | "alerts";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "health", label: "Health" },
  { id: "liquidity", label: "Liquidity" },
  { id: "volume", label: "Volume" },
  { id: "alerts", label: "Alerts" },
];

function SupplyVerificationCard({
  data,
  isLoading,
}: {
  data: SupplyVerification | null | undefined;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="bg-stellar-card border border-stellar-border rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">
          Supply Verification
        </h3>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-6 bg-stellar-border rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-stellar-card border border-stellar-border rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">
          Supply Verification
        </h3>
        <div className="h-32 flex items-center justify-center">
          <span className="text-stellar-text-secondary">
            No supply verification data available
          </span>
        </div>
      </div>
    );
  }

  const statusStyles: Record<string, string> = {
    verified: "bg-green-500/20 text-green-400",
    mismatch: "bg-red-500/20 text-red-400",
    pending: "bg-yellow-500/20 text-yellow-400",
  };

  return (
    <div className="bg-stellar-card border border-stellar-border rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">
          Supply Verification
        </h3>
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyles[data.status] || statusStyles.pending}`}
        >
          {data.status.charAt(0).toUpperCase() + data.status.slice(1)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <span className="text-xs text-stellar-text-secondary">
            Stellar Supply
          </span>
          <p className="text-lg font-bold text-white">
            {data.stellarSupply.toLocaleString()}
          </p>
        </div>
        <div>
          <span className="text-xs text-stellar-text-secondary">
            Source Supply
          </span>
          <p className="text-lg font-bold text-white">
            {data.sourceSupply.toLocaleString()}
          </p>
        </div>
        <div>
          <span className="text-xs text-stellar-text-secondary">Mismatch</span>
          <p
            className={`text-lg font-bold ${
              data.mismatchPercentage > 1
                ? "text-red-400"
                : data.mismatchPercentage > 0.5
                  ? "text-yellow-400"
                  : "text-green-400"
            }`}
          >
            {data.mismatchPercentage.toFixed(3)}%
          </p>
        </div>
        <div>
          <span className="text-xs text-stellar-text-secondary">
            Last Verified
          </span>
          <p className="text-sm text-white">
            {new Date(data.lastVerified).toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
}

function VolumeAnalytics({
  data,
  isLoading,
}: {
  data: VolumeData[] | undefined;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="bg-stellar-card border border-stellar-border rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">
          Volume Analytics
        </h3>
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 bg-stellar-border rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const volumes = data ?? [];

  return (
    <div className="bg-stellar-card border border-stellar-border rounded-lg p-6">
      <h3 className="text-lg font-semibold text-white mb-4">
        Volume Analytics
      </h3>

      {volumes.length > 0 ? (
        <div className="space-y-4">
          {volumes.map((v) => (
            <div
              key={v.period}
              className="flex items-center justify-between py-3 border-b border-stellar-border last:border-b-0"
            >
              <div>
                <span className="text-white font-medium">{v.period}</span>
                <p className="text-xs text-stellar-text-secondary">
                  {v.transactions.toLocaleString()} transactions
                </p>
              </div>
              <div className="text-right">
                <span className="text-white font-bold">
                  ${v.volume.toLocaleString()}
                </span>
                <p
                  className={`text-xs font-medium ${
                    v.change > 0
                      ? "text-green-400"
                      : v.change < 0
                        ? "text-red-400"
                        : "text-stellar-text-secondary"
                  }`}
                >
                  {v.change > 0 ? "+" : ""}
                  {v.change.toFixed(1)}%
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="h-32 flex items-center justify-center">
          <span className="text-stellar-text-secondary">
            No volume data available
          </span>
        </div>
      )}
    </div>
  );
}

function AlertConfigSection({
  alerts,
  isLoading,
}: {
  alerts: AlertConfig[] | undefined;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="bg-stellar-card border border-stellar-border rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">
          Alert Configuration
        </h3>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-stellar-border rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const alertList = alerts ?? [];

  const typeLabels: Record<string, string> = {
    price_deviation: "Price Deviation",
    health_drop: "Health Score Drop",
    supply_mismatch: "Supply Mismatch",
    liquidity_low: "Low Liquidity",
  };

  const typeIcons: Record<string, string> = {
    price_deviation: "\u26A0",
    health_drop: "\u2764",
    supply_mismatch: "\u21C4",
    liquidity_low: "\u2193",
  };

  return (
    <div className="bg-stellar-card border border-stellar-border rounded-lg p-6">
      <h3 className="text-lg font-semibold text-white mb-4">
        Alert Configuration
      </h3>

      {alertList.length > 0 ? (
        <div className="space-y-3">
          {alertList.map((alert) => (
            <div
              key={alert.id}
              className="flex items-center justify-between py-3 px-4 bg-stellar-dark rounded-lg"
            >
              <div className="flex items-center gap-3">
                <span className="text-lg" aria-hidden="true">
                  {typeIcons[alert.type] || "\u26A0"}
                </span>
                <div>
                  <span className="text-sm text-white font-medium">
                    {typeLabels[alert.type] || alert.type}
                  </span>
                  <p className="text-xs text-stellar-text-secondary">
                    Threshold: {alert.threshold}%
                  </p>
                </div>
              </div>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  alert.enabled
                    ? "bg-green-500/20 text-green-400"
                    : "bg-stellar-border text-stellar-text-secondary"
                }`}
              >
                {alert.enabled ? "Active" : "Disabled"}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="h-32 flex items-center justify-center">
          <p className="text-stellar-text-secondary">
            No alerts configured for this asset. Alert configuration will be
            available in a future update.
          </p>
        </div>
      )}
    </div>
  );
}

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
    return (
      <div className="text-stellar-text-secondary">
        No asset symbol provided.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Asset Header */}
      <AssetHeader
        symbol={symbol}
        assetInfo={assetInfo.data}
        health={health.data}
        isLoading={assetInfo.isLoading && health.isLoading}
      />

      {/* Tab Navigation */}
      <nav className="flex gap-1 overflow-x-auto bg-stellar-card border border-stellar-border rounded-lg p-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium rounded-md whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? "bg-stellar-blue text-white"
                : "text-stellar-text-secondary hover:text-white hover:bg-stellar-border"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Tab Content */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Price chart + Supply verification */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <EnhancedPriceChart
                symbol={symbol}
                data={priceHistory.data ?? []}
                isLoading={priceHistory.isLoading}
                timeframe={timeframe}
                onTimeframeChange={setTimeframe}
              />
            </div>
            <SupplyVerificationCard
              data={supply.data}
              isLoading={supply.isLoading}
            />
          </div>

          {/* Price Sources */}
          <PriceSourceTable
            sources={priceSources.data ?? []}
            isLoading={priceSources.isLoading}
            vwap={null}
          />
        </div>
      )}

      {activeTab === "health" && (
        <HealthBreakdown
          factors={health.data?.factors ?? null}
          history={healthHistory.data ?? []}
          isHistoryLoading={healthHistory.isLoading}
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
  );
}
