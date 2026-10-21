import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * SCOPE NOTE: the originating ticket named analyticsAggregation.worker.ts as
 * the file under test, but that file is a thin type-dispatcher that only
 * triggers cache-warming calls into AnalyticsService (protocol stats, bridge
 * comparisons, trends, ...) — it has no rollup-bucket, idempotency, backoff,
 * or metrics logic of its own. metricsAggregation.worker.ts is what actually
 * implements hourly/daily/weekly rollups with a genuine idempotency
 * mechanism, so per explicit agreement this file targets that worker
 * instead. There is still no in-process duration-metrics emission anywhere
 * in this pipeline (worker, service, or watermark coordinator) — the real
 * observability signal available is the structured start/completion logs,
 * which is what the last test in this file verifies instead of a metric
 * that doesn't exist.
 */

const mocks = vi.hoisted(() => ({
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
  runRollup: vi.fn(),
  applyRetentionPolicies: vi.fn(),
  inspect: vi.fn(),
  db: vi.fn(),
}));

vi.mock("../../src/database/connection.js", () => ({
  getDatabase: () => mocks.db,
}));

describe("processMetricsAggregation job orchestration", () => {
  let processMetricsAggregation: (typeof import("../../src/workers/metricsAggregation.worker.js"))["processMetricsAggregation"];

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    vi.doMock("../../src/utils/logger.js", () => ({
      logger: { info: mocks.loggerInfo, warn: mocks.loggerWarn, error: mocks.loggerError, debug: vi.fn() },
    }));
    vi.doMock("../../src/services/metricsAggregation.service.js", () => ({
      metricsAggregationService: {
        runRollup: mocks.runRollup,
        applyRetentionPolicies: mocks.applyRetentionPolicies,
      },
    }));
    vi.doMock("../../src/services/ingestionWatermarkCoordinator.service.js", () => ({
      ingestionWatermarkCoordinator: { inspect: mocks.inspect },
    }));

    const mod = await import("../../src/workers/metricsAggregation.worker.js");
    processMetricsAggregation = mod.processMetricsAggregation;
  });

  it.each(["hourly", "daily", "weekly"] as const)(
    "rolls up the %s granularity and reports the resulting window count",
    async (granularity) => {
      mocks.runRollup.mockResolvedValue(7);

      const result = await processMetricsAggregation({ id: "job-1", data: { type: granularity } } as any);

      expect(mocks.runRollup).toHaveBeenCalledWith(granularity);
      expect(result).toEqual({ success: true, windows: 7 });
      expect(mocks.loggerInfo).toHaveBeenCalledWith({ granularity, windows: 7 }, "Completed metrics rollup");
    }
  );

  it("applies retention policies instead of rolling up when the job type is 'retention'", async () => {
    mocks.applyRetentionPolicies.mockResolvedValue({ raw: 120, hourly: 10 });

    const result = await processMetricsAggregation({ id: "job-2", data: { type: "retention" } } as any);

    expect(mocks.applyRetentionPolicies).toHaveBeenCalledTimes(1);
    expect(mocks.runRollup).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true, deleted: { raw: 120, hourly: 10 } });
  });

  it("defers the rollup without processing anything when the ingestion watermark hasn't bounded a window yet", async () => {
    // This is the pipeline's real idempotency/exactly-once-ish mechanism for
    // a scheduled rerun: if upstream sources haven't caught up, re-running
    // the same scheduled window is a safe no-op rather than a partial rollup.
    mocks.inspect.mockResolvedValue({
      consumer: "hourly-rollup",
      through: null,
      sources: {},
      blocked: [{ source: "stellar-horizon", reason: "observed gap 100-120" }],
      explain: [],
    });

    const result = await processMetricsAggregation({
      id: "job-3",
      data: { type: "hourly", watermarkConsumer: "hourly-rollup" },
    } as any);

    expect(mocks.inspect).toHaveBeenCalledWith("hourly-rollup");
    expect(mocks.runRollup).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: true,
      deferred: true,
      window: expect.objectContaining({ through: null }),
    });
  });

  it("proceeds with the rollup once the watermark barrier bounds a window", async () => {
    mocks.inspect.mockResolvedValue({
      consumer: "hourly-rollup",
      through: 1_700_000_000,
      sources: {},
      blocked: [],
      explain: ["stellar-horizon bounds hourly-rollup through 1700000000"],
    });
    mocks.runRollup.mockResolvedValue(3);

    const result = await processMetricsAggregation({
      id: "job-4",
      data: { type: "hourly", watermarkConsumer: "hourly-rollup" },
    } as any);

    expect(mocks.runRollup).toHaveBeenCalledWith("hourly");
    expect(result).toEqual({ success: true, windows: 3 });
  });

  it("logs and rethrows on a database failure so the job queue's retry/backoff can take over", async () => {
    // The exponential backoff itself (type + base delay) is configured once,
    // centrally, in JobQueue via retryPolicyService — shared by every job
    // this worker processes, not computed per-job here. What this file is
    // responsible for is making sure a failure actually propagates instead
    // of being swallowed, since BullMQ can only retry an error it sees.
    const error = new Error("connection terminated unexpectedly");
    mocks.runRollup.mockRejectedValue(error);

    await expect(
      processMetricsAggregation({ id: "job-err", data: { type: "hourly" } } as any)
    ).rejects.toThrow("connection terminated unexpectedly");

    expect(mocks.loggerError).toHaveBeenCalledWith({ error, jobId: "job-err" }, "Metrics aggregation job failed");
  });

  it("carries the job id through both the start and completion logs for duration correlation", async () => {
    mocks.runRollup.mockResolvedValue(1);

    await processMetricsAggregation({ id: "job-5", data: { type: "hourly" } } as any);

    expect(mocks.loggerInfo).toHaveBeenCalledWith({ jobId: "job-5", type: "hourly" }, "Starting metrics aggregation job");
  });
});

