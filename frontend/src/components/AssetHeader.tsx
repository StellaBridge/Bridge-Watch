import { Link } from "react-router-dom";
import type { AssetInfo, HealthScore, HealthStatus } from "../types";

interface AssetHeaderProps {
  symbol: string;
  assetInfo: AssetInfo | null | undefined;
  health: HealthScore | null | undefined;
  isLoading: boolean;
}

const ASSET_ICONS: Record<string, string> = {
  USDC: "$",
  PYUSD: "$",
  EURC: "\u20AC",
  XLM: "\u2726",
  FOBXX: "F",
};

const TYPE_LABELS: Record<string, string> = {
  stablecoin: "Stablecoin",
  wrapped: "Wrapped Asset",
  native: "Native Asset",
  tokenized: "Tokenized Fund",
};

function getHealthStatus(score: number): HealthStatus {
  if (score >= 80) return "healthy";
  if (score >= 50) return "warning";
  return "critical";
}

function getStatusColor(status: HealthStatus): string {
  switch (status) {
    case "healthy":
      return "#22c55e";
    case "warning":
      return "#eab308";
    case "critical":
      return "#ef4444";
  }
}

function getStatusLabel(status: HealthStatus): string {
  switch (status) {
    case "healthy":
      return "Healthy";
    case "warning":
      return "Warning";
    case "critical":
      return "Critical";
  }
}

function getTrendIcon(trend: string | null): string {
  if (trend === "improving") return "\u2191";
  if (trend === "deteriorating") return "\u2193";
  return "\u2192";
}

function getTrendColor(trend: string | null): string {
  if (trend === "improving") return "text-green-400";
  if (trend === "deteriorating") return "text-red-400";
  return "text-stellar-text-secondary";
}

export default function AssetHeader({
  symbol,
  assetInfo,
  health,
  isLoading,
}: AssetHeaderProps) {
  if (isLoading) {
    return (
      <div className="bg-stellar-card border border-stellar-border rounded-lg p-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-stellar-border animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-8 w-32 bg-stellar-border rounded animate-pulse" />
            <div className="h-4 w-48 bg-stellar-border rounded animate-pulse" />
          </div>
          <div className="h-16 w-24 bg-stellar-border rounded animate-pulse" />
        </div>
      </div>
    );
  }

  const score = health?.overallScore ?? null;
  const status = score !== null ? getHealthStatus(score) : null;
  const statusColor = status ? getStatusColor(status) : "#8A8FA8";

  return (
    <div className="bg-stellar-card border border-stellar-border rounded-lg p-6">
      <div className="flex items-center gap-2 mb-4">
        <Link
          to="/"
          className="text-sm text-stellar-text-secondary hover:text-white transition-colors"
        >
          Dashboard
        </Link>
        <span className="text-stellar-text-secondary">/</span>
        <span className="text-sm text-white">{symbol}</span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center text-2xl font-bold flex-shrink-0"
          style={{ backgroundColor: `${statusColor}20`, color: statusColor }}
        >
          {ASSET_ICONS[symbol] || symbol.charAt(0)}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-white">{symbol}</h1>
            {assetInfo && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-stellar-border text-stellar-text-secondary">
                {TYPE_LABELS[assetInfo.type] || assetInfo.type}
              </span>
            )}
            {status && (
              <span
                className="px-2.5 py-0.5 rounded-full text-xs font-medium"
                style={{ backgroundColor: `${statusColor}20`, color: statusColor }}
              >
                {getStatusLabel(status)}
              </span>
            )}
          </div>
          {assetInfo && (
            <p className="text-sm text-stellar-text-secondary mt-1">
              {assetInfo.name}
              {assetInfo.bridge && (
                <span>
                  {" "}
                  &middot; Bridged via {assetInfo.bridge}
                </span>
              )}
              {assetInfo.sourceChain && (
                <span>
                  {" "}
                  from {assetInfo.sourceChain}
                </span>
              )}
            </p>
          )}
          {!assetInfo && (
            <p className="text-sm text-stellar-text-secondary mt-1">
              Detailed monitoring for {symbol} on the Stellar network
            </p>
          )}
        </div>

        {score !== null && (
          <div className="flex flex-col items-center flex-shrink-0">
            <span className="text-4xl font-bold text-white">{score}</span>
            <span className="text-xs text-stellar-text-secondary">Health Score</span>
            {health?.trend && (
              <span
                className={`text-sm flex items-center gap-0.5 ${getTrendColor(health.trend)}`}
              >
                {getTrendIcon(health.trend)} {health.trend}
              </span>
            )}
          </div>
        )}
      </div>

      {assetInfo?.issuer && (
        <div className="mt-4 pt-4 border-t border-stellar-border">
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <div>
              <span className="text-stellar-text-secondary">Issuer: </span>
              <span className="text-white font-mono text-xs">
                {assetInfo.issuer.length > 20
                  ? `${assetInfo.issuer.slice(0, 10)}...${assetInfo.issuer.slice(-10)}`
                  : assetInfo.issuer}
              </span>
            </div>
            {health?.lastUpdated && (
              <div>
                <span className="text-stellar-text-secondary">Last updated: </span>
                <span className="text-white">
                  {new Date(health.lastUpdated).toLocaleString()}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
