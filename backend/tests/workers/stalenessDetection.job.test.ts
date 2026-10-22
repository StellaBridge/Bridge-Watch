import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
  runScheduledCheck: vi.fn(),
}));

const { tableData, mockKnex } = vi.hoisted(() => {
  const tableData = new Map<string, Array<Record<string, unknown>>>();
  const createBuilder = (rows: Array<Record<string, unknown>>) => ({
    select: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockImplementation((limit: number) => rows.slice(0, limit)),
  });
  const mockKnex = (table: string) => createBuilder(tableData.get(table) ?? []);
  return { tableData, mockKnex };
});

vi.mock("../../src/database/connection.js", () => ({
  getDatabase: () => mockKnex,
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: {
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
    error: mocks.loggerError,
    debug: vi.fn(),
  },
}));

// Two rules with deliberately different thresholds, standing in for a
// "high-traffic" and a "low-traffic" bridge feed: the module itself has no
// notion of a bridge or a traffic tier (see the file-level note below), but
// each monitored source does carry its own independently configured
// warn/critical thresholds, which is the real mechanism behind "variable
// threshold by tier."
vi.mock("../../src/config/stalenessRules.js", () => ({
  STALENESS_RULES: [
    {
      key: "bridge_a_high_traffic",
      label: "Bridge A telemetry (high traffic)",
      description: "Frequent ticks expected from a busy bridge.",
      table: "bridge_a_ticks",
      timeColumn: "time",
      sourceType: "source",
      expectedIntervalMs: 30_000,
      warnAfterMs: 120_000, // 2 minutes
      criticalAfterMs: 300_000, // 5 minutes
    },
    {
      key: "bridge_b_low_traffic",
      label: "Bridge B telemetry (low traffic)",
      description: "Infrequent ticks expected from a quiet bridge.",
      table: "bridge_b_ticks",
      timeColumn: "time",
      sourceType: "source",
      expectedIntervalMs: 60 * 60 * 1000,
      warnAfterMs: 36 * 60 * 60 * 1000, // 36 hours
      criticalAfterMs: 48 * 60 * 60 * 1000, // 48 hours
    },
  ],
}));

const NOW = new Date("2026-06-01T00:00:00Z");

// ─── Job orchestration (StalenessDetectionService mocked wholesale) ───────

describe("processStalenessDetection job orchestration", () => {
  let processStalenessDetection: (typeof import("../../src/workers/stalenessDetection.job.js"))["processStalenessDetection"];

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    vi.doMock("../../src/services/stalenessDetection.service.js", () => ({
      stalenessDetectionService: { runScheduledCheck: mocks.runScheduledCheck },
    }));

    const mod = await import("../../src/workers/stalenessDetection.job.js");
    processStalenessDetection = mod.processStalenessDetection;
  });

  it("logs the job start with the job id", async () => {
    mocks.runScheduledCheck.mockResolvedValue({
      snapshot: { status: "fresh", timestamp: NOW.toISOString(), sources: [] },
      alerts: [],
    });

    await processStalenessDetection({ id: "job-1" } as any);

    expect(mocks.loggerInfo).toHaveBeenCalledWith({ jobId: "job-1" }, "Starting staleness detection job");
  });

  it("logs completion with the resulting status and alert count", async () => {
    mocks.runScheduledCheck.mockResolvedValue({
      snapshot: { status: "stale", timestamp: NOW.toISOString(), sources: [] },
      alerts: [{ key: "bridge_a_high_traffic" }, { key: "bridge_b_low_traffic" }],
    });

    await processStalenessDetection({ id: "job-2" } as any);

    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      { jobId: "job-2", status: "stale", alerts: 2 },
      "Staleness detection job completed"
    );
  });

  it("logs and rethrows when the scheduled check fails", async () => {
    const error = new Error("database unreachable");
    mocks.runScheduledCheck.mockRejectedValue(error);

    await expect(processStalenessDetection({ id: "job-err" } as any)).rejects.toThrow(
      "database unreachable"
    );
    expect(mocks.loggerError).toHaveBeenCalledWith(
      { jobId: "job-err", error },
      "Staleness detection job failed"
    );
  });
});

// ─── Integration: real StalenessDetectionService + real job ───────────────

