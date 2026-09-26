import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  mockGetAggregatedPrice: vi.fn(),
  mockGetProtocolStats: vi.fn(),
  mockGetBridgeComparisons: vi.fn(),
  mockGetTopPerformers: vi.fn(),
  mockGetAssetRankings: vi.fn(),
  mockLoggerInfo: vi.fn(),
  mockLoggerWarn: vi.fn(),
  mockLoggerError: vi.fn(),
  mockLoggerDebug: vi.fn(),
  mockCachePrimingTotal: { inc: vi.fn() },
  mockCachePrimingSuccess: { inc: vi.fn() },
  mockCachePrimingFailure: { inc: vi.fn() },
  mockCachePrimingDuration: { observe: vi.fn() },
}));

vi.mock("../../../src/utils/logger.js", () => ({
  logger: {
    info: mocks.mockLoggerInfo,
    warn: mocks.mockLoggerWarn,
    error: mocks.mockLoggerError,
    debug: mocks.mockLoggerDebug,
  },
}));

vi.mock("../../../src/config/index.js", () => ({
  SUPPORTED_ASSETS: [
    { code: "XLM", issuer: "" },
    { code: "USDC", issuer: "GA...USDC" },
    { code: "USDT", issuer: "GA...USDT" },
    { code: "BTC", issuer: "GA...BTC" },
    { code: "ETH", issuer: "GA...ETH" },
    { code: "AQUA", issuer: "GA...AQUA" },
    { code: "native", issuer: "" },
  ],
}));

vi.mock("../../../src/services/analytics.service.js", () => ({
  AnalyticsService: vi.fn(() => ({
    getProtocolStats: mocks.mockGetProtocolStats,
    getBridgeComparisons: mocks.mockGetBridgeComparisons,
    getTopPerformers: mocks.mockGetTopPerformers,
    getAssetRankings: mocks.mockGetAssetRankings,
  })),
}));

vi.mock("../../../src/services/price.service.js", () => ({
  PriceService: vi.fn(() => ({
    getAggregatedPrice: mocks.mockGetAggregatedPrice,
  })),
}));

vi.mock("../../../src/services/metrics.service.js", () => ({
  getMetricsService: vi.fn(() => ({
    cachePrimingTotal: mocks.mockCachePrimingTotal,
    cachePrimingSuccess: mocks.mockCachePrimingSuccess,
    cachePrimingFailure: mocks.mockCachePrimingFailure,
    cachePrimingDuration: mocks.mockCachePrimingDuration,
  })),
}));

describe("CachePrimerService — all_prices task error handling", () => {
  let CachePrimerService: typeof import("../../../src/services/cachePrimer.service.js").CachePrimerService;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    ({ CachePrimerService } = await import("../../../src/services/cachePrimer.service.js"));
  });

  it("logs a warning with asset code when price aggregation fails", async () => {
    mocks.mockGetProtocolStats.mockResolvedValue({});
    mocks.mockGetBridgeComparisons.mockResolvedValue({});
    mocks.mockGetTopPerformers.mockResolvedValue({});
    mocks.mockGetAssetRankings.mockResolvedValue({});
    mocks.mockGetAggregatedPrice
      .mockResolvedValueOnce({ price: 1 }) // XLM — major, succeeds
      .mockResolvedValueOnce({ price: 1 }) // USDC — major, succeeds
      .mockResolvedValueOnce({ price: 1 }) // USDT — major, succeeds
      .mockResolvedValueOnce({ price: 1 }) // BTC — major, succeeds
      .mockResolvedValueOnce({ price: 1 }) // ETH — major, succeeds
      .mockRejectedValue(new Error("price feed down")); // AQUA — other, fails

    const service = new CachePrimerService();
    await service.prime();

    expect(mocks.mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ asset: "AQUA" }),
      expect.stringContaining("cache_prime_failure"),
    );
  });

  it("increments cachePrimingFailure metric with task_name and reason when an other-asset price fails", async () => {
    mocks.mockGetProtocolStats.mockResolvedValue({});
    mocks.mockGetBridgeComparisons.mockResolvedValue({});
    mocks.mockGetTopPerformers.mockResolvedValue({});
    mocks.mockGetAssetRankings.mockResolvedValue({});
    mocks.mockGetAggregatedPrice
      .mockResolvedValue({ price: 1 })
      .mockRejectedValueOnce(new Error("timeout")); // AQUA fails

    const service = new CachePrimerService();
    await service.prime();

    expect(mocks.mockCachePrimingFailure.inc).toHaveBeenCalledWith(
      expect.objectContaining({ task_name: "all_prices", reason: expect.any(String) }),
    );
  });

  it("continues priming remaining assets after a single failure", async () => {
    mocks.mockGetProtocolStats.mockResolvedValue({});
    mocks.mockGetBridgeComparisons.mockResolvedValue({});
    mocks.mockGetTopPerformers.mockResolvedValue({});
    mocks.mockGetAssetRankings.mockResolvedValue({});
    // major assets pass, AQUA fails, a second other-asset (if any) still runs
    mocks.mockGetAggregatedPrice
      .mockResolvedValueOnce({ price: 1 })
      .mockResolvedValueOnce({ price: 1 })
      .mockResolvedValueOnce({ price: 1 })
      .mockResolvedValueOnce({ price: 1 })
      .mockResolvedValueOnce({ price: 1 })
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValue({ price: 2 });

    const service = new CachePrimerService();
    await expect(service.prime()).resolves.toBeUndefined();
  });

  it("does not throw when non-Error values are rejected", async () => {
    mocks.mockGetProtocolStats.mockResolvedValue({});
    mocks.mockGetBridgeComparisons.mockResolvedValue({});
    mocks.mockGetTopPerformers.mockResolvedValue({});
    mocks.mockGetAssetRankings.mockResolvedValue({});
    mocks.mockGetAggregatedPrice
      .mockResolvedValue({ price: 1 })
      // eslint-disable-next-line prefer-promise-reject-errors
      .mockRejectedValueOnce("string error");

    const service = new CachePrimerService();
    await expect(service.prime()).resolves.toBeUndefined();

    expect(mocks.mockCachePrimingFailure.inc).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "unknown" }),
    );
  });
});
