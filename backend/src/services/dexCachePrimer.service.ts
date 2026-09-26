/**
 * DEX Cache Priming Service
 * 
 * Pre-fetches and primes cache for top DEX liquidity pools on application boot.
 * Identifies top 20 pools by TVL, fetches depth charts and volume metrics,
 * and stores them in Redis with 5-minute TTL.
 * 
 * Issue #1263
 */

import { redis } from "../utils/redis.js";
import { logger } from "../utils/logger.js";
import { getDatabase } from "../database/connection.js";

export interface PoolDepthData {
  poolId: string;
  assetCode: string;
  assetIssuer: string;
  tvl: number;
  volume24h: number;
  depth: {
    bids: Array<{ price: number; amount: number }>;
    asks: Array<{ price: number; amount: number }>;
  };
  lastUpdated: Date;
}

const CACHE_TTL_SECONDS = 300; // 5 minutes
const TOP_POOLS_COUNT = 20;
const CACHE_KEY_PREFIX = "bw:dex:prime:";

export class DexCachePrimerService {
  private isRunning = false;
  private lastPrimingTime: Date | null = null;
  private primingCount = 0;

  /**
   * Prime the cache for top DEX pools on startup
   */
  async primeOnStartup(): Promise<void> {
    if (this.isRunning) {
      logger.warn("Cache priming already in progress");
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      logger.info("Starting DEX cache priming for top pools");

      // Get top pools by TVL
      const topPools = await this.getTopPoolsByTVL(TOP_POOLS_COUNT);
      logger.info({ count: topPools.length }, "Found top pools to prime");

      // Prime each pool's data
      let primed = 0;
      for (const pool of topPools) {
        try {
          await this.primePoolData(pool);
          primed++;
        } catch (error) {
          logger.error({ poolId: pool.poolId, error }, "Failed to prime pool data");
        }
      }

      const durationMs = Date.now() - startTime;
      this.lastPrimingTime = new Date();
      this.primingCount = primed;

      logger.info({ primed, total: topPools.length, durationMs }, "DEX cache priming completed");
    } catch (error) {
      logger.error({ error }, "DEX cache priming failed");
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Get top N pools by TVL from the database
   */
  private async getTopPoolsByTVL(limit: number): Promise<Array<{
    poolId: string;
    assetCode: string;
    assetIssuer: string;
    tvl: number;
  }>> {
    const db = getDatabase();

    try {
      const pools = await db("dex_pools")
        .select("pool_id", "asset_code", "asset_issuer", "tvl")
        .orderBy("tvl", "desc")
        .limit(limit);

      return pools.map((p) => ({
        poolId: p.pool_id,
        assetCode: p.asset_code,
        assetIssuer: p.asset_issuer,
        tvl: Number(p.tvl),
      }));
    } catch (error) {
      logger.error({ error }, "Failed to fetch top pools by TVL");
      return [];
    }
  }

  /**
   * Prime cache data for a single pool
   */
  private async primePoolData(pool: {
    poolId: string;
    assetCode: string;
    assetIssuer: string;
    tvl: number;
  }): Promise<void> {
    const cacheKey = `${CACHE_KEY_PREFIX}${pool.poolId}`;

    // Fetch depth chart data
    const depthData = await this.fetchPoolDepth(pool.poolId);

    // Fetch volume metrics
    const volumeData = await this.fetchPoolVolume(pool.poolId);

    // Store in Redis with TTL
    const poolData: PoolDepthData = {
      poolId: pool.poolId,
      assetCode: pool.assetCode,
      assetIssuer: pool.assetIssuer,
      tvl: pool.tvl,
      volume24h: volumeData.volume24h,
      depth: depthData,
      lastUpdated: new Date(),
    };

    await redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(poolData));

    // Also store in a sorted set for easy ranking queries
    await redis.zadd("bw:dex:prime:ranking", pool.tvl, pool.poolId);

    logger.debug({ poolId: pool.poolId, tvl: pool.tvl }, "Pool data primed");
  }

  /**
   * Fetch depth chart data for a pool
   */
  private async fetchPoolDepth(poolId: string): Promise<{
    bids: Array<{ price: number; amount: number }>;
    asks: Array<{ price: number; amount: number }>;
  }> {
    const db = getDatabase();

    try {
      // Get recent order book entries
      const entries = await db("dex_order_book")
        .where("pool_id", poolId)
        .where("created_at", ">", new Date(Date.now() - 3600000)) // Last hour
        .orderBy("price", "asc");

      const bids = entries
        .filter((e) => e.side === "buy")
        .map((e) => ({ price: Number(e.price), amount: Number(e.amount) }));

      const asks = entries
        .filter((e) => e.side === "sell")
        .map((e) => ({ price: Number(e.price), amount: Number(e.amount) }));

      return { bids, asks };
    } catch (error) {
      logger.error({ poolId, error }, "Failed to fetch pool depth");
      return { bids: [], asks: [] };
    }
  }

  /**
   * Fetch volume metrics for a pool
   */
  private async fetchPoolVolume(poolId: string): Promise<{ volume24h: number }> {
    const db = getDatabase();

    try {
      const result = await db("dex_trades")
        .where("pool_id", poolId)
        .where("created_at", ">", new Date(Date.now() - 86400000)) // Last 24 hours
        .sum("amount as total_volume")
        .first();

      return { volume24h: Number(result?.total_volume || 0) };
    } catch (error) {
      logger.error({ poolId, error }, "Failed to fetch pool volume");
      return { volume24h: 0 };
    }
  }

  /**
   * Get primed data for a pool
   */
  async getPrimedData(poolId: string): Promise<PoolDepthData | null> {
    const cacheKey = `${CACHE_KEY_PREFIX}${poolId}`;
    const data = await redis.get(cacheKey);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Get priming status
   */
  getStatus(): {
    isRunning: boolean;
    lastPrimingTime: Date | null;
    primingCount: number;
  } {
    return {
      isRunning: this.isRunning,
      lastPrimingTime: this.lastPrimingTime,
      primingCount: this.primingCount,
    };
  }
}

export const dexCachePrimerService = new DexCachePrimerService();
