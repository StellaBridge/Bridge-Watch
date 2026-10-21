import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
  loggerDebug: vi.fn(),
  checkSlaBreaches: vi.fn(),
  db: undefined as any,
}));

vi.mock("../../src/database/connection.js", () => ({
  getDatabase: () => mocks.db,
}));

interface IncidentRow {
  id: string;
  bridge_id: string;
  severity: "critical" | "high" | "medium" | "low";
  status: string;
  title: string;
  occurred_at: string | Date;
}

/**
 * A fake knex table that genuinely filters by the statuses passed to
 * `whereIn` and sorts by `occurred_at`, rather than just recording the call —
 * so the exclusion test exercises real filtering behavior, not a mocked
 * assertion of intent.
 */
function createFakeDb(rows: IncidentRow[]) {
  let statusFilter: string[] = [];
  const chain: any = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.whereIn = vi.fn().mockImplementation((_column: string, statuses: string[]) => {
    statusFilter = statuses;
    return chain;
  });
  chain.orderBy = vi.fn().mockImplementation(() => {
    const filtered = rows.filter((r) => statusFilter.includes(r.status));
    return Promise.resolve(
      [...filtered].sort(
        (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime()
      )
    );
  });
  const table = vi.fn().mockReturnValue(chain);
  return { db: table, chain, table };
}

describe("processIncidentSlaBreach job orchestration", () => {
  let processIncidentSlaBreach: (typeof import("../../src/workers/incidentSlaBreach.job.js"))["processIncidentSlaBreach"];

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    vi.doMock("../../src/utils/logger.js", () => ({
      logger: {
        info: mocks.loggerInfo,
        warn: mocks.loggerWarn,
        error: mocks.loggerError,
        debug: mocks.loggerDebug,
      },
    }));
    vi.doMock("../../src/services/incidentSlaBreach.service.js", () => ({
      incidentSlaBreachService: { checkSlaBreaches: mocks.checkSlaBreaches },
    }));

    const mod = await import("../../src/workers/incidentSlaBreach.job.js");
    processIncidentSlaBreach = mod.processIncidentSlaBreach;
  });

  it("logs the job start with the job id", async () => {
    mocks.checkSlaBreaches.mockResolvedValue({ openIncidentsChecked: 0, breaches: [] });

    await processIncidentSlaBreach({ id: "job-1" } as any);

    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      { jobId: "job-1" },
      "Starting incident SLA breach detection job"
    );
  });

  it("logs completion with the breach counts split by severity level", async () => {
    mocks.checkSlaBreaches.mockResolvedValue({
      openIncidentsChecked: 5,
      breaches: [
        { breachLevel: "critical" },
        { breachLevel: "critical" },
        { breachLevel: "warning" },
      ],
    });

    await processIncidentSlaBreach({ id: "job-2" } as any);

    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      {
        jobId: "job-2",
        openIncidentsChecked: 5,
        totalBreaches: 3,
        critical: 2,
        warning: 1,
      },
      "Incident SLA breach detection job completed"
    );
  });

  it("logs and rethrows when the SLA check fails", async () => {
    const error = new Error("database unreachable");
    mocks.checkSlaBreaches.mockRejectedValue(error);

    await expect(processIncidentSlaBreach({ id: "job-err" } as any)).rejects.toThrow(
      "database unreachable"
    );
    expect(mocks.loggerError).toHaveBeenCalledWith(
      { jobId: "job-err", error },
      "Incident SLA breach detection job failed"
    );
  });
});

