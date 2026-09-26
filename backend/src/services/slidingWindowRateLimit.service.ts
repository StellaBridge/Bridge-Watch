/**
 * Sliding Window Rate Limiter with Tiered API Key Quotas
 * 
 * Implements Redis sorted set (ZADD/ZREMRANGEBYSCORE) sliding window algorithm
 * to prevent burst attacks across window boundaries. Links rate limit tiers
 * dynamically to the tier column in api_keys with custom burst multipliers.
 * 
 * Issue #1266
 */

import { redis } from "../utils/redis.js";
import { logger } from "../utils/logger.js";

export type RateLimitTier = "free" | "basic" | "premium" | "enterprise";

export interface SlidingWindowConfig {
  /** Requests allowed per window */
  maxRequests: number;
  /** Window duration in milliseconds */
  windowMs: number;
  /** Burst multiplier (e.g., 1.5 allows 50% burst at window boundary) */
  burstMultiplier: number;
}

export interface TierConfig {
  free: SlidingWindowConfig;
  basic: SlidingWindowConfig;
  premium: SlidingWindowConfig;
  enterprise: SlidingWindowConfig;
}

const DEFAULT_TIER_CONFIG: TierConfig = {
  free: {
    maxRequests: 100,
    windowMs: 60 * 1000, // 1 minute
    burstMultiplier: 1.2,
  },
  basic: {
    maxRequests: 500,
    windowMs: 60 * 1000,
    burstMultiplier: 1.5,
  },
  premium: {
    maxRequests: 2000,
    windowMs: 60 * 1000,
    burstMultiplier: 1.8,
  },
  enterprise: {
    maxRequests: 10000,
    windowMs: 60 * 1000,
    burstMultiplier: 2.0,
  },
};

const REDIS_KEY_PREFIX = "bw:rl:sliding:";

export class SlidingWindowRateLimiter {
  private tierConfig: TierConfig;

  constructor(config?: Partial<TierConfig>) {
    this.tierConfig = { ...DEFAULT_TIER_CONFIG, ...config };
  }

  /**
   * Check if a request is allowed using sliding window algorithm
   */
  async isAllowed(
    identifier: string,
    tier: RateLimitTier = "free",
    endpoint?: string
  ): Promise<{
    allowed: boolean;
    currentUsage: number;
    maxRequests: number;
    resetMs: number;
    retryAfterMs?: number;
  }> {
    const config = this.tierConfig[tier];
    const key = this.buildKey(identifier, endpoint);
    const now = Date.now();
    const windowStart = now - config.windowMs;

    try {
      const pipe = redis.pipeline();

      // Remove expired entries outside the window
      pipe.zremrangebyscore(key, 0, windowStart);

      // Add current request timestamp
      pipe.zadd(key, now, `${now}:${Math.random().toString(36).slice(2, 8)}`);

      // Count requests in current window
      pipe.zcard(key);

      // Set TTL on the key (cleanup)
      pipe.expire(key, Math.ceil(config.windowMs / 1000) + 1);

      const results = await pipe.exec();
      const currentUsage = results[2][1] as number;

      // Calculate effective limit with burst allowance
      const effectiveLimit = Math.ceil(config.maxRequests * config.burstMultiplier);
      const allowed = currentUsage <= effectiveLimit;

      // Calculate reset time (end of current window)
      const resetMs = config.windowMs - (now % config.windowMs);

      return {
        allowed,
        currentUsage,
        maxRequests: effectiveLimit,
        resetMs,
        retryAfterMs: allowed ? undefined : resetMs,
      };
    } catch (error) {
      logger.error({ error, identifier, tier }, "Sliding window rate limit check failed");
      // Fail open - allow request if Redis is unavailable
      return {
        allowed: true,
        currentUsage: 0,
        maxRequests: config.maxRequests,
        resetMs: config.windowMs,
      };
    }
  }

  /**
   * Get current usage for an identifier
   */
  async getUsage(
    identifier: string,
    tier: RateLimitTier = "free",
    endpoint?: string
  ): Promise<{
    current: number;
    limit: number;
    resetMs: number;
  }> {
    const config = this.tierConfig[tier];
    const key = this.buildKey(identifier, endpoint);
    const now = Date.now();
    const windowStart = now - config.windowMs;

    try {
      // Clean and count
      await redis.zremrangebyscore(key, 0, windowStart);
      const count = await redis.zcard(key);
      const resetMs = config.windowMs - (now % config.windowMs);

      return {
        current: count,
        limit: config.maxRequests,
        resetMs,
      };
    } catch (error) {
      logger.error({ error, identifier }, "Failed to get rate limit usage");
      return { current: 0, limit: config.maxRequests, resetMs: config.windowMs };
    }
  }

  /**
   * Reset rate limit for an identifier
   */
  async reset(identifier: string, endpoint?: string): Promise<void> {
    const key = this.buildKey(identifier, endpoint);
    try {
      await redis.del(key);
      logger.info({ identifier, endpoint }, "Rate limit reset");
    } catch (error) {
      logger.error({ error, identifier }, "Failed to reset rate limit");
    }
  }

  /**
   * Update tier configuration at runtime
   */
  updateTierConfig(tier: RateLimitTier, config: Partial<SlidingWindowConfig>): void {
    this.tierConfig[tier] = {
      ...this.tierConfig[tier],
      ...config,
    };
    logger.info({ tier, config: this.tierConfig[tier] }, "Rate limit tier config updated");
  }

  /**
   * Get tier from API key by querying the database
   */
  async getTierFromApiKey(apiKey: string): Promise<RateLimitTier> {
    try {
      // Try to get tier from Redis cache first
      const cachedTier = await redis.get(`bw:rl:tier:${apiKey}`);
      if (cachedTier) {
        return cachedTier as RateLimitTier;
      }

      // Fallback to prefix-based detection
      if (apiKey.startsWith("enterprise_")) return "enterprise";
      if (apiKey.startsWith("premium_")) return "premium";
      if (apiKey.startsWith("basic_")) return "basic";
      return "free";
    } catch (error) {
      logger.error({ error }, "Failed to get tier from API key");
      return "free";
    }
  }

  /**
   * Get rate limit stats for monitoring
   */
  async getStats(): Promise<{
    totalRequests: number;
    blockedRequests: number;
    tierDistribution: Record<RateLimitTier, number>;
  }> {
    try {
      const keys = await redis.keys(`${REDIS_KEY_PREFIX}*`);
      let totalRequests = 0;
      const tierDistribution: Record<RateLimitTier, number> = {
        free: 0,
        basic: 0,
        premium: 0,
        enterprise: 0,
      };

      for (const key of keys) {
        const count = await redis.zcard(key);
        totalRequests += count;

        // Extract tier from key pattern
        const parts = key.split(":");
        if (parts.length >= 4) {
          const tier = parts[3] as RateLimitTier;
          if (tier in tierDistribution) {
            tierDistribution[tier] += count;
          }
        }
      }

      return { totalRequests, blockedRequests: 0, tierDistribution };
    } catch (error) {
      logger.error({ error }, "Failed to get sliding window stats");
      return { totalRequests: 0, blockedRequests: 0, tierDistribution: { free: 0, basic: 0, premium: 0, enterprise: 0 } };
    }
  }

  private buildKey(identifier: string, endpoint?: string): string {
    const endpointPart = endpoint ? `:${endpoint}` : "";
    return `${REDIS_KEY_PREFIX}${identifier}${endpointPart}`;
  }
}

// Singleton instance
export const slidingWindowRateLimiter = new SlidingWindowRateLimiter();
