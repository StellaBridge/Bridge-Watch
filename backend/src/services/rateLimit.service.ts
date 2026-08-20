import { redis } from "../utils/redis.js";
import { logger } from "../utils/logger.js";
import type { RateLimitTier, EndpointCategory } from "../api/middleware/rateLimit.middleware.js";
import { getRateLimitMetrics } from "../api/middleware/rateLimit.middleware.js";
import { externalRateLimitMetricsService } from "./externalRateLimitMetrics.service.js";

export interface RateLimitStats {
  totalRequests: number;
  blockedRequests: number;
  whitelistedRequests: number;
  topIPs: Array<{ ip: string; requests: number; blocked: number }>;
  topApiKeys: Array<{ apiKey: string; tier: RateLimitTier; requests: number; blocked: number }>;
  endpointStats: Array<{ endpoint: string; category: EndpointCategory; requests: number; blocked: number }>;
  tierDistribution: Record<RateLimitTier, number>;
  currentWindowStats: {
    activeIPs: number;
    activeApiKeys: number;
    averageRequestsPerIP: number;
    peakRequestsPerMinute: number;
  };
}

export interface RateLimitAlert {
  type: "burst" | "sustained" | "global" | "endpoint";
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  metadata: Record<string, any>;
  timestamp: Date;
}

export interface RateLimitConfig {
  globalLimits: {
    requestsPerSecond: number;
    burstCapacity: number;
    alertThresholds: {
      burstAlertThreshold: number;
      sustainedAlertThreshold: number;
      globalAlertThreshold: number;
    };
  };
  endpointOverrides: Map<string, { limit: number; windowMs: number; burstAllowance: number }>;
  dynamicLimits: {
    enableLoadBasedAdjustment: boolean;
    loadMultiplier: number;
    highLoadThreshold: number;
  };
}

export class RateLimitService {
  private alertCallbacks: Array<(alert: RateLimitAlert) => void> = [];
  private config: RateLimitConfig;
  private requestBuffer: Array<{ timestamp: number; endpoint: string }> = [];
  private lastBufferCleanup = Date.now();

  constructor() {
    this.config = this.loadConfiguration();
    this.startBackgroundTasks();
  }

  /**
   * Get comprehensive rate limiting statistics
   */
  async getRateLimitStats(timeRange: "1h" | "24h" | "7d" = "24h"): Promise<RateLimitStats> {
    const now = Date.now();
    const timeRangeMs = this.getTimeRangeMs(timeRange);
    const startTime = now - timeRangeMs;

    try {
      // Get aggregated stats from Redis
      const statsKey = `bw:rl:stats:${timeRange}`;
      const stats = await redis.hgetall(statsKey);

      // Get top IPs
      const topIPs = await this.getTopIPs(startTime, now, 10);
      
      // Get top API keys
      const topApiKeys = await this.getTopApiKeys(startTime, now, 10);
      
      // Get endpoint statistics
      const endpointStats = await this.getEndpointStats(startTime, now);
      
      // Get tier distribution
      const tierDistribution = await this.getTierDistribution(startTime, now);
      
      // Get current window stats
      const currentWindowStats = await this.getCurrentWindowStats();

      return {
        totalRequests: parseInt(stats.totalRequests || "0"),
        blockedRequests: parseInt(stats.blockedRequests || "0"),
        whitelistedRequests: parseInt(stats.whitelistedRequests || "0"),
        topIPs,
        topApiKeys,
        endpointStats,
        tierDistribution,
        currentWindowStats,
      };
    } catch (error) {
      logger.error({ error, timeRange }, "Failed to get rate limit stats");
      throw error;
    }
  }