describe("IncidentSlaBreachService.checkSlaBreaches", () => {
  const NOW = new Date("2026-06-01T01:00:00Z");

  let IncidentSlaBreachService: (typeof import("../../src/services/incidentSlaBreach.service.js"))["IncidentSlaBreachService"];

  function incident(overrides: Partial<IncidentRow> = {}): IncidentRow {
    return {
      id: "inc-1",
      bridge_id: "bridge-usdc",
      severity: "critical",
      status: "open",
      title: "Bridge latency spike",
      occurred_at: NOW.toISOString(),
      ...overrides,
    };
  }

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    vi.doMock("../../src/utils/logger.js", () => ({
      logger: {
        info: mocks.loggerInfo,
        warn: mocks.loggerWarn,
        error: mocks.loggerError,
        debug: mocks.loggerDebug,
      },
    }));

    mocks.loggerInfo.mockClear();
    mocks.loggerWarn.mockClear();
    mocks.loggerError.mockClear();

    IncidentSlaBreachService = (await import("../../src/services/incidentSlaBreach.service.js"))
      .IncidentSlaBreachService;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not flag an incident that is still within its SLA window", async () => {
    // Critical severity: warning at 30m, critical at 60m. 10m elapsed is safe.
    mocks.db = createFakeDb([incident({ occurred_at: new Date(NOW.getTime() - 10 * 60_000) })]).db;
    const service = new IncidentSlaBreachService();

    const result = await service.checkSlaBreaches();

    expect(result.breaches).toHaveLength(0);
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({ openIncidentsChecked: 1 }),
      "SLA breach check passed — no breaches"
    );
    expect(mocks.loggerError).not.toHaveBeenCalled();
  });

  it("detects an incident approaching its SLA deadline as a warning breach", async () => {
    // 45m elapsed is past the 30m warning threshold but short of the 60m critical one.
    mocks.db = createFakeDb([incident({ occurred_at: new Date(NOW.getTime() - 45 * 60_000) })]).db;
    const service = new IncidentSlaBreachService();

    const result = await service.checkSlaBreaches();

    expect(result.breaches).toHaveLength(1);
    expect(result.breaches[0]).toMatchObject({
      breachLevel: "warning",
      thresholdMinutes: 30,
      elapsedMinutes: 45,
    });
  });

  it("escalates to a critical breach once the incident passes the critical threshold", async () => {
    // 75m elapsed is past the 60m critical threshold for a critical-severity incident.
    mocks.db = createFakeDb([incident({ occurred_at: new Date(NOW.getTime() - 75 * 60_000) })]).db;
    const service = new IncidentSlaBreachService();

    const result = await service.checkSlaBreaches();

    expect(result.breaches[0]).toMatchObject({ breachLevel: "critical", thresholdMinutes: 60 });
    // The escalation is dispatched as an error-level log naming the breach count.
    expect(mocks.loggerError).toHaveBeenCalledWith(
      { totalBreaches: 1, critical: 1 },
      "SLA breach check completed with breaches"
    );
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ breachLevel: "critical" }),
      expect.stringContaining("SLA critical breach")
    );
  });

  it("applies each incident's own severity threshold rather than one global deadline", async () => {
    // High severity warns at 120m; 90m elapsed should not breach for it,
    // even though the same 90m would already be a critical breach for critical severity.
    mocks.db = createFakeDb([
      incident({ id: "high-sev", severity: "high", occurred_at: new Date(NOW.getTime() - 90 * 60_000) }),
      incident({ id: "critical-sev", severity: "critical", occurred_at: new Date(NOW.getTime() - 90 * 60_000) }),
    ]).db;
    const service = new IncidentSlaBreachService();

    const result = await service.checkSlaBreaches();

    expect(result.breaches.find((b) => b.incidentId === "high-sev")).toBeUndefined();
    expect(result.breaches.find((b) => b.incidentId === "critical-sev")).toMatchObject({
      breachLevel: "critical",
    });
  });

  it("excludes resolved and snoozed incidents from SLA tracking even when long overdue", async () => {
    const fakeDb = createFakeDb([
      incident({ id: "open-1", status: "open", occurred_at: new Date(NOW.getTime() - 90 * 60_000) }),
      incident({ id: "resolved-1", status: "resolved", occurred_at: new Date(NOW.getTime() - 10_000 * 60_000) }),
      incident({ id: "snoozed-1", status: "snoozed", occurred_at: new Date(NOW.getTime() - 10_000 * 60_000) }),
      incident({ id: "closed-1", status: "closed", occurred_at: new Date(NOW.getTime() - 10_000 * 60_000) }),
    ]);
    mocks.db = fakeDb.db;
    const service = new IncidentSlaBreachService();

    const result = await service.checkSlaBreaches();

    expect(fakeDb.chain.whereIn).toHaveBeenCalledWith("status", ["open", "investigating"]);
    expect(result.openIncidentsChecked).toBe(1);
    expect(result.breaches.map((b) => b.incidentId)).toEqual(["open-1"]);
  });

  it("includes incidents under active investigation alongside open ones", async () => {
    mocks.db = createFakeDb([
      incident({ id: "investigating-1", status: "investigating", occurred_at: new Date(NOW.getTime() - 90 * 60_000) }),
    ]).db;
    const service = new IncidentSlaBreachService();

    const result = await service.checkSlaBreaches();

    expect(result.breaches.map((b) => b.incidentId)).toEqual(["investigating-1"]);
  });

  it("computes the same elapsed time for an instant regardless of the UTC offset used to express it", async () => {
    // "2026-06-01T00:00:00Z" and the equivalent "2026-06-01T02:00:00+02:00"
    // are the same instant, 60 minutes before NOW — the comparison must be
    // instant-based, not a naive string/local-time comparison.
    mocks.db = createFakeDb([
      incident({ id: "utc", occurred_at: "2026-06-01T00:00:00Z" }),
      incident({ id: "offset", occurred_at: "2026-06-01T02:00:00+02:00" }),
    ]).db;
    const service = new IncidentSlaBreachService();

    const result = await service.checkSlaBreaches();

    const utc = result.breaches.find((b) => b.incidentId === "utc");
    const offset = result.breaches.find((b) => b.incidentId === "offset");

    expect(utc?.elapsedMinutes).toBe(60);
    expect(offset?.elapsedMinutes).toBe(60);
    expect(utc?.breachLevel).toBe(offset?.breachLevel);
  });

  it("handles occurred_at delivered as a native Date instance the same way as an ISO string", async () => {
    mocks.db = createFakeDb([
      incident({ id: "date-instance", occurred_at: new Date(NOW.getTime() - 60 * 60_000) }),
    ]).db;
    const service = new IncidentSlaBreachService();

    const result = await service.checkSlaBreaches();

    expect(result.breaches[0]).toMatchObject({ incidentId: "date-instance", elapsedMinutes: 60 });
  });

  it("honors configured per-severity threshold overrides", async () => {
    mocks.db = createFakeDb([
      incident({ severity: "low", occurred_at: new Date(NOW.getTime() - 20 * 60_000) }),
    ]).db;
    const service = new IncidentSlaBreachService();
    service.configureThresholds({ low: { warningMinutes: 15, criticalMinutes: 30 } });

    const result = await service.checkSlaBreaches();

    expect(result.breaches[0]).toMatchObject({ breachLevel: "warning", thresholdMinutes: 15 });
  });
});
