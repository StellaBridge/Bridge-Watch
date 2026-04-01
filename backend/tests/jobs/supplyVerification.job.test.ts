import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  SupplyVerificationQueue,
  getSupplyVerificationQueue,
  initSupplyVerificationJob,
  type SupplyVerificationJobData,
  type SupplyVerificationResult,
} from "../../src/jobs/supplyVerification.job.js";
import { BridgeService } from "../../src/services/bridge.service.js";
import { AlertService } from "../../src/services/alert.service.js";
import { getMetricsService } from "../../src/services/metrics.service.js";
import { SUPPORTED_ASSETS } from "../../src/config/index.js";
import { getDatabase } from "../../src/database/connection.js";
import { logger } from "../../src/utils/logger.js";

// Mock logger
vi.mock("../../src/utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock config
vi.mock("../../src/config/index.js", () => ({
  config: {
    REDIS_HOST: "localhost",
    REDIS_PORT: 6379,
    REDIS_PASSWORD: "",
    RETRY_MAX: 3,
    BRIDGE_SUPPLY_MISMATCH_THRESHOLD: 0.1,
  },
  SUPPORTED_ASSETS: [
    { code: "XLM", issuer: "native" },
    { code: "USDC", issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN" },
    { code: "EURC", issuer: "GDQOE23CFSUMSVZZ4YRVXGW7PCFNIAHLMRAHDE4Z32DIBQGH4KZZK2KZ" },
  ],
}));

// Mock database
vi.mock("../../src/database/connection.js", () => ({
  getDatabase: vi.fn(() => ({
    insert: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue(null),
  })),
}));

describe("SupplyVerificationQueue", () => {
  let queue: SupplyVerificationQueue;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset singleton instance for each test
    (SupplyVerificationQueue as any).instance = undefined;
  });

  afterEach(async () => {
    if (queue) {
      await queue.stop();
    }
  });

  describe("Singleton Pattern", () => {
    it("returns the same instance on multiple calls", () => {
      const instance1 = getSupplyVerificationQueue();
      const instance2 = getSupplyVerificationQueue();
      expect(instance1).toBe(instance2);
    });

    it("creates a new instance if none exists", () => {
      (SupplyVerificationQueue as any).instance = undefined;
      const instance = getSupplyVerificationQueue();
      expect(instance).toBeDefined();
    });
  });

  describe("Queue Initialization", () => {
    it("initializes queue with correct configuration", () => {
      queue = getSupplyVerificationQueue();
      expect(queue.queue).toBeDefined();
      expect(queue.queue.name).toBe("supply-verification");
    });

    it("initializes worker only once", () => {
      queue = getSupplyVerificationQueue();
      queue.initWorker();
      const firstWorker = queue.worker;
      
      // Second init should not create new worker
      queue.initWorker();
      expect(queue.worker).toBe(firstWorker);
    });
  });

  describe("Add Verification Job", () => {
    beforeEach(() => {
      queue = getSupplyVerificationQueue();
    });

    it("adds a single verification job with normal priority", async () => {
      const addSpy = vi.spyOn(queue.queue, "add").mockResolvedValue({
        id: "1",
        name: "verify-supply",
        data: { assetCode: "USDC", priority: "normal" },
      } as any);

      await queue.addVerificationJob("USDC", "normal");

      expect(addSpy).toHaveBeenCalledWith(
        "verify-supply",
        { assetCode: "USDC", priority: "normal", isBatch: false },
        { priority: 10 }
      );
    });

    it("adds a single verification job with high priority", async () => {
      const addSpy = vi.spyOn(queue.queue, "add").mockResolvedValue({
        id: "2",
        name: "verify-supply",
        data: { assetCode: "EURC", priority: "high" },
      } as any);

      await queue.addVerificationJob("EURC", "high");

      expect(addSpy).toHaveBeenCalledWith(
        "verify-supply",
        { assetCode: "EURC", priority: "high", isBatch: false },
        { priority: 5 }
      );
    });

    it("adds batch verification jobs for all non-native assets", async () => {
      const addSpy = vi.spyOn(queue.queue, "add").mockResolvedValue({
        id: "3",
        name: "verify-supply",
      } as any);

      await queue.addBatchVerificationJobs();

      // Should skip XLM/native, so only USDC and EURC
      expect(addSpy).toHaveBeenCalledTimes(2);
      expect(addSpy).toHaveBeenCalledWith(
        "verify-supply",
        expect.objectContaining({ assetCode: "USDC", isBatch: true }),
        expect.anything()
      );
      expect(addSpy).toHaveBeenCalledWith(
        "verify-supply",
        expect.objectContaining({ assetCode: "EURC", isBatch: true }),
        expect.anything()
      );
    });
  });

  describe("Schedule Periodic Verification", () => {
    beforeEach(() => {
      queue = getSupplyVerificationQueue();
    });

    it("schedules periodic verification with default cron pattern", async () => {
      const addSpy = vi.spyOn(queue.queue, "add").mockResolvedValue({
        id: "scheduled-1",
      } as any);

      await queue.schedulePeriodicVerification();

      expect(addSpy).toHaveBeenCalledWith(
        "verify-supply-batch",
        { isBatch: true },
        expect.objectContaining({
          repeat: { pattern: "*/5 * * * *" },
        })
      );
    });

    it("schedules periodic verification with custom cron pattern", async () => {
      const addSpy = vi.spyOn(queue.queue, "add").mockResolvedValue({
        id: "scheduled-2",
      } as any);

      await queue.schedulePeriodicVerification("*/10 * * * *");

      expect(addSpy).toHaveBeenCalledWith(
        "verify-supply-batch",
        { isBatch: true },
        expect.objectContaining({
          repeat: { pattern: "*/10 * * * *" },
        })
      );
    });
  });

  describe("Queue Statistics", () => {
    beforeEach(() => {
      queue = getSupplyVerificationQueue();
    });

    it("returns queue job counts", async () => {
      const mockCounts = {
        waiting: 5,
        active: 2,
        completed: 100,
        failed: 3,
        delayed: 1,
      };

      vi.spyOn(queue.queue, "getJobCounts").mockResolvedValue(mockCounts as any);

      const stats = await queue.getQueueStats();

      expect(stats).toEqual(mockCounts);
      expect(queue.queue.getJobCounts).toHaveBeenCalled();
    });

    it("returns failed jobs", async () => {
      const mockFailedJobs = [
        { id: "failed-1", name: "verify-supply", failedReason: "timeout" },
        { id: "failed-2", name: "verify-supply", failedReason: "api_error" },
      ];

      vi.spyOn(queue.queue, "getFailed").mockResolvedValue(mockFailedJobs as any);

      const failedJobs = await queue.getFailedJobs(100);

      expect(failedJobs).toHaveLength(2);
      expect(queue.queue.getFailed).toHaveBeenCalledWith(0, 100);
    });
  });

  describe("Stop Queue", () => {
    it("stops worker and closes queue", async () => {
      queue = getSupplyVerificationQueue();
      queue.initWorker();

      const closeWorkerSpy = vi.fn().mockResolvedValue(undefined);
      const closeQueueSpy = vi.spyOn(queue.queue, "close").mockResolvedValue(undefined);
      
      (queue as any).worker = { close: closeWorkerSpy };

      await queue.stop();

      expect(closeWorkerSpy).toHaveBeenCalled();
      expect(closeQueueSpy).toHaveBeenCalled();
      expect((queue as any).worker).toBeNull();
    });
  });
});

