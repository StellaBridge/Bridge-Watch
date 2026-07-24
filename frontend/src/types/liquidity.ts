/**
 * Liquidity types for the aggregation and depth visualization suite.
 * Covers Phase 1 pairs: USDC/XLM, EURC/XLM, PYUSD/XLM, FOBXX/USDC.
 */

/** Supported DEX venues */
export type LiquidityVenue = "SDEX" | "StellarX" | "Phoenix";

/** Phase 1 trading pairs */
export type TradingPair = "USDC/XLM" | "EURC/XLM" | "PYUSD/XLM" | "FOBXX/USDC";

/** A single order book level (price + cumulative volume) */
export interface OrderBookLevel {
  /** Price in quote asset, 7 decimal precision (Stellar standard) */
  price: number;
  /** Cumulative volume at this price level */
  volume: number;
  /** Source venue */
  venue: LiquidityVenue;
}

/** Aggregated depth data for a pair — bids and asks from all venues */
export interface DepthData {
  pair: TradingPair;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  midPrice: number;
  timestamp: string;
}

/** Per-venue liquidity breakdown */
export interface VenueLiquidity {
  venue: LiquidityVenue;
  totalLiquidity: number;
  bidDepth: number;
  askDepth: number;
  /** Percentage share of total aggregated liquidity */
  share: number;
}

/** Historical liquidity snapshot for trend charts */
export interface LiquiditySnapshot {
  timestamp: string;
  totalLiquidity: number;
  pair: TradingPair;
}

/** Price impact calculation result */
export interface PriceImpactResult {
  tradeSize: number;
  expectedPrice: number;
  slippagePct: number;
  fillableLiquidity: number;
}

/** Shape of data emitted by the liquidity WebSocket channel */
export interface LiquidityWsMessage {
  channel: string;
  pair: TradingPair;
  depth: DepthData;
  venues: VenueLiquidity[];
}

/** A single price bracket in the concentration histogram */
export interface ConcentrationBucket {
  /** Price range label, e.g. "mid-2%" */
  label: string;
  /** Lower bound of the price range */
  lowerBound: number;
  /** Upper bound of the price range */
  upperBound: number;
  /** Total bid volume in this bracket */
  bidVolume: number;
  /** Total ask volume in this bracket */
  askVolume: number;
  /** Number of venue levels contributing to this bracket */
  levelsCount: number;
}

/** A detected low-liquidity zone */
export interface LiquidityGap {
  /** Start price of the gap */
  startPrice: number;
  /** End price of the gap */
  endPrice: number;
  /** Total depth (bid + ask) in the gap — should be near zero */
  depth: number;
  /** Severity rating 0-1 (1 = completely empty) */
  severity: number;
}

/** Full concentration analysis response */
export interface LiquidityConcentrationData {
  pair: TradingPair;
  midPrice: number;
  buckets: ConcentrationBucket[];
  gaps: LiquidityGap[];
  spreadPct: number;
  bidTotal: number;
  askTotal: number;
  timestamp: string;
}

/** State managed by the useLiquidityConcentration hook */
export interface LiquidityConcentrationState {
  data: LiquidityConcentrationData | null;
  isLoading: boolean;
  error: string | null;
  lastUpdated: string | null;
  refetch: () => Promise<unknown>;
}

/** State managed by the useLiquidity hook */
export interface LiquidityState {
  depth: DepthData | null;
  venues: VenueLiquidity[];
  history: LiquiditySnapshot[];
  isLoading: boolean;
  error: string | null;
  lastUpdated: string | null;
  data?: {
    sources: unknown[];
  } | null;
  refetch: () => Promise<unknown>;
}