  /**
   * Get rate limit status for a specific IP or API key
   */
  async getRateLimitStatus(identifier: string, type: "ip" | "apiKey"): Promise<{
    currentLimit: number;
    currentUsage: number;
    remaining: number;
    resetTime: Date;
    tier?: RateLimitTier;
    endpointLimits: Array<{ endpoint: string; limit: number; usage: number }>;
  }> {
    try {
      const pattern = type === "ip" 
        ? `bw:rl:ip:${identifier}:*`
        : `bw:rl:key:${identifier}:*`;
      
      const keys = await redis.keys(pattern);
      const results = await Promise.all(
        keys.map(async (key) => {
          const [, , , , endpoint] = key.split(":");
          const windowData = await redis.zcard(key);
          const ttl = await redis.pttl(key);
          
          return {
            endpoint,
            limit: 0,
            usage: windowData,
            resetTime: new Date(Date.now() + ttl),
          };
        })
      );

      // Get tier for API keys
      let tier: RateLimitTier | undefined;
      if (type === "apiKey") {
        tier = this.getTierFromApiKey(identifier);
      }

      return {
        currentLimit: 0, // Would need to be calculated based on tier and endpoint
        currentUsage: results.reduce((sum, r) => sum + r.usage, 0),
        remaining: 0, // Calculated from limits
        resetTime: new Date(Math.max(...results.map(r => r.resetTime.getTime()))),
        tier,
        endpointLimits: results,
      };
    } catch (error) {
      logger.error({ error, identifier, type }, "Failed to get rate limit status");
      throw error;
    }
  }