describe("Supply Verification Job Processing", () => {
  let queue: SupplyVerificationQueue;

  beforeEach(() => {
    vi.clearAllMocks();
    (SupplyVerificationQueue as any).instance = undefined;
    queue = getSupplyVerificationQueue();
  });

  afterEach(async () => {
    await queue.stop();
  });

  it("processes single asset verification successfully", async () => {
    const mockVerificationResult = {
      assetCode: "USDC",
      stellarSupply: 1000000,
      ethereumReserves: 1000000,
      mismatchPercentage: 0,
      isFlagged: false,
      errorStatus: null,
      match: true,
    };

    vi.spyOn(BridgeService.prototype, "verifySupply").mockResolvedValue(mockVerificationResult as any);
    vi.spyOn(queue as any, "persistResult").mockResolvedValue(undefined);

    const mockJob = {
      id: "test-1",
      name: "verify-supply",
      data: { assetCode: "USDC", priority: "normal" },
      attemptsMade: 0,
      processedOn: Date.now(),
    } as any;

    const result = await (queue as any).processSingleJob(mockJob, Date.now());

    expect(result.success).toBe(true);
    expect(result.assetCode).toBe("USDC");
    expect(result.result).toBeDefined();
    expect(result.result?.isValid).toBe(true);
    expect(BridgeService.prototype.verifySupply).toHaveBeenCalledWith("USDC");
  });

  it("handles verification with supply mismatch", async () => {
    const mockVerificationResult = {
      assetCode: "USDC",
      stellarSupply: 1050000,
      ethereumReserves: 1000000,
      mismatchPercentage: 5.0,
      isFlagged: true,
      errorStatus: null,
      match: false,
    };

    vi.spyOn(BridgeService.prototype, "verifySupply").mockResolvedValue(mockVerificationResult as any);
    vi.spyOn(queue as any, "persistResult").mockResolvedValue(undefined);
    const triggerAlertSpy = vi.spyOn(queue as any, "triggerSupplyMismatchAlert").mockResolvedValue(undefined);

    const mockJob = {
      id: "test-2",
      name: "verify-supply",
      data: { assetCode: "USDC", priority: "normal" },
      attemptsMade: 0,
      processedOn: Date.now(),
    } as any;

    const result = await (queue as any).processSingleJob(mockJob, Date.now());

    expect(result.success).toBe(true);
    expect(result.result?.isValid).toBe(false);
    expect(result.result?.mismatchPercentage).toBe(5.0);
    expect(triggerAlertSpy).toHaveBeenCalledWith("USDC", mockVerificationResult);
  });

  it("handles verification failure and retries", async () => {
    const error = new Error("API timeout");
    vi.spyOn(BridgeService.prototype, "verifySupply").mockRejectedValue(error);
    vi.spyOn(queue as any, "persistResult").mockResolvedValue(undefined);

    const mockJob = {
      id: "test-3",
      name: "verify-supply",
      data: { assetCode: "USDC", priority: "normal" },
      attemptsMade: 1,
      processedOn: Date.now(),
    } as any;

    await expect((queue as any).processSingleJob(mockJob, Date.now())).rejects.toThrow("API timeout");
    expect(queue as any).persistResulttoHaveBeenCalledWith(
      expect.objectContaining({
        assetCode: "USDC",
        isValid: false,
        errorStatus: "API timeout",
      })
    );
  });

  it("processes batch verification for all assets", async () => {
    vi.spyOn(BridgeService.prototype, "verifySupply")
      .mockResolvedValueOnce({
        assetCode: "USDC",
        stellarSupply: 1000000,
        ethereumReserves: 1000000,
        mismatchPercentage: 0,
        isFlagged: false,
        errorStatus: null,
        match: true,
      } as any)
      .mockResolvedValueOnce({
        assetCode: "EURC",
        stellarSupply: 500000,
        ethereumReserves: 500000,
        mismatchPercentage: 0,
        isFlagged: false,
        errorStatus: null,
        match: true,
      } as any);

    vi.spyOn(queue as any, "persistResult").mockResolvedValue(undefined);

    const mockJob = {
      id: "batch-1",
      name: "verify-supply-batch",
      data: { isBatch: true },
      attemptsMade: 0,
      processedOn: Date.now(),
    } as any;

    const results = await (queue as any).processBatchJob(mockJob, Date.now());

    expect(results).toHaveLength(2);
    expect(results.every((r: any) => r.success)).toBe(true);
  });
});

