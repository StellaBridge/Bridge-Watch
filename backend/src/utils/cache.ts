import { redis } from "./redis.js";
import { logger } from "./logger.js";

// Global cache statistics in memory
export const cacheStats = {
  hits: 0,
  misses: 0,
  errors: 0,
  bypassed: 0,
  invalidations: 0,
};

// Standardized Cache TTLs per data type in seconds
export enum CacheTTL {
  ANALYTICS = 300,        // 5 mins
  ASSET_METADATA = 3600,  // 1 hour
  BRIDGE_STATS = 300,     // 5 mins
  PRICES = 60,            // 1 min
  HEALTH_SCORES = 600,    // 10 mins
  USER_PREFS = 86400,     // 1 day
  LONG_LIVED = 86400 * 7, // 1 week
}

export interface GetOrSetOptions {
  ttl?: number;          // TTL in seconds
  tags?: string[];       // Tags for bulk invalidation
  bypassCache?: boolean; // Force refresh flag
}

/**
 * Serializes complex objects into string.
 */
function serialize(data: any): string {
  try {
    return JSON.stringify(data);
  } catch (error) {
    logger.error({ error }, "Error serializing cache data");
    throw error;
  }
}

/**
 * Deserializes string back to complex objects.
 */
function deserialize<T>(data: string): T {
  try {
    return JSON.parse(data) as T;
  } catch (error) {
    logger.error({ error }, "Error deserializing cache data");
    throw error;
  }
}

export class CacheService {
  /**
   * Helper for standardized cache key naming.
   */
  static generateKey(namespace: string, id: string): string {
    return `cache:${namespace}:${id}`;
  }

  /**
   * Retrieves data from cache or fetches it via the fetcher function, then caches it.
   */
  static async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: GetOrSetOptions = {}
  ): Promise<T> {
    const { ttl = CacheTTL.ANALYTICS, tags = [], bypassCache = false } = options;

    if (bypassCache) {
      cacheStats.bypassed++;
      logger.debug({ key }, "Bypassing cache due to flag");
      return this.fetchAndCache(key, fetcher, ttl, tags);
    }

    try {
      const cached = await redis.get(key);
      if (cached) {
        cacheStats.hits++;
        logger.debug({ key }, "Cache hit");
        return deserialize<T>(cached);
      }
    } catch (error) {
      cacheStats.errors++;
      logger.error({ key, error }, "Redis GET failure. Graceful degradation: falling back to source fetch.");
      // Fallback to fetcher without throwing to ensure graceful degradation.
    }

    cacheStats.misses++;
    logger.debug({ key }, "Cache miss");
    return this.fetchAndCache(key, fetcher, ttl, tags);
  }

  /**
   * Internal method to fetch from source, serialize, cache, and manage tags.
   */
  private static async fetchAndCache<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number,
    tags: string[]
  ): Promise<T> {
    const data = await fetcher();

    try {
      const serialized = serialize(data);
      // Set value with TTL
      await redis.setex(key, ttl, serialized);

      // Link tags to this key for bulk invalidation
      for (const tag of tags) {
        const tagKey = `cache:tag:${tag}`;
        // Add to Redis set, let it expire roughly when the original keys do, or keep long-term (we'll keep it max long-lived TTL)
        await redis.sadd(tagKey, key);
        await redis.expire(tagKey, CacheTTL.LONG_LIVED);
      }
    } catch (error) {
      cacheStats.errors++;
      logger.error({ key, error }, "Redis SET failure. Graceful degradation: data fetched successfully but not cached.");
    }

    return data;
  }

  /**
   * Invalidate a specific key.
   */
  static async invalidateKey(key: string): Promise<void> {
    try {
      logger.info({ key }, "Invalidating individual cache key");
      await redis.del(key);
      cacheStats.invalidations++;
    } catch (error) {
      cacheStats.errors++;
      logger.error({ key, error }, "Failed to invalidate cache key");
    }
  }

  /**
   * Invalidate all keys associated with a specific tag.
   */
  static async invalidateByTag(tag: string): Promise<void> {
    const tagKey = `cache:tag:${tag}`;
    try {
      logger.info({ tag }, "Invalidating cache by tag");
      // SPOP/SMEMBERS to get the keys
      const keys = await redis.smembers(tagKey);
      if (keys && keys.length > 0) {
        // Delete all data keys
        await redis.del(...keys);
        cacheStats.invalidations += keys.length;
      }
      // Delete the tag set itself
      await redis.del(tagKey);
    } catch (error) {
      cacheStats.errors++;
      logger.error({ tag, error }, "Failed to invalidate cache by tag");
    }
  }

  /**
   * Invalidate a pattern of keys manually (use sparingly, scanning redis is expensive).
   */
  static async invalidatePattern(pattern: string): Promise<void> {
    try {
      logger.info({ pattern }, "Invalidating cache by pattern");
      let cursor = "0";
      do {
        const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
        cursor = nextCursor;
        if (keys && keys.length > 0) {
          await redis.del(...keys);
          cacheStats.invalidations += keys.length;
        }
      } while (cursor !== "0");
    } catch (error) {
      cacheStats.errors++;
      logger.error({ pattern, error }, "Failed to invalidate cache pattern");
    }
  }

  /**
   * Returns collected cache statistics.
   */
  static getStats() {
    return { ...cacheStats };
  }
}
