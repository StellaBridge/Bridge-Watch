import { describe, it, expect, beforeEach, vi } from "vitest";
import { DexCachePrimerService } from "../dexCachePrimer.service.js";

vi.mock("../../database/connection.js", () => {
  const mockDb: any = vi.fn().mockImplementation(() => mockDb);
  mockDb.select = vi.fn().mockReturnValue(mockDb);
  mockDb.orderBy = vi.fn().mockReturnValue(mockDb);
  mockDb.limit = vi.fn().mockReturnValue(mockDb);
  mockDb.where = vi.fn().mockReturnValue(mockDb);
  mockDb.sum = vi.fn().mockReturnValue(mockDb);
  mockDb.first = vi.fn().mockResolvedValue(null);
  return { getDatabase: () => mockDb };
});

vi.mock("../../utils/redis.js", () => ({
  redis: {
    setex: vi.fn().mockResolvedValue("OK"),
    zadd: vi.fn().mockResolvedValue(1),
    get: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock("../../utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("DexCachePrimerService", () => {
  let service: DexCachePrimerService;

  beforeEach(() => {
    service = new DexCachePrimerService();
    vi.clearAllMocks();
  });

  describe("primeOnStartup", () => {
    it("should successfully prime cache on startup", async () => {
      const mockDb = vi.mocked(require("../../database/connection.js").getDatabase());
      mockDb.select = vi.fn().mockReturnValue(mockDb);
      mockDb.orderBy = vi.fn().mockReturnValue(mockDb);
      mockDb.limit = vi.fn().mockResolvedValue([
        {
          pool_id: "pool-1",
          asset_code: "USDC",
          asset_issuer: "issuer-1",
          tvl: 1000000,
        },
        {
          pool_id: "pool-2",
          asset_code: "EURC",
          asset_issuer: "issuer-2",
          tvl: 500000,
        },
      ]);

      mockDb.where = vi.fn().mockReturnValue(mockDb);
      mockDb.sum = vi.fn().mockReturnValue(mockDb);
      mockDb.first = vi.fn().mockResolvedValue({ total_volume: 50000 });

      const redis = vi.mocked(require("../../utils/redis.js").redis);
      redis.setex = vi.fn().mockResolvedValue("OK");
      redis.zadd = vi.fn().mockResolvedValue(1);

      await service.primeOnStartup();

      const status = service.getStatus();
      expect(status.isRunning).toBe(false);
      expect(status.lastPrimingTime).toBeDefined();
      expect(status.primingCount).toBeGreaterThan(0);
    });

    it("should prevent concurrent priming operations", async () => {
      const mockDb = vi.mocked(require("../../database/connection.js").getDatabase());
      mockDb.select = vi.fn().mockReturnValue(mockDb);
      mockDb.orderBy = vi.fn().mockReturnValue(mockDb);
      mockDb.limit = vi.fn().mockResolvedValue([]);

      const logger = vi.mocked(require("../../utils/logger.js").logger);

      (service as any).isRunning = true;

      await service.primeOnStartup();

      expect(logger.warn).toHaveBeenCalledWith("Cache priming already in progress");
    });

    it("should handle database errors gracefully", async () => {
      const mockDb = vi.mocked(require("../../database/connection.js").getDatabase());
      mockDb.select = vi.fn().mockReturnValue(mockDb);
      mockDb.orderBy = vi.fn().mockReturnValue(mockDb);
      mockDb.limit = vi.fn().mockRejectedValue(new Error("Database connection failed"));

      const logger = vi.mocked(require("../../utils/logger.js").logger);

      await service.primeOnStartup();

      const status = service.getStatus();
      expect(status.isRunning).toBe(false);
      expect(logger.error).toHaveBeenCalled();
    });

    it("should handle partial pool priming failures", async () => {
      const mockDb = vi.mocked(require("../../database/connection.js").getDatabase());
      mockDb.select = vi.fn().mockReturnValue(mockDb);
      mockDb.orderBy = vi.fn().mockReturnValue(mockDb);
      mockDb.limit = vi
        .fn()
        .mockResolvedValueOnce([
          {
            pool_id: "pool-1",
            asset_code: "USDC",
            asset_issuer: "issuer-1",
            tvl: 1000000,
          },
          {
            pool_id: "pool-2",
            asset_code: "EURC",
            asset_issuer: "issuer-2",
            tvl: 500000,
          },
        ])
        .mockRejectedValueOnce(new Error("Pool fetch failed"));

      mockDb.where = vi.fn().mockReturnValue(mockDb);
      mockDb.sum = vi.fn().mockReturnValue(mockDb);
      mockDb.first = vi.fn().mockResolvedValue({ total_volume: 50000 });

      const redis = vi.mocked(require("../../utils/redis.js").redis);
      redis.setex = vi.fn().mockResolvedValue("OK");
      redis.zadd = vi.fn().mockResolvedValue(1);

      await service.primeOnStartup();

      const status = service.getStatus();
      expect(status.isRunning).toBe(false);
    });
  });

  describe("getTopPoolsByTVL", () => {
    it("should fetch top pools ordered by TVL", async () => {
      const mockDb = vi.mocked(require("../../database/connection.js").getDatabase());
      mockDb.select = vi.fn().mockReturnValue(mockDb);
      mockDb.orderBy = vi.fn().mockReturnValue(mockDb);
      mockDb.limit = vi.fn().mockResolvedValue([
        {
          pool_id: "pool-1",
          asset_code: "USDC",
          asset_issuer: "issuer-1",
          tvl: 1000000,
        },
        {
          pool_id: "pool-2",
          asset_code: "EURC",
          asset_issuer: "issuer-2",
          tvl: 500000,
        },
      ]);

      const pools = await (service as any).getTopPoolsByTVL(20);

      expect(Array.isArray(pools)).toBe(true);
      expect(pools.length).toBe(2);
      expect(pools[0].tvl).toBeGreaterThan(pools[1].tvl);
    });

    it("should handle empty pool results", async () => {
      const mockDb = vi.mocked(require("../../database/connection.js").getDatabase());
      mockDb.select = vi.fn().mockReturnValue(mockDb);
      mockDb.orderBy = vi.fn().mockReturnValue(mockDb);
      mockDb.limit = vi.fn().mockResolvedValue([]);

      const pools = await (service as any).getTopPoolsByTVL(20);

      expect(Array.isArray(pools)).toBe(true);
      expect(pools.length).toBe(0);
    });

    it("should handle database query errors", async () => {
      const mockDb = vi.mocked(require("../../database/connection.js").getDatabase());
      mockDb.select = vi.fn().mockReturnValue(mockDb);
      mockDb.orderBy = vi.fn().mockReturnValue(mockDb);
      mockDb.limit = vi.fn().mockRejectedValue(new Error("Query failed"));

      const logger = vi.mocked(require("../../utils/logger.js").logger);

      const pools = await (service as any).getTopPoolsByTVL(20);

      expect(Array.isArray(pools)).toBe(true);
      expect(pools.length).toBe(0);
      expect(logger.error).toHaveBeenCalled();
    });

    it("should respect limit parameter", async () => {
      const mockDb = vi.mocked(require("../../database/connection.js").getDatabase());
      mockDb.select = vi.fn().mockReturnValue(mockDb);
      mockDb.orderBy = vi.fn().mockReturnValue(mockDb);
      mockDb.limit = vi.fn().mockResolvedValue(new Array(20).fill({
        pool_id: "pool",
        asset_code: "USDC",
        asset_issuer: "issuer",
        tvl: 1000000,
      }));

      const pools = await (service as any).getTopPoolsByTVL(20);

      expect(pools.length).toBe(20);
    });
  });

  describe("primePoolData", () => {
    it("should store pool data in Redis with TTL", async () => {
      const mockDb = vi.mocked(require("../../database/connection.js").getDatabase());
      mockDb.where = vi.fn().mockReturnValue(mockDb);
      mockDb.orderBy = vi.fn().mockResolvedValue([
        { price: "100", side: "buy", amount: "10" },
        { price: "101", side: "sell", amount: "5" },
      ]);
      mockDb.sum = vi.fn().mockReturnValue(mockDb);
      mockDb.first = vi.fn().mockResolvedValue({ total_volume: 50000 });

      const redis = vi.mocked(require("../../utils/redis.js").redis);
      redis.setex = vi.fn().mockResolvedValue("OK");
      redis.zadd = vi.fn().mockResolvedValue(1);

      const pool = {
        poolId: "pool-1",
        assetCode: "USDC",
        assetIssuer: "issuer-1",
        tvl: 1000000,
      };

      await (service as any).primePoolData(pool);

      expect(redis.setex).toHaveBeenCalled();
      const call = (redis.setex as any).mock.calls[0];
      expect(call[0]).toContain("pool-1");
      expect(call[1]).toBe(300);
    });

    it("should add pool to ranking sorted set", async () => {
      const mockDb = vi.mocked(require("../../database/connection.js").getDatabase());
      mockDb.where = vi.fn().mockReturnValue(mockDb);
      mockDb.orderBy = vi.fn().mockResolvedValue([]);
      mockDb.sum = vi.fn().mockReturnValue(mockDb);
      mockDb.first = vi.fn().mockResolvedValue({ total_volume: 0 });

      const redis = vi.mocked(require("../../utils/redis.js").redis);
      redis.setex = vi.fn().mockResolvedValue("OK");
      redis.zadd = vi.fn().mockResolvedValue(1);

      const pool = {
        poolId: "pool-1",
        assetCode: "USDC",
        assetIssuer: "issuer-1",
        tvl: 1000000,
      };

      await (service as any).primePoolData(pool);

      expect(redis.zadd).toHaveBeenCalledWith("bw:dex:prime:ranking", pool.tvl, pool.poolId);
    });
  });

  describe("fetchPoolDepth", () => {
    it("should fetch and parse order book entries", async () => {
      const mockDb = vi.mocked(require("../../database/connection.js").getDatabase());
      mockDb.where = vi.fn().mockReturnValue(mockDb);
      mockDb.orderBy = vi.fn().mockResolvedValue([
        { price: "100", amount: "10", side: "buy" },
        { price: "101", amount: "5", side: "sell" },
        { price: "99", amount: "15", side: "buy" },
      ]);

      const depth = await (service as any).fetchPoolDepth("pool-1");

      expect(depth).toBeDefined();
      expect(Array.isArray(depth.bids)).toBe(true);
      expect(Array.isArray(depth.asks)).toBe(true);
      expect(depth.bids.length).toBe(2);
      expect(depth.asks.length).toBe(1);
    });

    it("should handle empty order book", async () => {
      const mockDb = vi.mocked(require("../../database/connection.js").getDatabase());
      mockDb.where = vi.fn().mockReturnValue(mockDb);
      mockDb.orderBy = vi.fn().mockResolvedValue([]);

      const depth = await (service as any).fetchPoolDepth("pool-1");

      expect(depth.bids.length).toBe(0);
      expect(depth.asks.length).toBe(0);
    });

    it("should handle database errors gracefully", async () => {
      const mockDb = vi.mocked(require("../../database/connection.js").getDatabase());
      mockDb.where = vi.fn().mockReturnValue(mockDb);
      mockDb.orderBy = vi.fn().mockRejectedValue(new Error("Query failed"));

      const logger = vi.mocked(require("../../utils/logger.js").logger);

      const depth = await (service as any).fetchPoolDepth("pool-1");

      expect(depth.bids.length).toBe(0);
      expect(depth.asks.length).toBe(0);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe("fetchPoolVolume", () => {
    it("should fetch 24h volume for a pool", async () => {
      const mockDb = vi.mocked(require("../../database/connection.js").getDatabase());
      mockDb.where = vi.fn().mockReturnValue(mockDb);
      mockDb.sum = vi.fn().mockReturnValue(mockDb);
      mockDb.first = vi.fn().mockResolvedValue({ total_volume: 1000000 });

      const volume = await (service as any).fetchPoolVolume("pool-1");

      expect(volume.volume24h).toBe(1000000);
    });

    it("should return 0 for no volume data", async () => {
      const mockDb = vi.mocked(require("../../database/connection.js").getDatabase());
      mockDb.where = vi.fn().mockReturnValue(mockDb);
      mockDb.sum = vi.fn().mockReturnValue(mockDb);
      mockDb.first = vi.fn().mockResolvedValue(null);

      const volume = await (service as any).fetchPoolVolume("pool-1");

      expect(volume.volume24h).toBe(0);
    });

    it("should handle database errors gracefully", async () => {
      const mockDb = vi.mocked(require("../../database/connection.js").getDatabase());
      mockDb.where = vi.fn().mockReturnValue(mockDb);
      mockDb.sum = vi.fn().mockReturnValue(mockDb);
      mockDb.first = vi.fn().mockRejectedValue(new Error("Query failed"));

      const logger = vi.mocked(require("../../utils/logger.js").logger);

      const volume = await (service as any).fetchPoolVolume("pool-1");

      expect(volume.volume24h).toBe(0);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe("getPrimedData", () => {
    it("should retrieve primed data from cache", async () => {
      const mockData = {
        poolId: "pool-1",
        assetCode: "USDC",
        assetIssuer: "issuer-1",
        tvl: 1000000,
        volume24h: 500000,
        depth: { bids: [], asks: [] },
        lastUpdated: new Date().toISOString(),
      };

      const redis = vi.mocked(require("../../utils/redis.js").redis);
      redis.get = vi.fn().mockResolvedValue(JSON.stringify(mockData));

      const data = await service.getPrimedData("pool-1");

      expect(data).toBeDefined();
      expect(data?.poolId).toBe("pool-1");
      expect(data?.volume24h).toBe(500000);
    });

    it("should return null if cache miss", async () => {
      const redis = vi.mocked(require("../../utils/redis.js").redis);
      redis.get = vi.fn().mockResolvedValue(null);

      const data = await service.getPrimedData("pool-1");

      expect(data).toBeNull();
    });

    it("should parse JSON correctly", async () => {
      const redis = vi.mocked(require("../../utils/redis.js").redis);
      redis.get = vi.fn().mockResolvedValue(JSON.stringify({
        poolId: "pool-2",
        tvl: 250000,
      }));

      const data = await service.getPrimedData("pool-2");

      expect(data?.poolId).toBe("pool-2");
      expect(data?.tvl).toBe(250000);
    });
  });

  describe("getStatus", () => {
    it("should return current priming status", () => {
      const status = service.getStatus();

      expect(status).toBeDefined();
      expect(status).toHaveProperty("isRunning");
      expect(status).toHaveProperty("lastPrimingTime");
      expect(status).toHaveProperty("primingCount");
      expect(typeof status.isRunning).toBe("boolean");
    });

    it("should track last priming time", async () => {
      const mockDb = vi.mocked(require("../../database/connection.js").getDatabase());
      mockDb.select = vi.fn().mockReturnValue(mockDb);
      mockDb.orderBy = vi.fn().mockReturnValue(mockDb);
      mockDb.limit = vi.fn().mockResolvedValue([]);

      const redis = vi.mocked(require("../../utils/redis.js").redis);
      redis.setex = vi.fn().mockResolvedValue("OK");
      redis.zadd = vi.fn().mockResolvedValue(1);

      await service.primeOnStartup();

      const status = service.getStatus();
      expect(status.lastPrimingTime).not.toBeNull();
    });

    it("should track priming count", async () => {
      const mockDb = vi.mocked(require("../../database/connection.js").getDatabase());
      mockDb.select = vi.fn().mockReturnValue(mockDb);
      mockDb.orderBy = vi.fn().mockReturnValue(mockDb);
      mockDb.limit = vi.fn().mockResolvedValue([
        {
          pool_id: "pool-1",
          asset_code: "USDC",
          asset_issuer: "issuer-1",
          tvl: 1000000,
        },
      ]);

      mockDb.where = vi.fn().mockReturnValue(mockDb);
      mockDb.sum = vi.fn().mockReturnValue(mockDb);
      mockDb.first = vi.fn().mockResolvedValue({ total_volume: 50000 });

      const redis = vi.mocked(require("../../utils/redis.js").redis);
      redis.setex = vi.fn().mockResolvedValue("OK");
      redis.zadd = vi.fn().mockResolvedValue(1);

      await service.primeOnStartup();

      const status = service.getStatus();
      expect(status.primingCount).toBe(1);
    });
  });

  describe("Cache TTL and expiration", () => {
    it("should use 5-minute TTL for pool data", async () => {
      const redis = vi.mocked(require("../../utils/redis.js").redis);
      redis.setex = vi.fn().mockResolvedValue("OK");
      redis.zadd = vi.fn().mockResolvedValue(1);

      const mockDb = vi.mocked(require("../../database/connection.js").getDatabase());
      mockDb.where = vi.fn().mockReturnValue(mockDb);
      mockDb.orderBy = vi.fn().mockResolvedValue([]);
      mockDb.sum = vi.fn().mockReturnValue(mockDb);
      mockDb.first = vi.fn().mockResolvedValue({ total_volume: 0 });

      const pool = {
        poolId: "pool-1",
        assetCode: "USDC",
        assetIssuer: "issuer-1",
        tvl: 1000000,
      };

      await (service as any).primePoolData(pool);

      const calls = (redis.setex as any).mock.calls;
      const ttlCall = calls.find((c: any) => c[0].includes("pool-1"));
      expect(ttlCall[1]).toBe(300);
    });
  });
});
