/**
 * External Price Feed Aggregator Service
 *
 * Aggregates price data from multiple external sources (CoinGecko,
 * CoinMarketCap, DEX aggregators) into a single consensus price.
 *
 * Algorithm:
 *   1. Fetch prices from all configured sources concurrently.
 *   2. Drop sources that returned errors (degrade their health score).
 *   3. Remove outliers: prices whose z-score > Z_SCORE_THRESHOLD are excluded.
 *   4. Compute weighted median using per-source reliability weights.
 *   5. Cache the consensus result in Redis.
 *
 * Source weights reflect expected data quality and update frequency:
 *   CoinMarketCap  → 0.40 (high reliability, broad coverage)
 *   CoinGecko      → 0.35 (high reliability, broad coverage)
 *   DEX            → 0.25 (on-chain, potentially less liquid)
 */

import { redis } from "../utils/redis.js";
import { logger } from "../utils/logger.js";
import { CoinGeckoSource, type CoinGeckoPriceResult } from "./sources/coingecko.source.js";
import { CoinMarketCapSource, type CmcPriceResult } from "./sources/coinmarketcap.source.js";
import { DexSource, type DexPriceResult } from "./sources/dex.source.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_PREFIX = "ext-agg:price:";
const CACHE_TTL_SEC = 45;
const Z_SCORE_THRESHOLD = 2.0;

const SOURCE_WEIGHTS: Record<string, number> = {
  CoinMarketCap: 0.40,
  CoinGecko: 0.35,
  DEX: 0.25,
};

// Health window: last N results per source
const HEALTH_WINDOW = 20;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PriceSample {
  source: string;
  subSource?: string; // e.g. "Jupiter", "Stellar DEX", "1inch"
  price: number;
  volume24h?: number;
  weight: number;
  isOutlier: boolean;
}

export interface ConsensusPriceResult {
  symbol: string;
  consensusPrice: number;
  weightedMedian: number;
  mean: number;
  stdDev: number;
  samples: PriceSample[];
  sourcesUsed: number;
  sourcesExcluded: number;
  timestamp: string;
  cached: boolean;
}

export interface SourceHealth {
  source: string;
  successRate: number;
  lastSuccess: string | null;
  lastFailure: string | null;
  totalRequests: number;
  successCount: number;
}