describe("processStalenessDetection integration", () => {
  let processStalenessDetection: (typeof import("../../src/workers/stalenessDetection.job.js"))["processStalenessDetection"];

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    tableData.set("bridge_a_ticks", []);
    // Fresh by default so single-source tests below aren't polluted by an
    // unrelated "missing" alert from the other configured rule; tests that
    // care about bridge_b override this explicitly.
    tableData.set("bridge_b_ticks", [{ time: new Date(NOW.getTime()) }]);
    mocks.loggerInfo.mockClear();
    mocks.loggerWarn.mockClear();
    mocks.loggerError.mockClear();

    processStalenessDetection = (await import("../../src/workers/stalenessDetection.job.js"))
      .processStalenessDetection;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("triggers staleness once a source's last-seen timestamp exceeds its critical silence threshold", async () => {
    // Last tick for the high-traffic bridge was 10 minutes ago — well past
    // its 5-minute critical threshold.
    tableData.set("bridge_a_ticks", [{ time: new Date(NOW.getTime() - 10 * 60_000) }]);

    await processStalenessDetection({ id: "job-1" } as any);

    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({ status: "stale" }),
      "Staleness detection job completed"
    );
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ alertCount: 1 }),
      "Staleness checks detected issues"
    );
  });

  it("applies each source's own configured threshold rather than one global silence window", async () => {
    // The exact same 40-minute silence is a critical breach for the
    // high-traffic bridge (5m threshold) but still well within the
    // low-traffic bridge's 36-hour warning threshold.
    const fortyMinutesAgo = new Date(NOW.getTime() - 40 * 60_000);
    tableData.set("bridge_a_ticks", [{ time: fortyMinutesAgo }]);
    tableData.set("bridge_b_ticks", [{ time: fortyMinutesAgo }]);

    await processStalenessDetection({ id: "job-1" } as any);

    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        alertCount: 1,
        alerts: [expect.objectContaining({ key: "bridge_a_high_traffic", severity: "critical" })],
      }),
      "Staleness checks detected issues"
    );
  });

  it("includes the last-known timestamp and age in the generated alert", async () => {
    // Note: this module tracks DB row recency, not an on-chain ledger
    // sequence — there is no ledger-sequence field anywhere in this code, so
    // the alert's provenance is its lastUpdated timestamp and ageMs instead.
    const lastSeen = new Date(NOW.getTime() - 10 * 60_000);
    tableData.set("bridge_a_ticks", [{ time: lastSeen }]);

    await processStalenessDetection({ id: "job-1" } as any);

    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        alerts: [
          expect.objectContaining({
            key: "bridge_a_high_traffic",
            lastUpdated: lastSeen.toISOString(),
            ageMs: 10 * 60_000,
            severity: "critical",
          }),
        ],
      }),
      "Staleness checks detected issues"
    );
  });

  it("raises a critical alert naming the silent source when telemetry has stopped entirely", async () => {
    // Nothing has ever been recorded for bridge_a: lastUpdated/ageMs are
    // null and the status is "missing", which is treated as critical.
    await processStalenessDetection({ id: "job-1" } as any);

    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        alerts: expect.arrayContaining([
          expect.objectContaining({ key: "bridge_a_high_traffic", status: "missing", severity: "critical", lastUpdated: null }),
        ]),
      }),
      "Staleness checks detected issues"
    );
  });

  it("clears the alert once fresh telemetry arrives — there is no separate recovery event, only its absence from the next run", async () => {
    tableData.set("bridge_a_ticks", [{ time: new Date(NOW.getTime() - 10 * 60_000) }]);
    await processStalenessDetection({ id: "job-1" } as any);
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ alertCount: 1 }),
      "Staleness checks detected issues"
    );

    mocks.loggerInfo.mockClear();
    mocks.loggerWarn.mockClear();

    // A fresh tick lands for bridge_a.
    tableData.set("bridge_a_ticks", [{ time: new Date(NOW.getTime() - 5_000) }]);
    await processStalenessDetection({ id: "job-2" } as any);

    expect(mocks.loggerWarn).not.toHaveBeenCalled();
    expect(mocks.loggerInfo).toHaveBeenCalledWith("Staleness checks are healthy");
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({ status: "fresh", alerts: 0 }),
      "Staleness detection job completed"
    );
  });
});
