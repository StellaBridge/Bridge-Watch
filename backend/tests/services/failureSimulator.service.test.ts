import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FailureSimulatorService } from "../../src/services/failureSimulator.service.js";

const mockDb = () => {
  const store: Record<string, any[]> = {
    failure_simulator_scenarios: [],
    failure_simulator_runs: [],
    failure_simulator_events: [],
  };

  const createQuery = (table: string) => {
    let whereConditions: Record<string, unknown> = {};
    let whereNullCol: string | null = null;
    let whereInData: { col: string; values: unknown[] } | null = null;
    let limitVal: number | null = null;
    let offsetVal = 0;

    const query: any = {
      where: vi.fn(function (this: any, cond: Record<string, unknown> | string) {
        if (typeof cond === "object") {
          Object.assign(whereConditions, cond);
        }
        return this;
      }),
      whereNull: vi.fn(function (this: any, col: string) {
        whereNullCol = col;
        return this;
      }),
      whereIn: vi.fn(function (this: any, col: string, values: unknown[]) {
        whereInData = { col, values };
        return this;
      }),
      select: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn(function (this: any, n: number) {
        limitVal = n;
        return this;
      }),
      offset: vi.fn().mockReturnThis(),
      count: vi.fn(function (this: any) {
        return Promise.resolve([{ count: store[table]?.length ?? 0 }]);
      }),
      clone: vi.fn().mockReturnThis(),
      first: vi.fn(async () => {
        const items = store[table] ?? [];
        return items.find((r) =>
          Object.entries(whereConditions).every(([k, v]) => r[k] === v)
        ) ?? null;
      }),
      insert: vi.fn(function (this: any, data: any) {
        const items = Array.isArray(data) ? data : [data];
        const withIds = items.map((item) => ({
          id: item.id ?? `uuid-${Math.random().toString(36).slice(2)}`,
          ...item,
          created_at: item.created_at ?? new Date().toISOString(),
          updated_at: item.updated_at ?? new Date().toISOString(),
        }));
        store[table].push(...withIds);
        return this;
      }),
      update: vi.fn(function (this: any, data: any) {
        const items = store[table] ?? [];
        const idx = items.findIndex((r) =>
          Object.entries(whereConditions).every(([k, v]) => r[k] === v) &&
          (whereNullCol === null || r[whereNullCol] === null || r[whereNullCol] === undefined) &&
          (whereInData === null || whereInData.values.includes(r[whereInData.col]))
        );
        if (idx >= 0) {
          Object.assign(items[idx], data);
        }
        return this;
      }),
      returning: vi.fn(function (this: any) {
        const items = store[table] ?? [];
        const matched = items.filter((r) =>
          Object.entries(whereConditions).every(([k, v]) => r[k] === v)
        );
        return Promise.resolve(matched);
      }),
      then: vi.fn(async (resolve: any, reject?: any) => {
        try {
          const items = store[table] ?? [];
          return resolve(items);
        } catch (err) {
          if (reject) return reject(err);
          throw err;
        }
      }),
    };
    return query;
  };

  const db: any = (table: string) => createQuery(table);
  db.raw = vi.fn((str: string) => str);
  db.fn = { now: () => new Date() };
  db.transaction = vi.fn(async (callback: any) => {
    const trx: any = (table: string) => createQuery(table);
    trx.raw = db.raw;
    trx.fn = db.fn;
    return callback(trx);
  });
  db.__store = store;

  return db;
};

