import { describe, it, expect, vi, beforeEach } from "vitest";
import { ScoreCalculator } from "../../src/utils/scoreCalculator.js";

const mocks = vi.hoisted(() => ({
  loggerInfo: vi.fn(),
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
  loggerDebug: vi.fn(),
  computeAllHealthScores: vi.fn(),
  getAggregatedLiquidity: vi.fn(),
  getAggregatedPrice: vi.fn(),
  getAllBridgeStatuses: vi.fn(),
  verifySupply: vi.fn(),
  insert: vi.fn(),
  getLatest: vi.fn(),
  scheduleAlertEvaluation: vi.fn(),
}));

describe("processHealthCalculation job orchestration", () => {
  let processHealthCalculation: (typeof import("../../src/workers/healthCalculation.job.js"))["processHealthCalculation"];

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    vi.doMock("../../src/utils/logger.js", () => ({
      logger: {
        info: mocks.loggerInfo,
        error: mocks.loggerError,
        warn: mocks.loggerWarn,
        debug: mocks.loggerDebug,
      },
    }));
    vi.doMock("../../src/services/health.service.js", () => ({
      HealthService: class {
        computeAllHealthScores = mocks.computeAllHealthScores;
      },
    }));

    const mod = await import("../../src/workers/healthCalculation.job.js");
    processHealthCalculation = mod.processHealthCalculation;
  });

  it("logs the job start with the job id", async () => {
    mocks.computeAllHealthScores.mockResolvedValue([]);

    await processHealthCalculation({ id: "job-42" } as any);

    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      { jobId: "job-42" },
      "Starting health score calculation job"
    );
  });

  it("delegates to HealthService.computeAllHealthScores and logs the resulting count", async () => {
    mocks.computeAllHealthScores.mockResolvedValue([{ symbol: "USDC" }, { symbol: "EURC" }]);

    await processHealthCalculation({ id: "job-1" } as any);

    expect(mocks.computeAllHealthScores).toHaveBeenCalledTimes(1);
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      { count: 2 },
      "Completed health score calculations for all assets"
    );
  });

  it("logs and rethrows when computeAllHealthScores fails", async () => {
    const error = new Error("db unavailable");
    mocks.computeAllHealthScores.mockRejectedValue(error);

    await expect(processHealthCalculation({ id: "job-err" } as any)).rejects.toThrow(
      "db unavailable"
    );
    expect(mocks.loggerError).toHaveBeenCalledWith(
      { error },
      "Failed to compute all health scores in background job"
    );
  });
});

describe("ScoreCalculator component and composite scoring", () => {
  describe("component scores at 0% and 100%", () => {
    it("scores zero liquidity as 0 and deep balanced liquidity as 100", () => {
      expect(ScoreCalculator.calculateLiquidityScore(0, 0, 0)).toBe(0);
      expect(ScoreCalculator.calculateLiquidityScore(1_000_000, 500, 500)).toBe(100);
    });

    it("penalizes one-sided order book depth even at high liquidity", () => {
      const balanced = ScoreCalculator.calculateLiquidityScore(1_000_000, 500, 500);
      const imbalanced = ScoreCalculator.calculateLiquidityScore(1_000_000, 0, 1000);
      expect(imbalanced).toBeLessThan(balanced);
      expect(imbalanced).toBe(80);
    });

    it("scores zero price deviation as 100 and large deviation as 0", () => {
      expect(ScoreCalculator.calculatePriceStabilityScore(0)).toBe(100);
      expect(ScoreCalculator.calculatePriceStabilityScore(0.1)).toBe(0);
    });

    it("scores zero reserve mismatch as 100 and full mismatch as 0", () => {
      expect(ScoreCalculator.calculateReserveBackingScore(0)).toBe(100);
      expect(ScoreCalculator.calculateReserveBackingScore(1)).toBe(0);
    });

    it("scores flat/zero volume as 0 and a strong surge as the capped 100", () => {
      expect(ScoreCalculator.calculateVolumeTrendScore(0, 0)).toBe(0);
      expect(ScoreCalculator.calculateVolumeTrendScore(20, 7)).toBe(100);
    });
  });

  describe("bridge status transitions (healthy -> degraded -> down)", () => {
    it("maps healthy, degraded, and down to descending uptime scores", () => {
      expect(ScoreCalculator.calculateBridgeUptimeScore("healthy")).toBe(100);
      expect(ScoreCalculator.calculateBridgeUptimeScore("degraded")).toBe(50);
      expect(ScoreCalculator.calculateBridgeUptimeScore("down")).toBe(0);
      expect(ScoreCalculator.calculateBridgeUptimeScore("unknown")).toBe(0);
    });
  });

  describe("weighted composite score", () => {
    it("returns 100 when every component is at its maximum", () => {
      const overall = ScoreCalculator.calculateCompositeScore({
        liquidityDepth: 100,
        priceStability: 100,
        bridgeUptime: 100,
        reserveBacking: 100,
        volumeTrend: 100,
      });
      expect(overall).toBe(100);
    });

    it("returns 0 when every component is at its minimum", () => {
      const overall = ScoreCalculator.calculateCompositeScore({
        liquidityDepth: 0,
        priceStability: 0,
        bridgeUptime: 0,
        reserveBacking: 0,
        volumeTrend: 0,
      });
      expect(overall).toBe(0);
    });

    it("combines mixed component scores using the configured weights", () => {
      const overall = ScoreCalculator.calculateCompositeScore({
        liquidityDepth: 80,
        priceStability: 100,
        bridgeUptime: 50,
        reserveBacking: 90,
        volumeTrend: 70,
      });
      // 80*0.25 + 100*0.25 + 50*0.20 + 90*0.20 + 70*0.10 = 80
      expect(overall).toBe(80);
    });
  });
});

