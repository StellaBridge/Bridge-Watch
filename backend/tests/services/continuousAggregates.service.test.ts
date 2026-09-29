import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AnalyticsService } from "../../src/services/analytics.service";
import { PriceModel } from "../../src/database/models/price.model";
import { AggregationService } from "../../src/services/aggregation.service";
import { LiquidityFragmentationService } from "../../src/services/liquidityFragmentation.service";

const { mockKnexFn, mockRawFn } = vi.hoisted(() => {
  const mockRaw = vi.fn();
  const mockKnex = vi.fn((tableName: string) => {
    const qb: any = {
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockReturnThis(),
      then: (resolve: any) => {
        if (tableName === "bridge_hourly_volume_rollup") {
          return resolve([
            {
              bucket: "2026-09-27T12:00:00.000Z",
              bridgeId: "Stellar-Ethereum Bridge",
              totalVolume: "150000",
              transactionCount: 25,
              avgAmount: "6000",
              minAmount: "100",
              maxAmount: "50000",
            },
          ]);
        }
        return resolve([]);
      },
    };
    return qb;
  });
  Object.assign(mockKnex, { raw: (sql: string) => sql });
  return { mockKnexFn: mockKnex, mockRawFn: mockRaw };
});

vi.mock("../../src/database/knex", () => ({
  default: mockKnexFn,
}));

vi.mock("../../src/database/connection.js", () => ({
  getDatabase: () => mockKnexFn,
}));

vi.mock("../../src/services/cache.service", () => ({
  CacheService: {
    generateKey: vi.fn((...args: string[]) => args.join(":")),
    getOrSet: vi.fn((_key, fn) => fn()),
    invalidateByTag: vi.fn(),
    invalidatePattern: vi.fn(),
  },
  CacheTTL: {
    ANALYTICS: 300,
  },
}));

vi.mock("../../src/utils/cache.js", () => ({
  CacheService: {
    getOrSet: vi.fn(async (_key, fetcher) => fetcher()),
    generateKey: vi.fn((ns, id) => `${ns}:${id}`),
    invalidateByTag: vi.fn(),
    invalidatePattern: vi.fn(),
  },
  CacheTTL: { ANALYTICS: 300 },
}));

vi.mock("../../src/utils/redis.js", () => ({
  redis: {
    get: vi.fn(async () => null),
    setex: vi.fn(async () => "OK"),
  },
}));

vi.mock("../../src/utils/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("Continuous Aggregates Query Optimization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("AnalyticsService - TimescaleDB Continuous Aggregates", () => {
    it("queries bridge_hourly_volume_rollup continuous aggregate and returns formatted metrics", async () => {
      const service = new AnalyticsService();
      const startDate = new Date("2026-09-20T00:00:00Z");
      const endDate = new Date("2026-09-27T00:00:00Z");

      const result = await service.getBridgeHourlyVolumeRollup(
        "Stellar-Ethereum Bridge",
        startDate,
        endDate
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        bucket: "2026-09-27T12:00:00.000Z",
        bridgeId: "Stellar-Ethereum Bridge",
        totalVolume: "150000",
        transactionCount: 25,
        avgAmount: "6000",
        minAmount: "100",
        maxAmount: "50000",
      });
    });
  });
});
