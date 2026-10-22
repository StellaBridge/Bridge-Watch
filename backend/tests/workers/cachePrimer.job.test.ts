import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Job } from "bullmq";
import { processCachePriming } from "../../src/workers/cachePrimer.job.js";

const mocks = vi.hoisted(() => ({
  getProtocolStats: vi.fn(),
  getBridgeComparisons: vi.fn(),
  getTopPerformers: vi.fn(),
  getAssetRankings: vi.fn(),
  getAggregatedPrice: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
  loggerDebug: vi.fn(),
  cachePrimingTotal: { inc: vi.fn() },
  cachePrimingSuccess: { inc: vi.fn() },
  cachePrimingFailure: { inc: vi.fn() },
  cachePrimingDuration: { observe: vi.fn() },
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: {
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
    error: mocks.loggerError,
    debug: mocks.loggerDebug,
  },
}));

vi.mock("../../src/config/index.js", () => ({
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

vi.mock("../../src/services/analytics.service.js", () => ({
  AnalyticsService: vi.fn(() => ({
    getProtocolStats: mocks.getProtocolStats,
    getBridgeComparisons: mocks.getBridgeComparisons,
    getTopPerformers: mocks.getTopPerformers,
    getAssetRankings: mocks.getAssetRankings,
  })),
}));

vi.mock("../../src/services/price.service.js", () => ({
  PriceService: vi.fn(() => ({
    getAggregatedPrice: mocks.getAggregatedPrice,
  })),
}));

vi.mock("../../src/services/metrics.service.js", () => ({
  getMetricsService: vi.fn(() => ({
    cachePrimingTotal: mocks.cachePrimingTotal,
    cachePrimingSuccess: mocks.cachePrimingSuccess,
    cachePrimingFailure: mocks.cachePrimingFailure,
    cachePrimingDuration: mocks.cachePrimingDuration,
  })),
}));

const MAJOR_ASSETS = ["XLM", "USDC", "USDT", "BTC", "ETH"];

describe("cachePrimer job", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProtocolStats.mockResolvedValue({});
    mocks.getBridgeComparisons.mockResolvedValue({});
    mocks.getTopPerformers.mockResolvedValue([]);
    mocks.getAssetRankings.mockResolvedValue([]);
    mocks.getAggregatedPrice.mockResolvedValue({ price: 1 });
  });

  describe("job wiring", () => {
    it("passes the requested priority to the primer service", async () => {
      const { cachePrimerService } = await import("../../src/services/cachePrimer.service.js");
      const prime = vi.spyOn(cachePrimerService, "prime").mockResolvedValue(undefined);

      const result = await processCachePriming({
        id: "job-high",
        data: { priority: "high" },
      } as unknown as Job);

      expect(prime).toHaveBeenCalledWith("high");
      expect(result).toEqual({ success: true, priority: "high" });
      prime.mockRestore();
    });

    it("forwards an undefined priority when the job carries none", async () => {
      const { cachePrimerService } = await import("../../src/services/cachePrimer.service.js");
      const prime = vi.spyOn(cachePrimerService, "prime").mockResolvedValue(undefined);

      const result = await processCachePriming({ id: "job-all", data: {} } as unknown as Job);

      expect(prime).toHaveBeenCalledWith(undefined);
      expect(result).toEqual({ success: true, priority: undefined });
      prime.mockRestore();
    });

    it("rethrows priming failures so BullMQ can retry the job", async () => {
      const { cachePrimerService } = await import("../../src/services/cachePrimer.service.js");
      const failure = new Error("redis unavailable");
      const prime = vi.spyOn(cachePrimerService, "prime").mockRejectedValue(failure);

      await expect(
        processCachePriming({ id: "job-fail", data: { priority: "low" } } as unknown as Job)
      ).rejects.toBe(failure);

      expect(mocks.loggerError).toHaveBeenCalledWith(
        expect.objectContaining({ jobId: "job-fail", error: failure }),
        "Cache priming job failed"
      );
      prime.mockRestore();
    });
  });

  describe("priming behaviour", () => {
    it("pre-warms bridge corridor comparisons and protocol stats with a forced refresh", async () => {
      const { CachePrimerService } = await import("../../src/services/cachePrimer.service.js");

      await new CachePrimerService().prime();

      expect(mocks.getBridgeComparisons).toHaveBeenCalledWith(true);
      expect(mocks.getProtocolStats).toHaveBeenCalledWith(true);
      expect(mocks.getTopPerformers).toHaveBeenCalledWith("assets", "health", 10, true);
    });

    it("pre-warms prices for every major asset and every other non-native asset", async () => {
      const { CachePrimerService } = await import("../../src/services/cachePrimer.service.js");

      await new CachePrimerService().prime();

      for (const symbol of MAJOR_ASSETS) {
        expect(mocks.getAggregatedPrice).toHaveBeenCalledWith(symbol, true);
      }
      expect(mocks.getAggregatedPrice).toHaveBeenCalledWith("AQUA", true);
      expect(mocks.getAggregatedPrice).not.toHaveBeenCalledWith("native", true);
    });

    it("runs only high-priority tasks when the HIGH filter is set", async () => {
      const { CachePrimerService, CachePriority } = await import(
        "../../src/services/cachePrimer.service.js"
      );

      await new CachePrimerService().prime(CachePriority.HIGH);

      expect(mocks.getProtocolStats).toHaveBeenCalledTimes(1);
      expect(mocks.getBridgeComparisons).toHaveBeenCalledTimes(1);
      expect(mocks.getAssetRankings).not.toHaveBeenCalled();
      expect(mocks.getAggregatedPrice).not.toHaveBeenCalledWith("AQUA", true);
    });

    it("records a failure with the database error and still runs the remaining tasks", async () => {
      const { CachePrimerService } = await import("../../src/services/cachePrimer.service.js");
      mocks.getProtocolStats.mockRejectedValue(new Error("connection terminated by database"));

      await expect(new CachePrimerService().prime()).resolves.toBeUndefined();

      expect(mocks.cachePrimingFailure.inc).toHaveBeenCalledWith({
        task_name: "protocol_stats",
        reason: "connection terminated by database",
      });
      expect(mocks.getBridgeComparisons).toHaveBeenCalledWith(true);
      expect(mocks.getAssetRankings).toHaveBeenCalledWith(true);
      expect(mocks.cachePrimingSuccess.inc).toHaveBeenCalledWith({ task_name: "bridge_comparisons" });
    });
  });
});