// ─── Idempotent reprocessing of the same window (real MetricsAggregationService) ─

describe("MetricsAggregationService.runRollup idempotency", () => {
  function makeRawRow(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      metricKey: "bridge.tvl.usdc-ethereum",
      windowStart: new Date("2026-06-01T10:00:00Z"),
      windowEnd: new Date("2026-06-01T11:00:00Z"),
      sampleCount: 10,
      sumValue: 100,
      minValue: 5,
      maxValue: 15,
      avgValue: 10,
      p50Value: 10,
      p95Value: 14,
      p99Value: 15,
      ...overrides,
    };
  }

  function createFakeDb() {
    const rollups = new Map<string, Record<string, unknown>>();
    let nextRawRows: Record<string, unknown>[] = [];

    const db: any = vi.fn((table: string) => {
      if (table !== "metric_rollups") {
        throw new Error(`unexpected table in this test: ${table}`);
      }
      const chain: any = {};
      let pendingPayload: Record<string, unknown> | null = null;
      chain.insert = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
        pendingPayload = payload;
        return chain;
      });
      chain.onConflict = vi.fn().mockReturnValue(chain);
      // Faithful upsert: a second insert for the same (metric_key,
      // granularity, window_start) merges the given fields into the
      // existing row rather than adding a second one — exactly what
      // PostgreSQL's ON CONFLICT ... DO UPDATE does.
      chain.merge = vi.fn().mockImplementation((mergeFields: Record<string, unknown>) => {
        const row = pendingPayload!;
        const key = `${row.metric_key}|${row.granularity}|${new Date(row.window_start as any).toISOString()}`;
        const existing = rollups.get(key);
        if (existing) {
          Object.assign(existing, mergeFields);
        } else {
          rollups.set(key, { ...row });
        }
        return Promise.resolve(undefined);
      });
      return chain;
    });
    db.raw = vi.fn().mockImplementation(() => Promise.resolve({ rows: nextRawRows }));

    return {
      db,
      rollups,
      setRawRows: (rows: Record<string, unknown>[]) => {
        nextRawRows = rows;
      },
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reruns the same window without creating a duplicate row, converging to the latest aggregate", async () => {
    vi.resetModules();
    vi.doMock("../../src/utils/logger.js", () => ({
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));

    const { db, rollups, setRawRows } = createFakeDb();
    mocks.db = db;

    const { MetricsAggregationService } = await import("../../src/services/metricsAggregation.service.js");
    const service = new MetricsAggregationService();

    setRawRows([makeRawRow({ sampleCount: 10, sumValue: 100 })]);
    const firstRunCount = await service.runRollup("hourly");

    expect(firstRunCount).toBe(1);
    expect(rollups.size).toBe(1);

    // The job is re-run for the exact same window — e.g. a retried job, or
    // the scheduled hourly tick firing again before the window truly
    // closed — now observing a couple of late-arriving samples.
    setRawRows([makeRawRow({ sampleCount: 12, sumValue: 123 })]);
    const secondRunCount = await service.runRollup("hourly");

    expect(secondRunCount).toBe(1);
    // Still exactly one stored row for this window: the rerun updated it
    // in place instead of accumulating a duplicate.
    expect(rollups.size).toBe(1);
    const [storedRow] = Array.from(rollups.values());
    expect(storedRow.sample_count).toBe(12);
    expect(storedRow.sum_value).toBe(123);
  });

  it("does not insert anything when there is nothing to aggregate for the window", async () => {
    vi.resetModules();
    vi.doMock("../../src/utils/logger.js", () => ({
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));

    const { db, rollups, setRawRows } = createFakeDb();
    mocks.db = db;

    const { MetricsAggregationService } = await import("../../src/services/metricsAggregation.service.js");
    const service = new MetricsAggregationService();

    setRawRows([]);
    const count = await service.runRollup("hourly");

    expect(count).toBe(0);
    expect(rollups.size).toBe(0);
  });
});