describe("Alert Triggering", () => {
  let queue: SupplyVerificationQueue;

  beforeEach(() => {
    vi.clearAllMocks();
    (SupplyVerificationQueue as any).instance = undefined;
    queue = getSupplyVerificationQueue();
  });

  afterEach(async () => {
    await queue.stop();
  });

  it("triggers alert on repeated job failures", async () => {
    const mockJob = {
      id: "failed-job",
      data: { assetCode: "USDC" },
      attemptsMade: 3,
    } as any;

    const error = new Error("Max retries exceeded");
    const evaluateSpy = vi.spyOn(AlertService.prototype, "evaluateAsset").mockResolvedValue([]);

    await (queue as any).triggerFailureAlert(mockJob, error);

    expect(evaluateSpy).toHaveBeenCalledWith({
      assetCode: "USDC",
      metrics: expect.objectContaining({
        verification_failure: 1,
        consecutive_failures: 3,
      }),
    });
  });

  it("triggers alert on supply mismatch", async () => {
    const verificationResult = {
      assetCode: "USDC",
      stellarSupply: 1050000,
      ethereumReserves: 1000000,
      mismatchPercentage: 5.0,
      isFlagged: true,
      errorStatus: null,
      match: false,
    };

    const evaluateSpy = vi.spyOn(AlertService.prototype, "evaluateAsset").mockResolvedValue([]);

    await (queue as any).triggerSupplyMismatchAlert("USDC", verificationResult as any);

    expect(evaluateSpy).toHaveBeenCalledWith({
      assetCode: "USDC",
      metrics: expect.objectContaining({
        supply_mismatch_percentage: 5.0,
        stellar_supply: 1050000,
        ethereum_reserves: 1000000,
      }),
    });
  });
});