  /**
   * Reset rate limit for a specific IP or API key (admin function)
   */
  async resetRateLimit(identifier: string, type: "ip" | "apiKey", endpoint?: string): Promise<void> {
    try {
      const pattern = endpoint
        ? type === "ip" 
          ? `bw:rl:ip:${identifier}:${endpoint}`
          : `bw:rl:key:${identifier}:${endpoint}`
        : type === "ip"
          ? `bw:rl:ip:${identifier}:*`
          : `bw:rl:key:${identifier}:*`;
      
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
        logger.info({ identifier, type, endpoint, keysDeleted: keys.length }, "Rate limit reset");
      }
    } catch (error) {
      logger.error({ error, identifier, type, endpoint }, "Failed to reset rate limit");
        // Best-effort operation: log and continue. The rate limit window will
        // expire naturally even if the Redis keys could not be removed.
    }
  }

  /**
   * Update rate limits dynamically (admin function)
   */
  async updateRateLimit(
    tier: RateLimitTier,
    newLimits: { requestsPerWindow: number; windowMs: number; burstAllowance: number }
  ): Promise<void> {
    try {
      const configKey = `bw:rl:config:${tier}`;
      await redis.hset(configKey, {
        requestsPerWindow: newLimits.requestsPerWindow,
        windowMs: newLimits.windowMs,
        burstAllowance: newLimits.burstAllowance,
        updatedAt: Date.now(),
      });
      
      logger.info({ tier, newLimits }, "Rate limit configuration updated");
      
      // Trigger configuration reload notification
      await this.notifyConfigChange(tier, newLimits);
    } catch (error) {
      logger.error({ error, tier, newLimits }, "Failed to update rate limit");
      throw error;
    }
  }

  /**
   * Add alert callback for rate limit events
   */
  onAlert(callback: (alert: RateLimitAlert) => void): void {
    this.alertCallbacks.push(callback);
  }

  /**
   * Get real-time rate limit metrics for monitoring
   */
  async getRealTimeMetrics(): Promise<{
    requestsPerSecond: number;
    blockedPerSecond: number;
    activeConnections: number;
    memoryUsage: number;
    redisConnections: number;
  }> {
    const now = Date.now();
    const oneSecondAgo = now - 1000;

    try {
      // Get recent request count
      const recentRequests = this.requestBuffer.filter(r => r.timestamp >= oneSecondAgo).length;
      
      // Get Redis info
      const redisInfo = await redis.info("memory");
      const memoryMatch = redisInfo.match(/used_memory:(\d+)/);
      const memoryUsage = memoryMatch ? parseInt(memoryMatch[1]) : 0;

      return {
        requestsPerSecond: recentRequests,
        blockedPerSecond: 0, // Would need to be tracked separately
        activeConnections: 0, // Would need to be tracked via connection pool
        memoryUsage,
        redisConnections: 0, // Would need to be tracked via Redis client
      };
    } catch (error) {
      logger.error({ error }, "Failed to get real-time metrics");
      throw error;
    }
  }

  /**
   * Export rate limit data for analysis
   */
  async exportData(
    format: "json" | "csv",
    timeRange: "1h" | "24h" | "7d" = "24h"
  ): Promise<string> {
    const stats = await this.getRateLimitStats(timeRange);
    
    if (format === "json") {
      return JSON.stringify(stats, null, 2);
    } else {
      // CSV format
      const headers = ["Type", "Identifier", "Tier", "Endpoint", "Requests", "Blocked"];
      const rows = [headers.join(",")];
      
      // Add IP data
      stats.topIPs.forEach(ip => {
        rows.push(`IP,${ip.ip},N/A,All,${ip.requests},${ip.blocked}`);
      });
      
      // Add API key data
      stats.topApiKeys.forEach(key => {
        rows.push(`API Key,${key.apiKey},${key.tier},All,${key.requests},${key.blocked}`);
      });
      
      return rows.join("\n");
    }
  }

  /**
   * Helper method to compute external rate-limit metrics against real rate-limit data structure.
   * Calculates total requests, blocked requests, usage percentages, and throttling status.
   */
  async computeExternalRateLimitMetrics(options?: {
    providerKey?: string;
    timeRange?: "1h" | "24h" | "7d";
  }): Promise<{
    providerKey?: string;
    totalRequests: number;
    blockedRequests: number;
    throttledCount: number;
    burstCount: number;
    usagePercent: number | null;
    isThrottled: boolean;
    tierDistribution: Record<RateLimitTier, number>;
  }> {
    const timeRange = options?.timeRange ?? "24h";
    const stats = await this.getRateLimitStats(timeRange);

    const providerKey = options?.providerKey;
    let throttledCount = 0;
    let burstCount = 0;
    let usagePercent: number | null = null;
    let isThrottled = false;

    if (providerKey) {
      try {
        const snapshots = await externalRateLimitMetricsService.getProviderSnapshots();
        const providerSnap = snapshots.find((s) => s.providerKey === providerKey);
        if (providerSnap) {
          throttledCount = providerSnap.throttledCount;
          burstCount = providerSnap.burstCount;
          usagePercent = providerSnap.usagePercent;
          isThrottled = providerSnap.isThrottled;
        }
      } catch (err) {
        logger.warn({ err, providerKey }, "Failed to fetch provider snapshot for external rate limit metrics");
      }
    }

    if (usagePercent === null && stats.totalRequests > 0) {
      const limit = this.config.globalLimits.requestsPerSecond * (this.getTimeRangeMs(timeRange) / 1000);
      usagePercent = Math.min(100, Math.round((stats.totalRequests / limit) * 100));
    }

    return {
      ...(providerKey ? { providerKey } : {}),
      totalRequests: stats.totalRequests,
      blockedRequests: stats.blockedRequests,
      throttledCount,
      burstCount,
      usagePercent,
      isThrottled,
      tierDistribution: stats.tierDistribution,
    };
  }

  // Private helper methods

  private loadConfiguration(): RateLimitConfig {
    return {
      globalLimits: {
        requestsPerSecond: 1000,
        burstCapacity: 5000,
        alertThresholds: {
          burstAlertThreshold: 0.8,
          sustainedAlertThreshold: 0.7,
          globalAlertThreshold: 0.9,
        },
      },
      endpointOverrides: new Map(),
      dynamicLimits: {
        enableLoadBasedAdjustment: false,
        loadMultiplier: 0.5,
        highLoadThreshold: 0.8,
      },
    };
  }

  private startBackgroundTasks(): void {
    // Cleanup request buffer every minute
    setInterval(() => {
      this.cleanupRequestBuffer();
    }, 60000);

    // Update aggregated stats every 5 minutes
    setInterval(() => {
      this.updateAggregatedStats();
    }, 300000);

    // Check for alert conditions every 30 seconds
    setInterval(() => {
      this.checkAlertConditions();
    }, 30000);
  }

  private cleanupRequestBuffer(): void {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    this.requestBuffer = this.requestBuffer.filter(r => r.timestamp >= oneMinuteAgo);
    this.lastBufferCleanup = now;
  }

  private async updateAggregatedStats(): Promise<void> {
    try {
      const middlewareMetrics = getRateLimitMetrics();
      for (const range of ["1h", "24h", "7d"]) {
        const key = `bw:rl:stats:${range}`;
        await redis.hset(key, {
          totalRequests: middlewareMetrics.totalRequests,
          blockedRequests: middlewareMetrics.blockedRequests,
          whitelistedRequests: middlewareMetrics.whitelistedRequests,
        });
      }
    } catch (error) {
      logger.error({ error }, "Failed to update aggregated stats");
    }
  }

  private async checkAlertConditions(): Promise<void> {
    try {
      const metrics = await this.getRealTimeMetrics();
      const { globalLimits } = this.config;

      // Check for burst alerts
      if (metrics.requestsPerSecond > globalLimits.requestsPerSecond * globalLimits.alertThresholds.burstAlertThreshold) {
        this.triggerAlert({
          type: "burst",
          severity: "high",
          message: `Burst traffic detected: ${metrics.requestsPerSecond} req/s`,
          metadata: { requestsPerSecond: metrics.requestsPerSecond },
          timestamp: new Date(),
        });
      }

      // Check for global alerts
      const utilization = metrics.requestsPerSecond / globalLimits.requestsPerSecond;
      if (utilization > globalLimits.alertThresholds.globalAlertThreshold) {
        this.triggerAlert({
          type: "global",
          severity: "critical",
          message: `Global rate limit threshold exceeded: ${Math.round(utilization * 100)}% utilization`,
          metadata: { utilization, requestsPerSecond: metrics.requestsPerSecond },
          timestamp: new Date(),
        });
      }
    } catch (error) {
      logger.error({ error }, "Failed to check alert conditions");
    }
  }

  private triggerAlert(alert: RateLimitAlert): void {
    logger.warn(alert, "Rate limit alert triggered");
    
    this.alertCallbacks.forEach(callback => {
      try {
        callback(alert);
      } catch (error) {
        logger.error({ error, alert }, "Failed to execute alert callback");
      }
    });
  }

  private async notifyConfigChange(tier: RateLimitTier, newLimits: any): Promise<void> {
    // Notify other instances of configuration change
    await redis.publish("bw:rl:config-change", JSON.stringify({ tier, newLimits }));
  }

  private getTimeRangeMs(timeRange: "1h" | "24h" | "7d"): number {
    switch (timeRange) {
      case "1h": return 60 * 60 * 1000;
      case "24h": return 24 * 60 * 60 * 1000;
      case "7d": return 7 * 24 * 60 * 60 * 1000;
      default: return 24 * 60 * 60 * 1000;
    }
  }

  private async getTopIPs(startTime: number, endTime: number, limit: number): Promise<Array<{ ip: string; requests: number; blocked: number }>> {
    try {
      const keys = await redis.keys("bw:rl:ip:*");
      const ipMap = new Map<string, number>();

      for (const key of keys) {
        const parts = key.split(":");
        if (parts.length < 5) continue;
        const ip = parts[3];

        const members = await redis.zrangebyscore(key, startTime, endTime);
        const count = members.length;
        if (count > 0) {
          ipMap.set(ip, (ipMap.get(ip) || 0) + count);
        }
      }

      return Array.from(ipMap.entries())
        .map(([ip, requests]) => ({ ip, requests, blocked: 0 }))
        .sort((a, b) => b.requests - a.requests)
        .slice(0, limit);
    } catch (error) {
      logger.error({ error, startTime, endTime, limit }, "Failed to get top IPs");
      return [];
    }
  }

  private async getTopApiKeys(startTime: number, endTime: number, limit: number): Promise<Array<{ apiKey: string; tier: RateLimitTier; requests: number; blocked: number }>> {
    try {
      const keys = await redis.keys("bw:rl:key:*");
      const keyMap = new Map<string, { requests: number; tier: RateLimitTier }>();

      for (const key of keys) {
        const parts = key.split(":");
        if (parts.length < 5) continue;
        const apiKey = parts[3];
        const tier = this.getTierFromApiKey(apiKey);

        const members = await redis.zrangebyscore(key, startTime, endTime);
        const count = members.length;
        if (count > 0) {
          const existing = keyMap.get(apiKey) || { requests: 0, tier };
          existing.requests += count;
          keyMap.set(apiKey, existing);
        }
      }

      return Array.from(keyMap.entries())
        .map(([apiKey, { requests, tier }]) => ({ apiKey, tier, requests, blocked: 0 }))
        .sort((a, b) => b.requests - a.requests)
        .slice(0, limit);
    } catch (error) {
      logger.error({ error, startTime, endTime, limit }, "Failed to get top API keys");
      return [];
    }
  }

  private async getEndpointStats(startTime: number, endTime: number): Promise<Array<{ endpoint: string; category: EndpointCategory; requests: number; blocked: number }>> {
    try {
      const ipKeys = await redis.keys("bw:rl:ip:*");
      const keyKeys = await redis.keys("bw:rl:key:*");
      const allKeys = [...ipKeys, ...keyKeys];
      const endpointMap = new Map<string, { requests: number; category: EndpointCategory }>();

      for (const key of allKeys) {
        const parts = key.split(":");
        if (parts.length < 5) continue;
        const endpoint = parts[4];

        let category: EndpointCategory = "read";
        if (endpoint === "ws" || endpoint === "websocket") {
          category = "websocket";
        } else if (endpoint === "admin" || endpoint === "circuit-breaker") {
          category = "admin";
        } else if (key.includes(":write:")) {
          category = "write";
        }

        const members = await redis.zrangebyscore(key, startTime, endTime);
        const count = members.length;
        if (count > 0) {
          const existing = endpointMap.get(endpoint) || { requests: 0, category };
          existing.requests += count;
          endpointMap.set(endpoint, existing);
        }
      }

      return Array.from(endpointMap.entries()).map(([endpoint, { requests, category }]) => ({
        endpoint,
        category,
        requests,
        blocked: 0,
      }));
    } catch (error) {
      logger.error({ error, startTime, endTime }, "Failed to get endpoint stats");
      return [];
    }
  }

  private async getTierDistribution(startTime: number, endTime: number): Promise<Record<RateLimitTier, number>> {
    const distribution: Record<RateLimitTier, number> = { free: 0, basic: 0, premium: 0, trusted: 0 };
    try {
      const ipKeys = await redis.keys("bw:rl:ip:*");
      const keyKeys = await redis.keys("bw:rl:key:*");

      for (const key of ipKeys) {
        const members = await redis.zrangebyscore(key, startTime, endTime);
        distribution.free += members.length;
      }

      for (const key of keyKeys) {
        const parts = key.split(":");
        if (parts.length < 5) continue;
        const apiKey = parts[3];
        const tier = this.getTierFromApiKey(apiKey);

        const members = await redis.zrangebyscore(key, startTime, endTime);
        distribution[tier] += members.length;
      }
    } catch (error) {
      logger.error({ error, startTime, endTime }, "Failed to get tier distribution");
    }
    return distribution;
  }

  private async getCurrentWindowStats(): Promise<{
    activeIPs: number;
    activeApiKeys: number;
    averageRequestsPerIP: number;
    peakRequestsPerMinute: number;
  }> {
    try {
      const ipKeys = await redis.keys("bw:rl:ip:*");
      const keyKeys = await redis.keys("bw:rl:key:*");

      const activeIPsSet = new Set<string>();
      let totalIPRequests = 0;
      for (const key of ipKeys) {
        const parts = key.split(":");
        if (parts.length < 5) continue;
        const ip = parts[3];
        const card = await redis.zcard(key);
        if (card > 0) {
          activeIPsSet.add(ip);
          totalIPRequests += card;
        }
      }

      const activeApiKeysSet = new Set<string>();
      for (const key of keyKeys) {
        const parts = key.split(":");
        if (parts.length < 5) continue;
        const apiKey = parts[3];
        const card = await redis.zcard(key);
        if (card > 0) {
          activeApiKeysSet.add(apiKey);
        }
      }

      const activeIPs = activeIPsSet.size;
      const activeApiKeys = activeApiKeysSet.size;
      const averageRequestsPerIP = activeIPs > 0 ? Number((totalIPRequests / activeIPs).toFixed(2)) : 0;

      const now = Date.now();
      const oneMinuteAgo = now - 60000;
      const peakRequestsPerMinute = this.requestBuffer.filter(r => r.timestamp >= oneMinuteAgo).length;

      return {
        activeIPs,
        activeApiKeys,
        averageRequestsPerIP,
        peakRequestsPerMinute,
      };
    } catch (error) {
      logger.error({ error }, "Failed to get current window stats");
      return {
        activeIPs: 0,
        activeApiKeys: 0,
        averageRequestsPerIP: 0,
        peakRequestsPerMinute: 0,
      };
    }
  }

  private getTierFromApiKey(apiKey: string): RateLimitTier {
    if (apiKey.startsWith("premium_")) return "premium";
    if (apiKey.startsWith("basic_")) return "basic";
    return "free";
  }
}
