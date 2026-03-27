export interface Asset {
  symbol: string;
  name: string;
}

export interface HealthFactors {
  liquidityDepth: number;
  priceStability: number;
  bridgeUptime: number;
  reserveBacking: number;
  volumeTrend: number;
}

export interface HealthScore {
  symbol: string;
  overallScore: number;
  factors: HealthFactors;
  trend: "improving" | "stable" | "deteriorating";
  lastUpdated: string;
}

export type HealthStatus = "healthy" | "warning" | "critical";

export interface AssetWithHealth extends Asset {
  health: HealthScore | null;
}

export type SortField = "symbol" | "score";
export type SortOrder = "asc" | "desc";
export type FilterStatus = "all" | HealthStatus;

// Asset Detail types
export type PriceTimeframe = "1H" | "24H" | "7D" | "30D";

export interface AssetInfo {
  symbol: string;
  name: string;
  issuer: string;
  type: "stablecoin" | "wrapped" | "native" | "tokenized";
  description: string;
  bridge: string;
  sourceChain: string;
}

export interface PriceDataPoint {
  timestamp: string;
  price: number;
  source: string;
}

export interface PriceSource {
  source: string;
  price: number;
  timestamp: string;
  deviation: number;
  status: "active" | "stale" | "offline";
}

export interface LiquiditySource {
  dex: string;
  bidDepth: number;
  askDepth: number;
  totalLiquidity: number;
}

export interface VolumeData {
  period: string;
  volume: number;
  transactions: number;
  change: number;
}

export interface SupplyVerification {
  stellarSupply: number;
  sourceSupply: number;
  mismatch: number;
  mismatchPercentage: number;
  lastVerified: string;
  status: "verified" | "mismatch" | "pending";
}

export interface HealthHistoryPoint {
  timestamp: string;
  score: number;
}

export interface AlertConfig {
  id: string;
  type: "price_deviation" | "health_drop" | "supply_mismatch" | "liquidity_low";
  threshold: number;
  enabled: boolean;
}
