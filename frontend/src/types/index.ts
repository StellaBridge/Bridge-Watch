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

export interface Bridge {
  name: string;
  status: "healthy" | "degraded" | "down" | "unknown";
  totalValueLocked: number;
  supplyOnStellar: number;
  supplyOnSource: number;
  mismatchPercentage: number;
}

export interface BridgeStats {
  name: string;
  volume24h: number;
  volume7d: number;
  volume30d: number;
  totalTransactions: number;
  averageTransferTime: number;
  uptime30d: number;
}

// Transaction History types
export type TransactionStatus = "pending" | "completed" | "failed";

export interface BridgeTransaction {
  id: string;
  txHash: string;
  bridge: string;
  asset: string;
  amount: number;
  sourceChain: string;
  destinationChain: string;
  senderAddress: string;
  recipientAddress: string;
  status: TransactionStatus;
  fee: number;
  timestamp: string;
  confirmedAt: string | null;
  stellarTxHash: string | null;
  ethereumTxHash: string | null;
  blockNumber: number | null;
}

export interface TransactionFilters {
  bridge: string;
  asset: string;
  status: TransactionStatus | "all";
  search: string;
  dateFrom: string;
  dateTo: string;
}

export interface TransactionPage {
  transactions: BridgeTransaction[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// WebSocket connection
export type ConnectionState = "connecting" | "connected" | "disconnected" | "error";

export type SubscriptionChannel = "prices" | "health" | "health-updates" | "alerts" | "bridges";

interface WsBaseMessage {
  channel: SubscriptionChannel | string;
  type?: string;
  timestamp?: string;
}

export interface WsPriceMessage extends WsBaseMessage {
  channel: "prices";
  symbol: string;
  price: number;
  source: string;
  vwap?: number;
}

export interface WsHealthMessage extends WsBaseMessage {
  channel: "health" | "health-updates";
  symbol: string;
  overallScore: number;
  factors: HealthFactors;
  trend: "improving" | "stable" | "deteriorating";
  lastUpdated: string;
}

export interface WsAlertMessage extends WsBaseMessage {
  channel: "alerts";
  severity: "info" | "warning" | "critical";
  message: string;
  symbol?: string;
  bridgeName?: string;
}

export interface WsBridgeMessage extends WsBaseMessage {
  channel: "bridges";
  name: string;
  status: "healthy" | "degraded" | "down" | "unknown";
  totalValueLocked: number;
  supplyOnStellar: number;
  supplyOnSource: number;
  mismatchPercentage: number;
}

export type WsMessage = WsPriceMessage | WsHealthMessage | WsAlertMessage | WsBridgeMessage;