// ---------------------------------------------------------------------------
// Statistics helpers
// ---------------------------------------------------------------------------

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values: number[], avg?: number): number {
  if (values.length < 2) return 0;
  const mu = avg ?? mean(values);
  const variance =
    values.reduce((sum, v) => sum + (v - mu) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function zScore(value: number, mu: number, sigma: number): number {
  if (sigma === 0) return 0;
  return Math.abs((value - mu) / sigma);
}

/**
 * Weighted median.
 * @param items Array of {value, weight} tuples (weights need not sum to 1).
 */
function weightedMedian(items: { value: number; weight: number }[]): number {
  if (items.length === 0) return 0;
  if (items.length === 1) return items[0].value;

  const sorted = [...items].sort((a, b) => a.value - b.value);
  const totalWeight = sorted.reduce((s, i) => s + i.weight, 0);
  let cumulative = 0;
  for (const item of sorted) {
    cumulative += item.weight;
    if (cumulative >= totalWeight / 2) {
      return item.value;
    }
  }
  return sorted[sorted.length - 1].value;
}

// ---------------------------------------------------------------------------
// Source health tracking
// ---------------------------------------------------------------------------

class SourceHealthTracker {
  private readonly windows = new Map<string, boolean[]>();
  private readonly lastSuccess = new Map<string, string>();
  private readonly lastFailure = new Map<string, string>();

  record(source: string, success: boolean): void {
    let window = this.windows.get(source);
    if (!window) {
      window = [];
      this.windows.set(source, window);
    }
    window.push(success);
    if (window.length > HEALTH_WINDOW) window.shift();

    if (success) {
      this.lastSuccess.set(source, new Date().toISOString());
    } else {
      this.lastFailure.set(source, new Date().toISOString());
    }
  }

  getHealth(source: string): SourceHealth {
    const window = this.windows.get(source) ?? [];
    const successCount = window.filter(Boolean).length;
    return {
      source,
      successRate: window.length > 0 ? successCount / window.length : 1,
      lastSuccess: this.lastSuccess.get(source) ?? null,
      lastFailure: this.lastFailure.get(source) ?? null,
      totalRequests: window.length,
      successCount,
    };
  }

  getAllHealth(): SourceHealth[] {
    const sources = new Set([
      ...this.windows.keys(),
      ...this.lastSuccess.keys(),
      ...this.lastFailure.keys(),
    ]);
    return [...sources].map((s) => this.getHealth(s));
  }
}

// ---------------------------------------------------------------------------
// ExternalPriceAggregatorService
// ---------------------------------------------------------------------------

export class ExternalPriceAggregatorService {
  private readonly coinGecko = new CoinGeckoSource();
  private readonly coinMarketCap = new CoinMarketCapSource();
  private readonly dex = new DexSource();
  private readonly health = new SourceHealthTracker();

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Returns the consensus price for one symbol, with full source breakdown.
   */
  async getConsensusPrice(symbol: string): Promise<ConsensusPriceResult> {
    const upper = symbol.toUpperCase();
    const cacheKey = `${CACHE_PREFIX}${upper}`;

    // --- cache read ---
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as ConsensusPriceResult;
        return { ...parsed, cached: true };
      }
    } catch (err) {
      logger.warn({ err, symbol }, "External aggregator cache read error");
    }

    const result = await this.computeConsensus(upper);

    try {
      await redis.set(cacheKey, JSON.stringify(result), "EX", CACHE_TTL_SEC);
    } catch (err) {
      logger.warn({ err, symbol }, "External aggregator cache write error");
    }

    return result;
  }

  /**
   * Returns consensus prices for multiple symbols in parallel.
   */
  async getConsensusPrices(
    symbols: string[]
  ): Promise<ConsensusPriceResult[]> {
    return Promise.all(symbols.map((s) => this.getConsensusPrice(s)));
  }

  /**
   * Returns the health status of all price sources.
   */
  getSourceHealth(): SourceHealth[] {
    return this.health.getAllHealth();
  }

  /**
   * Compare prices across all sources for a symbol (useful for monitoring).
   */
  async compareSourcePrices(symbol: string): Promise<{
    symbol: string;
    samples: PriceSample[];
    deviation: number;
    timestamp: string;
  }> {
    const upper = symbol.toUpperCase();
    const raw = await this.fetchAllSources(upper);
    const allPrices = raw.map((s) => s.price);
    const mu = mean(allPrices);
    const sigma = stdDev(allPrices, mu);

    const samples = raw.map((s) => ({
      ...s,
      isOutlier: zScore(s.price, mu, sigma) > Z_SCORE_THRESHOLD,
    }));

    const deviation =
      mu > 0 ? (sigma / mu) * 100 : 0;

    return { symbol: upper, samples, deviation, timestamp: new Date().toISOString() };
  }

  // -------------------------------------------------------------------------
  // Core aggregation logic
  // -------------------------------------------------------------------------

  private async computeConsensus(symbol: string): Promise<ConsensusPriceResult> {
    const rawSamples = await this.fetchAllSources(symbol);

    if (rawSamples.length === 0) {
      logger.warn({ symbol }, "No price data available from any source");
      return this.emptyResult(symbol);
    }

    // Step 1: compute mean and std dev of ALL prices (for outlier detection)
    const allPrices = rawSamples.map((s) => s.price);
    const mu = mean(allPrices);
    const sigma = stdDev(allPrices, mu);

    // Step 2: tag outliers
    const samples: PriceSample[] = rawSamples.map((s) => ({
      ...s,
      isOutlier: rawSamples.length > 2 && zScore(s.price, mu, sigma) > Z_SCORE_THRESHOLD,
    }));

    const valid = samples.filter((s) => !s.isOutlier);
    const validPrices = valid.map((s) => s.price);

    // Step 3: compute weighted median of non-outlier prices
    const wm = weightedMedian(valid.map((s) => ({ value: s.price, weight: s.weight })));
    const mu2 = mean(validPrices);
    const sigma2 = stdDev(validPrices, mu2);

    logger.info(
      {
        symbol,
        sources: rawSamples.length,
        outliers: samples.filter((s) => s.isOutlier).length,
        consensusPrice: wm,
      },
      "External price consensus computed"
    );

    return {
      symbol,
      consensusPrice: wm,
      weightedMedian: wm,
      mean: mu2,
      stdDev: sigma2,
      samples,
      sourcesUsed: valid.length,
      sourcesExcluded: samples.length - valid.length,
      timestamp: new Date().toISOString(),
      cached: false,
    };
  }

  private async fetchAllSources(symbol: string): Promise<PriceSample[]> {
    const [cgResult, cmcResult, dexResult] = await Promise.allSettled([
      this.coinGecko.getPrice(symbol),
      this.coinMarketCap.getPrice(symbol),
      this.dex.getPrice(symbol),
    ]);

    const samples: PriceSample[] = [];

    // CoinGecko
    if (cgResult.status === "fulfilled" && cgResult.value?.price) {
      const r = cgResult.value as CoinGeckoPriceResult;
      this.health.record("CoinGecko", true);
      samples.push({
        source: "CoinGecko",
        price: r.price,
        volume24h: r.volume24h,
        weight: SOURCE_WEIGHTS.CoinGecko,
        isOutlier: false,
      });
    } else {
      this.health.record("CoinGecko", false);
      if (cgResult.status === "rejected") {
        logger.warn({ err: cgResult.reason, symbol }, "CoinGecko fetch failed in aggregator");
      }
    }

    // CoinMarketCap
    if (cmcResult.status === "fulfilled" && cmcResult.value?.price) {
      const r = cmcResult.value as CmcPriceResult;
      this.health.record("CoinMarketCap", true);
      samples.push({
        source: "CoinMarketCap",
        price: r.price,
        volume24h: r.volume24h,
        weight: SOURCE_WEIGHTS.CoinMarketCap,
        isOutlier: false,
      });
    } else {
      this.health.record("CoinMarketCap", false);
      if (cmcResult.status === "rejected") {
        logger.warn({ err: cmcResult.reason, symbol }, "CoinMarketCap fetch failed in aggregator");
      }
    }

    // DEX
    if (dexResult.status === "fulfilled" && dexResult.value?.price) {
      const r = dexResult.value as DexPriceResult;
      this.health.record("DEX", true);
      samples.push({
        source: "DEX",
        subSource: r.dex,
        price: r.price,
        weight: SOURCE_WEIGHTS.DEX,
        isOutlier: false,
      });
    } else {
      this.health.record("DEX", false);
      if (dexResult.status === "rejected") {
        logger.warn({ err: dexResult.reason, symbol }, "DEX fetch failed in aggregator");
      }
    }

    return samples;
  }

  private emptyResult(symbol: string): ConsensusPriceResult {
    return {
      symbol,
      consensusPrice: 0,
      weightedMedian: 0,
      mean: 0,
      stdDev: 0,
      samples: [],
      sourcesUsed: 0,
      sourcesExcluded: 0,
      timestamp: new Date().toISOString(),
      cached: false,
    };
  }
}