vi.mock("../../src/database/connection.js", () => ({
  getDatabase: vi.fn(),
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("FailureSimulatorService", () => {
  let service: FailureSimulatorService;
  let db: any;

  beforeEach(async () => {
    const { getDatabase } = await import("../../src/database/connection.js");
    db = mockDb();
    vi.mocked(getDatabase).mockReturnValue(db);
    service = new FailureSimulatorService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("createScenario", () => {
    it("creates a latency scenario", async () => {
      const insertSpy = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          {
            id: "scen-1",
            name: "Horizon Latency",
            description: null,
            target_service: "stellar-horizon",
            failure_mode: "latency",
            latency_ms: 2000,
            error_rate: null,
            timeout_ms: null,
            error_message: null,
            enabled: false,
            created_by: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ]),
      });
      db("failure_simulator_scenarios").insert = insertSpy;

      const scenario = await service.createScenario({
        name: "Horizon Latency",
        targetService: "stellar-horizon",
        failureMode: "latency",
        latencyMs: 2000,
      });

      expect(scenario.id).toBe("scen-1");
      expect(scenario.failureMode).toBe("latency");
      expect(scenario.latencyMs).toBe(2000);
      expect(scenario.enabled).toBe(false);
    });

    it("creates a partial_failure scenario", async () => {
      const insertSpy = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          {
            id: "scen-2",
            name: "RPC Partial Failure",
            description: null,
            target_service: "soroban-rpc",
            failure_mode: "partial_failure",
            latency_ms: null,
            error_rate: 0.3,
            timeout_ms: null,
            error_message: null,
            enabled: false,
            created_by: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ]),
      });
      db("failure_simulator_scenarios").insert = insertSpy;

      const scenario = await service.createScenario({
        name: "RPC Partial Failure",
        targetService: "soroban-rpc",
        failureMode: "partial_failure",
        errorRate: 0.3,
      });

      expect(scenario.failureMode).toBe("partial_failure");
      expect(scenario.errorRate).toBe(0.3);
    });

    it("rejects latency scenario without latencyMs", async () => {
      await expect(
        service.createScenario({
          name: "Bad Latency",
          targetService: "stellar-horizon",
          failureMode: "latency",
        })
      ).rejects.toThrow("latencyMs is required");
    });

    it("rejects partial_failure without errorRate", async () => {
      await expect(
        service.createScenario({
          name: "Bad Partial",
          targetService: "stellar-horizon",
          failureMode: "partial_failure",
        })
      ).rejects.toThrow("errorRate is required");
    });

    it("rejects errorRate outside 0–1 range", async () => {
      await expect(
        service.createScenario({
          name: "Bad Rate",
          targetService: "stellar-horizon",
          failureMode: "partial_failure",
          errorRate: 1.5,
        })
      ).rejects.toThrow("errorRate must be between 0.0 and 1.0");
    });

    it("rejects timeout scenario without timeoutMs", async () => {
      await expect(
        service.createScenario({
          name: "Bad Timeout",
          targetService: "stellar-horizon",
          failureMode: "timeout",
        })
      ).rejects.toThrow("timeoutMs is required");
    });
  });

  describe("getScenario", () => {
    it("returns null when not found", async () => {
      const firstSpy = vi.fn().mockResolvedValue(null);
      db("failure_simulator_scenarios").first = firstSpy;

      const result = await service.getScenario("nonexistent");
      expect(result).toBeNull();
    });

    it("returns mapped scenario when found", async () => {
      const row = {
        id: "scen-1",
        name: "Test Scenario",
        description: "desc",
        target_service: "stellar-horizon",
        failure_mode: "error",
        latency_ms: null,
        error_rate: null,
        timeout_ms: null,
        error_message: "Simulated error",
        enabled: true,
        created_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      db("failure_simulator_scenarios").first = vi.fn().mockResolvedValue(row);

      const result = await service.getScenario("scen-1");

      expect(result).not.toBeNull();
      expect(result?.id).toBe("scen-1");
      expect(result?.failureMode).toBe("error");
      expect(result?.errorMessage).toBe("Simulated error");
    });
  });

  describe("setEnabled", () => {
    it("enables a scenario", async () => {
      const updatedRow = {
        id: "scen-1",
        name: "Test",
        description: null,
        target_service: "stellar-horizon",
        failure_mode: "error",
        latency_ms: null,
        error_rate: null,
        timeout_ms: null,
        error_message: null,
        enabled: true,
        created_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      db("failure_simulator_scenarios").returning = vi.fn().mockResolvedValue([updatedRow]);

      const result = await service.setEnabled("scen-1", true);

      expect(result?.enabled).toBe(true);
    });

    it("returns null when scenario not found", async () => {
      db("failure_simulator_scenarios").returning = vi.fn().mockResolvedValue([]);

      const result = await service.setEnabled("nonexistent", true);
      expect(result).toBeNull();
    });
  });

  describe("deleteScenario", () => {
    it("returns false when not found", async () => {
      db("failure_simulator_scenarios").update = vi.fn().mockResolvedValue(0);

      const result = await service.deleteScenario("nonexistent");
      expect(result).toBe(false);
    });

    it("soft deletes the scenario", async () => {
      db("failure_simulator_scenarios").update = vi.fn().mockResolvedValue(1);

      const result = await service.deleteScenario("scen-1");
      expect(result).toBe(true);
    });
  });

  describe("startRun", () => {
    it("returns null when scenario does not exist", async () => {
      db("failure_simulator_scenarios").first = vi.fn().mockResolvedValue(null);

      const result = await service.startRun("missing-scenario");
      expect(result).toBeNull();
    });

    it("creates a run and start event in a transaction", async () => {
      const scenario = {
        id: "scen-1",
        name: "Test",
        description: null,
        target_service: "stellar-horizon",
        failure_mode: "error",
        latency_ms: null,
        error_rate: null,
        timeout_ms: null,
        error_message: null,
        enabled: true,
        created_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      db("failure_simulator_scenarios").first = vi.fn().mockResolvedValue(scenario);

      const runRow = {
        id: "run-1",
        scenario_id: "scen-1",
        status: "running",
        triggered_by: "user-abc",
        trigger: "manual",
        duration_ms: 5000,
        requests_injected: 0,
        requests_succeeded: 0,
        requests_failed: 0,
        observations: "{}",
        cancellation_reason: null,
        started_at: new Date().toISOString(),
        completed_at: null,
        created_at: new Date().toISOString(),
      };

      db.transaction = vi.fn(async (cb: any) => {
        const trx: any = () => ({
          insert: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([runRow]),
          }),
        });
        trx.raw = db.raw;
        trx.fn = db.fn;
        return cb(trx);
      });

      const run = await service.startRun("scen-1", {
        triggeredBy: "user-abc",
        durationMs: 5000,
      });

      expect(run).not.toBeNull();
      expect(run?.scenarioId).toBe("scen-1");
      expect(run?.status).toBe("running");
      expect(run?.triggeredBy).toBe("user-abc");
    });
  });

  describe("completeRun", () => {
    it("returns null when run not found or not running", async () => {
      db.transaction = vi.fn(async (cb: any) => {
        const trx: any = () => ({
          where: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          returning: vi.fn().mockResolvedValue([]),
          insert: vi.fn().mockReturnThis(),
        });
        trx.raw = db.raw;
        trx.fn = db.fn;
        return cb(trx);
      });

      const result = await service.completeRun("run-missing");
      expect(result).toBeNull();
    });

    it("marks run as completed and persists observations", async () => {
      const completedRow = {
        id: "run-1",
        scenario_id: "scen-1",
        status: "completed",
        triggered_by: null,
        trigger: "manual",
        duration_ms: null,
        requests_injected: 10,
        requests_succeeded: 8,
        requests_failed: 2,
        observations: JSON.stringify({ p99LatencyMs: 1800 }),
        cancellation_reason: null,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };

      db.transaction = vi.fn(async (cb: any) => {
        const trx: any = () => ({
          where: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          returning: vi.fn().mockResolvedValue([completedRow]),
          insert: vi.fn().mockReturnThis(),
        });
        trx.raw = db.raw;
        trx.fn = db.fn;
        return cb(trx);
      });

      const run = await service.completeRun("run-1", { p99LatencyMs: 1800 });

      expect(run?.status).toBe("completed");
      expect(run?.observations).toEqual({ p99LatencyMs: 1800 });
    });
  });

  describe("cancelRun", () => {
    it("cancels a running run", async () => {
      const cancelledRow = {
        id: "run-1",
        scenario_id: "scen-1",
        status: "cancelled",
        triggered_by: null,
        trigger: "manual",
        duration_ms: null,
        requests_injected: 3,
        requests_succeeded: 3,
        requests_failed: 0,
        observations: "{}",
        cancellation_reason: "Operator stopped it",
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };

      db.transaction = vi.fn(async (cb: any) => {
        const trx: any = () => ({
          where: vi.fn().mockReturnThis(),
          whereIn: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          returning: vi.fn().mockResolvedValue([cancelledRow]),
          insert: vi.fn().mockReturnThis(),
        });
        trx.raw = db.raw;
        trx.fn = db.fn;
        return cb(trx);
      });

      const run = await service.cancelRun("run-1", "Operator stopped it");

      expect(run?.status).toBe("cancelled");
      expect(run?.cancellationReason).toBe("Operator stopped it");
    });

    it("returns null when run is already completed", async () => {
      db.transaction = vi.fn(async (cb: any) => {
        const trx: any = () => ({
          where: vi.fn().mockReturnThis(),
          whereIn: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          returning: vi.fn().mockResolvedValue([]),
          insert: vi.fn().mockReturnThis(),
        });
        trx.raw = db.raw;
        trx.fn = db.fn;
        return cb(trx);
      });

      const result = await service.cancelRun("run-1");
      expect(result).toBeNull();
    });
  });

  describe("listScenarios", () => {
    it("returns scenarios and total", async () => {
      const rows = [
        {
          id: "scen-1",
          name: "Scenario A",
          description: null,
          target_service: "stellar-horizon",
          failure_mode: "error",
          latency_ms: null,
          error_rate: null,
          timeout_ms: null,
          error_message: null,
          enabled: true,
          created_by: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      const queryChain: any = {
        whereNull: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        clone: vi.fn().mockReturnThis(),
        count: vi.fn().mockResolvedValue([{ count: 1 }]),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockResolvedValue(rows),
      };
      db("failure_simulator_scenarios").whereNull = vi.fn(() => queryChain);

      const result = await service.listScenarios();
      expect(result.total).toBe(1);
      expect(result.scenarios).toHaveLength(1);
    });
  });

  describe("listRuns", () => {
    it("returns runs list with total", async () => {
      const rows = [
        {
          id: "run-1",
          scenario_id: "scen-1",
          status: "completed",
          triggered_by: null,
          trigger: "manual",
          duration_ms: null,
          requests_injected: 5,
          requests_succeeded: 5,
          requests_failed: 0,
          observations: "{}",
          cancellation_reason: null,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
      ];

      const queryChain: any = {
        where: vi.fn().mockReturnThis(),
        clone: vi.fn().mockReturnThis(),
        count: vi.fn().mockResolvedValue([{ count: 1 }]),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockResolvedValue(rows),
      };
      db("failure_simulator_runs").where = vi.fn(() => queryChain);

      const result = await service.listRuns({ scenarioId: "scen-1" });
      expect(result.total).toBe(1);
      expect(result.runs).toHaveLength(1);
      expect(result.runs[0].status).toBe("completed");
    });
  });

  describe("getRunEvents", () => {
    it("retrieves events for a run in chronological order", async () => {
      const rows = [
        {
          id: "evt-1",
          run_id: "run-1",
          event_type: "started",
          payload: JSON.stringify({ failureMode: "error" }),
          occurred_at: new Date().toISOString(),
        },
        {
          id: "evt-2",
          run_id: "run-1",
          event_type: "injected",
          payload: JSON.stringify({ succeeded: false }),
          occurred_at: new Date().toISOString(),
        },
      ];

      const queryChain: any = {
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue(rows),
      };
      db("failure_simulator_events").where = vi.fn(() => queryChain);

      const events = await service.getRunEvents("run-1");

      expect(events).toHaveLength(2);
      expect(events[0].eventType).toBe("started");
      expect(events[1].eventType).toBe("injected");
    });
  });
});