describe("Result Persistence", () => {
  let queue: SupplyVerificationQueue;

  beforeEach(() => {
    vi.clearAllMocks();
    (SupplyVerificationQueue as any).instance = undefined;
    queue = getSupplyVerificationQueue();
  });

  afterEach(async () => {
    await queue.stop();
  });

  it("persists verification result to database", async () => {
    const mockDb = {
      insert: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue({ bridge_id: "bridge-usdc" }),
    };
    (getDatabase as any).mockReturnValue(mockDb);

    const result: SupplyVerificationResult = {
      assetCode: "USDC",
      stellarSupply: 1000000,
      ethereumReserves: 1000000,
      mismatchPercentage: 0,
      isValid: true,
      verifiedAt: new Date(),
      jobId: "test-job-1",
    };

    await (queue as any).persistResult(result);

    expect(mockDb.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        bridge_id: "bridge-usdc",
        is_valid: true,
        job_id: "test-job-1",
        metadata: expect.stringContaining("USDC"),
      })
    );
  });

  it("uses default bridge ID if operator not found", async () => {
    const mockDb = {
      insert: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue(null),
    };
    (getDatabase as any).mockReturnValue(mockDb);

    const result: SupplyVerificationResult = {
      assetCode: "EURC",
      stellarSupply: 500000,
      ethereumReserves: 500000,
      mismatchPercentage: 0,
      isValid: true,
      verifiedAt: new Date(),
    };

    await (queue as any).persistResult(result);

    expect(mockDb.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        bridge_id: "supply-EURC",
      })
    );
  });

  it("handles database errors gracefully", async () => {
    const mockDb = {
      insert: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      first: vi.fn().mockRejectedValue(new Error("DB connection failed")),
    };
    (getDatabase as any).mockReturnValue(mockDb);

    const result: SupplyVerificationResult = {
      assetCode: "USDC",
      stellarSupply: 1000000,
      ethereumReserves: 1000000,
      mismatchPercentage: 0,
      isValid: true,
      verifiedAt: new Date(),
    };

    // Should not throw
    await expect((queue as any).persistResult(result)).resolves.not.toThrow();
  });
});

describe("Metrics Collection", () => {
  let queue: SupplyVerificationQueue;

  beforeEach(() => {
    vi.clearAllMocks();
    (SupplyVerificationQueue as any).instance = undefined;
    queue = getSupplyVerificationQueue();
  });

  afterEach(async () => {
    await queue.stop();
  });

  it("records successful job metrics", () => {
    const metricsService = getMetricsService();
    const recordSpy = vi.spyOn(metricsService, "recordQueueJob");

    // Simulate worker completion event
    const mockJob = {
      id: "test-metrics-1",
      name: "verify-supply",
      data: { assetCode: "USDC" },
      processedOn: Date.now() - 1000,
    } as any;

    (queue.worker as any)?.emit("completed", mockJob, { success: true, assetCode: "USDC" });

    expect(recordSpy).toHaveBeenCalledWith(
      "supply-verification",
      "verify-supply",
      expect.any(Number),
      true
    );
  });

  it("records failed job metrics", () => {
    const metricsService = getMetricsService();
    const recordSpy = vi.spyOn(metricsService, "recordQueueJob");

    const mockJob = {
      id: "test-metrics-2",
      name: "verify-supply",
      data: { assetCode: "USDC" },
      processedOn: Date.now() - 1000,
      attemptsMade: 3,
    } as any;

    const error = new Error("Test failure");

    (queue.worker as any)?.emit("failed", mockJob, error);

    expect(recordSpy).toHaveBeenCalledWith(
      "supply-verification",
      "verify-supply",
      expect.any(Number),
      false,
      "Test failure"
    );
  });
});

describe("Initialization Function", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (SupplyVerificationQueue as any).instance = undefined;
  });

  it("initializes supply verification job system", async () => {
    const queue = getSupplyVerificationQueue();
    const initWorkerSpy = vi.spyOn(queue, "initWorker");
    const scheduleSpy = vi.spyOn(queue, "schedulePeriodicVerification");

    await initSupplyVerificationJob();

    expect(initWorkerSpy).toHaveBeenCalled();
    expect(scheduleSpy).toHaveBeenCalledWith("*/5 * * * *");
  });
});
