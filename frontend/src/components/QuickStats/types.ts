export interface StatItem {
  id: string;
  label: string;
  value: string;
  icon: string;
  change?: {
    value: string;
    direction: "up" | "down" | "neutral";
  };
  status?: "healthy" | "warning" | "critical" | "neutral";
  href?: string;
}

export interface QuickStatsProps {
  assets: AssetData[];
  bridges: BridgeData[];
  isLoading?: boolean;
}

export interface AssetData {
  symbol: string;
  name: string;
  health: {
    overallScore: number;
    factors: {
      liquidityDepth: number;
      priceStability: number;
      bridgeUptime: number;
      reserveBacking: number;
      volumeTrend: number;
    };
    trend: "improving" | "stable" | "deteriorating";
    lastUpdated: string;
  } | null;
}

export interface BridgeData {
  name: string;
  status: "healthy" | "degraded" | "down" | "unknown";
  totalValueLocked: number;
  supplyOnStellar: number;
  supplyOnSource: number;
  mismatchPercentage: number;
}
