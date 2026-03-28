import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { AnalyticsService } from "../../src/services/analytics.service.js";
import { CacheService } from "../../src/utils/cache.js";

// We mock CacheService so we don't have to worry about Redis internals here.
vi.mock("../../src/utils/cache.js", () => {
  return {
    CacheService: {
      getOrSet: vi.fn(),
      invalidateByTag: vi.fn(),
      invalidatePattern: vi.fn(),
      generateKey: vi.fn((namespace, id) => `cache:${namespace}:${id}`),
    },
    CacheTTL: {
      ANALYTICS: 300,
      PRICES: 60,
      METADATA: 3600,
      HEALTH_SCORE: 600,
    }
  };
});

describe("AnalyticsService", () => {
  let analyticsService: AnalyticsService;

  beforeEach(() => {
    analyticsService = new AnalyticsService();
    vi.clearAllMocks();

    // Default mock implementation for getOrSet to just execute the fetcher
    vi.mocked(CacheService.getOrSet).mockImplementation(async (key, fetcher, options) => {
      return fetcher();
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getProtocolStats", () => {
    it("should return cached protocol stats if available", async () => {
      const cachedStats = {
        totalValueLocked: "1000000",
        totalVolume24h: "500000",
        activeBridges: 5,
        activeAssets: 10,
        timestamp: new Date().toISOString(),
      };

      vi.mocked(CacheService.getOrSet).mockResolvedValue(cachedStats);

      const result = await analyticsService.getProtocolStats();

      expect(CacheService.getOrSet).toHaveBeenCalledWith(
        "cache:analytics:protocol:stats",
        expect.any(Function),
        expect.objectContaining({ tags: ["analytics"], ttl: 300 })
      );
      expect(result).toEqual(cachedStats);
    });

    it("should compute and cache protocol stats if not cached", async () => {
      const result = await analyticsService.getProtocolStats();

      expect(result).toHaveProperty("totalValueLocked");
      expect(result).toHaveProperty("totalVolume24h");
      expect(result).toHaveProperty("activeBridges");
      expect(result).toHaveProperty("activeAssets");
      expect(result).toHaveProperty("timestamp");
    });
  });

  describe("getBridgeComparisons", () => {
    it("should return cached bridge comparisons if available", async () => {
      const cachedComparisons = [
        {
          bridgeName: "Circle USDC",
          tvl: "500000",
          volume24h: "100000",
          status: "healthy",
          marketShare: 50,
        },
      ];

      vi.mocked(CacheService.getOrSet).mockResolvedValue(cachedComparisons);

      const result = await analyticsService.getBridgeComparisons();

      expect(CacheService.getOrSet).toHaveBeenCalledWith(
        "cache:analytics:bridges:comparison",
        expect.any(Function),
        expect.anything()
      );
      expect(result).toEqual(cachedComparisons);
    });

    it("should compute bridge comparisons with market share", async () => {
      const result = await analyticsService.getBridgeComparisons();

      expect(Array.isArray(result)).toBe(true);
      if (result.length > 0) {
        expect(result[0]).toHaveProperty("bridgeName");
        expect(result[0]).toHaveProperty("tvl");
        expect(result[0]).toHaveProperty("marketShare");
        expect(result[0]).toHaveProperty("trend");
      }
    });
  });

  describe("getAssetRankings", () => {
    it("should return cached asset rankings if available", async () => {
      const cachedRankings = [
        {
          symbol: "USDC",
          rank: 1,
          healthScore: 95,
          tvl: "1000000",
          trend: "up",
        },
      ];

      vi.mocked(CacheService.getOrSet).mockResolvedValue(cachedRankings);

      const result = await analyticsService.getAssetRankings();

      expect(CacheService.getOrSet).toHaveBeenCalledWith(
        "cache:analytics:assets:rankings",
        expect.any(Function),
        expect.anything()
      );
      expect(result).toEqual(cachedRankings);
    });

    it("should compute and rank assets by health score", async () => {
      const result = await analyticsService.getAssetRankings();

      expect(Array.isArray(result)).toBe(true);
      
      // Verify rankings are sequential
      result.forEach((ranking, index) => {
        expect(ranking.rank).toBe(index + 1);
      });

      // Verify sorted by health score descending
      for (let i = 0; i < result.length - 1; i++) {
        expect(result[i].healthScore).toBeGreaterThanOrEqual(result[i + 1].healthScore);
      }
    });
  });

  describe("getVolumeAggregation", () => {
    it("should return cached volume aggregation if available", async () => {
      const cachedAggregation = [
        {
          period: "2024-01-01",
          totalVolume: "100000",
          inflowVolume: "60000",
          outflowVolume: "40000",
          transactionCount: 150,
        },
      ];

      vi.mocked(CacheService.getOrSet).mockResolvedValue(cachedAggregation);

      const result = await analyticsService.getVolumeAggregation("daily");

      expect(CacheService.getOrSet).toHaveBeenCalledWith(
        "cache:analytics:volume:daily:all:all",
        expect.any(Function),
        expect.anything()
      );
      expect(result).toEqual(cachedAggregation);
    });

    it("should compute volume aggregation for different periods", async () => {
      const periods: Array<"hourly" | "daily" | "weekly" | "monthly"> = [
        "hourly",
        "daily",
        "weekly",
        "monthly",
      ];

      for (const period of periods) {
        const result = await analyticsService.getVolumeAggregation(period);
        expect(Array.isArray(result)).toBe(true);
      }
    });

    it("should filter by symbol and bridge name", async () => {
      const result = await analyticsService.getVolumeAggregation(
        "daily",
        "USDC",
        "Circle USDC"
      );

      expect(Array.isArray(result)).toBe(true);
      expect(CacheService.getOrSet).toHaveBeenCalledWith(
        "cache:analytics:volume:daily:USDC:Circle USDC", 
        expect.any(Function), 
        expect.anything()
      );
    });
  });

  describe("calculateTrend", () => {
    it("should calculate health score trend for an asset", async () => {
      const result = await analyticsService.calculateTrend("health_score", "USDC");

      expect(result).toHaveProperty("metric", "health_score");
      expect(result).toHaveProperty("current");
      expect(result).toHaveProperty("previous");
      expect(result).toHaveProperty("change");
      expect(result).toHaveProperty("changePercent");
      expect(result).toHaveProperty("trend");
      expect(["up", "down", "stable"]).toContain(result.trend);
    });

    it("should calculate TVL trend", async () => {
      const result = await analyticsService.calculateTrend("tvl");

      expect(result.metric).toBe("tvl");
      expect(typeof result.current).toBe("number");
      expect(typeof result.previous).toBe("number");
    });

    it("should calculate volume trend with filters", async () => {
      const result = await analyticsService.calculateTrend("volume", "USDC", "Circle USDC");

      expect(result.metric).toBe("volume");
      expect(result).toHaveProperty("changePercent");
    });

    it("should throw error for unknown metric", async () => {
      await expect(
        analyticsService.calculateTrend("unknown_metric")
      ).rejects.toThrow("Unknown metric: unknown_metric");
    });

    it("should throw error when symbol required but not provided", async () => {
      await expect(
        analyticsService.calculateTrend("health_score")
      ).rejects.toThrow("Symbol required for health_score metric");
    });
  });

  describe("getTopPerformers", () => {
    it("should return top performing assets by health", async () => {
      const result = await analyticsService.getTopPerformers("assets", "health", 5);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeLessThanOrEqual(5);
    });

    it("should return top performing bridges by TVL", async () => {
      const result = await analyticsService.getTopPerformers("bridges", "tvl", 10);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeLessThanOrEqual(10);
    });

    it("should cache top performers", async () => {
      await analyticsService.getTopPerformers("assets", "volume", 5);

      expect(CacheService.getOrSet).toHaveBeenCalledWith(
        "cache:analytics:top:assets:volume:5",
        expect.any(Function),
        expect.anything()
      );
    });
  });

  describe("invalidateCache", () => {
    it("should invalidate all analytics cache when no pattern provided", async () => {
      await analyticsService.invalidateCache();
      expect(CacheService.invalidateByTag).toHaveBeenCalledWith("analytics");
    });

    it("should invalidate cache matching pattern", async () => {
      await analyticsService.invalidateCache("protocol");
      expect(CacheService.invalidatePattern).toHaveBeenCalledWith("cache:analytics:protocol*");
    });
  });

  describe("getHistoricalComparison", () => {
    it("should fetch historical health score data", async () => {
      const result = await analyticsService.getHistoricalComparison(
        "health_score",
        "USDC",
        7
      );

      expect(Array.isArray(result)).toBe(true);
      if (result.length > 0) {
        expect(result[0]).toHaveProperty("date");
        expect(result[0]).toHaveProperty("value");
      }
    });

    it("should fetch historical volume data", async () => {
      const result = await analyticsService.getHistoricalComparison("volume", "USDC", 30);

      expect(Array.isArray(result)).toBe(true);
    });

    it("should fetch historical liquidity data", async () => {
      const result = await analyticsService.getHistoricalComparison("liquidity", "USDC", 14);

      expect(Array.isArray(result)).toBe(true);
    });

    it("should throw error for unknown metric", async () => {
      await expect(
        analyticsService.getHistoricalComparison("unknown", "USDC", 7)
      ).rejects.toThrow("Unknown metric: unknown");
    });

    it("should throw error when symbol required but not provided", async () => {
      await expect(
        analyticsService.getHistoricalComparison("health_score", undefined, 7)
      ).rejects.toThrow("Symbol required for health_score metric");
    });
  });

  describe("executeCustomMetric", () => {
    it("should execute custom metric query", async () => {
      const customMetric = {
        id: "test-metric",
        name: "Test Metric",
        description: "A test metric",
        query: "SELECT 1 as value",
        parameters: {},
        cacheKey: "test-metric",
        cacheTTL: 300,
      };

      const result = await analyticsService.executeCustomMetric(customMetric);

      expect(result).toBeDefined();
      expect(CacheService.getOrSet).toHaveBeenCalledWith(
        "cache:analytics:custom:test-metric",
        expect.any(Function),
        expect.objectContaining({ ttl: 300 })
      );
    });

    it("should return cached custom metric result", async () => {
      const cachedResult = [{ value: 42 }];
      const customMetric = {
        id: "test-metric",
        name: "Test Metric",
        description: "A test metric",
        query: "SELECT 1 as value",
        parameters: {},
        cacheKey: "test-metric",
        cacheTTL: 300,
      };

      vi.mocked(CacheService.getOrSet).mockResolvedValue(cachedResult);

      const result = await analyticsService.executeCustomMetric(customMetric);

      expect(result).toEqual(cachedResult);
      expect(CacheService.getOrSet).toHaveBeenCalledWith(
        "cache:analytics:custom:test-metric",
        expect.any(Function),
        expect.anything()
      );
    });
  });
});