describe("processHealthCalculation integration (persistence & trend)", () => {
  let processHealthCalculation: (typeof import("../../src/workers/healthCalculation.job.js"))["processHealthCalculation"];
  let HealthService: (typeof import("../../src/services/health.service.js"))["HealthService"];

  const SUPPORTED_ASSETS = [
    { code: "USDC", issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN" },
    { code: "XLM", issuer: "native" },
  ];

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    vi.doMock("../../src/utils/logger.js", () => ({
      logger: {
        info: mocks.loggerInfo,
        error: mocks.loggerError,
        warn: mocks.loggerWarn,
        debug: mocks.loggerDebug,
      },
    }));
    vi.doMock("../../src/config/index.js", () => ({
      config: {
        HEALTH_WEIGHT_LIQUIDITY: 0.25,
        HEALTH_WEIGHT_PRICE: 0.25,
        HEALTH_WEIGHT_BRIDGE: 0.2,
        HEALTH_WEIGHT_RESERVES: 0.2,
        HEALTH_WEIGHT_VOLUME: 0.1,
      },
      SUPPORTED_ASSETS,
    }));
    vi.doMock("../../src/services/price.service.js", () => ({
      PriceService: class {
        getAggregatedPrice = mocks.getAggregatedPrice;
      },
    }));
    vi.doMock("../../src/services/liquidity.service.js", () => ({
      LiquidityService: class {
        getAggregatedLiquidity = mocks.getAggregatedLiquidity;
      },
    }));
    vi.doMock("../../src/services/bridge.service.js", () => ({
      BridgeService: class {
        getAllBridgeStatuses = mocks.getAllBridgeStatuses;
        verifySupply = mocks.verifySupply;
      },
    }));
    vi.doMock("../../src/services/alert.service.js", () => ({
      AlertService: class {},
    }));
    vi.doMock("../../src/database/models/healthScore.model.js", () => ({
      HealthScoreModel: class {
        insert = mocks.insert;
        getLatest = mocks.getLatest;
      },
    }));
    vi.doMock("../../src/workers/alertEvaluation.worker.js", () => ({
      scheduleAlertEvaluation: mocks.scheduleAlertEvaluation,
    }));

    mocks.getAggregatedLiquidity.mockResolvedValue({
      totalLiquidity: 1_000_000,
      sources: [{ bidDepth: 500, askDepth: 500 }],
    });
    mocks.getAggregatedPrice.mockResolvedValue({ deviation: 0 });
    mocks.getAllBridgeStatuses.mockResolvedValue({
      bridges: [{ name: "USDC Bridge", status: "healthy" }],
    });
    mocks.verifySupply.mockResolvedValue({ mismatchPercentage: 0 });
    mocks.getLatest.mockResolvedValue(undefined);
    mocks.insert.mockResolvedValue(undefined);
    mocks.scheduleAlertEvaluation.mockResolvedValue(undefined);

    const mod = await import("../../src/workers/healthCalculation.job.js");
    processHealthCalculation = mod.processHealthCalculation;
    HealthService = (await import("../../src/services/health.service.js")).HealthService;
  });

  it("persists one health score timeline record per supported asset", async () => {
    await processHealthCalculation({ id: "job-1" } as any);

    expect(mocks.insert).toHaveBeenCalledTimes(SUPPORTED_ASSETS.length);
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        time: expect.any(Date),
        symbol: "USDC",
        overall_score: expect.any(Number),
        liquidity_depth_score: expect.any(Number),
        price_stability_score: expect.any(Number),
        bridge_uptime_score: expect.any(Number),
        reserve_backing_score: expect.any(Number),
        volume_trend_score: expect.any(Number),
      })
    );
  });

  it("computes the weighted composite score for an asset's health signals", async () => {
    const healthService = new HealthService();

    const score = await healthService.getHealthScore("USDC");

    // liquidityDepth=100, priceStability=100, bridgeUptime=100, reserveBacking=100, volumeTrend=0
    // 100*0.25 + 100*0.25 + 100*0.20 + 100*0.20 + 0*0.10 = 90
    expect(score?.overallScore).toBe(90);
    expect(score?.factors).toMatchObject({
      liquidityDepth: 100,
      priceStability: 100,
      bridgeUptime: 100,
      reserveBacking: 100,
      volumeTrend: 0,
    });
  });

  it("marks the trend as stable when there is no previous score", async () => {
    mocks.getLatest.mockResolvedValue(undefined);
    const healthService = new HealthService();

    const score = await healthService.getHealthScore("USDC");

    expect(score?.trend).toBe("stable");
  });

  it("marks the trend as improving when the score rises above the previous reading", async () => {
    mocks.getLatest.mockResolvedValue({ overall_score: 10 });
    const healthService = new HealthService();

    const score = await healthService.getHealthScore("USDC");

    expect(score?.overallScore).toBeGreaterThan(10);
    expect(score?.trend).toBe("improving");
  });

  it("marks the trend as deteriorating when the score falls below the previous reading", async () => {
    mocks.getLatest.mockResolvedValue({ overall_score: 95 });
    mocks.getAggregatedLiquidity.mockResolvedValue({ totalLiquidity: 0, sources: [] });
    mocks.getAggregatedPrice.mockResolvedValue({ deviation: 0.1 });
    mocks.getAllBridgeStatuses.mockResolvedValue({ bridges: [{ name: "USDC Bridge", status: "down" }] });
    const healthService = new HealthService();

    const score = await healthService.getHealthScore("USDC");

    expect(score?.overallScore).toBeLessThan(95);
    expect(score?.trend).toBe("deteriorating");
  });

  it("schedules an alert evaluation when the health score drops by more than 10 points", async () => {
    mocks.getLatest.mockResolvedValue({ overall_score: 95 });
    mocks.getAggregatedLiquidity.mockResolvedValue({ totalLiquidity: 0, sources: [] });
    mocks.getAggregatedPrice.mockResolvedValue({ deviation: 0.1 });
    mocks.getAllBridgeStatuses.mockResolvedValue({ bridges: [{ name: "USDC Bridge", status: "down" }] });

    await processHealthCalculation({ id: "job-1" } as any);

    expect(mocks.scheduleAlertEvaluation).toHaveBeenCalled();
    const [[snapshots]] = mocks.scheduleAlertEvaluation.mock.calls;
    expect(snapshots[0]).toMatchObject({ assetCode: "USDC" });
  });

  it("does not schedule an alert evaluation when the health score holds steady", async () => {
    mocks.getLatest.mockResolvedValue({ overall_score: 90 });

    await processHealthCalculation({ id: "job-1" } as any);

    expect(mocks.scheduleAlertEvaluation).not.toHaveBeenCalled();
  });
});
