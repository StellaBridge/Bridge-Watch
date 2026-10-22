import { describe, it, expect, vi, afterEach } from "vitest";
import type { Job } from "bullmq";
import { processExternalDependencyMonitor } from "../../src/workers/externalDependencyMonitor.job.js";
import { ExternalDependencyMonitorService } from "../../src/services/externalDependencyMonitor.service.js";

vi.mock("../../src/database/connection.js", () => ({
  getDatabase: vi.fn(() => ({})),
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../../src/config/index.js", () => ({
  config: {
    STELLAR_HORIZON_URL: "https://horizon.stellar.org",
    SOROBAN_RPC_URL: "https://soroban-rpc.stellar.org",
    ETHEREUM_RPC_URL: "https://eth.llamarpc.com",
    POLYGON_RPC_URL: "https://polygon.llamarpc.com",
    BASE_RPC_URL: "https://base.llamarpc.com",
  },
}));

// Latency thresholds for stellar-horizon: warning 750ms, critical 2000ms, alert after 2 failures.
const dependencyRow = (overrides: Record<string, unknown> = {}) => ({
  provider_key: "stellar-horizon",
  display_name: "Stellar Horizon",
  category: "core-rpc",
  endpoint: "https://horizon.stellar.org",
  check_type: "http",
  latency_warning_ms: 750,
  latency_critical_ms: 2_000,
  failure_threshold: 2,
  maintenance_mode: false,
  maintenance_note: null,
  status: "unknown",
  consecutive_failures: 0,
  last_success_at: null,
  last_failure_at: null,
  last_error: null,
  last_checked_at: null,
  last_latency_ms: null,
  ...overrides,
});

const newService = () => new ExternalDependencyMonitorService() as any;

describe("externalDependencyMonitor job", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("job wiring", () => {
    it("runs a scheduled check cycle", async () => {
      const runAllChecks = vi
        .spyOn(ExternalDependencyMonitorService.prototype, "runAllChecks")
        .mockResolvedValue([]);

      await processExternalDependencyMonitor({ id: "job-1" } as Job);

      expect(runAllChecks).toHaveBeenCalledTimes(1);
      expect(runAllChecks).toHaveBeenCalledWith("scheduled");
    });

    it("propagates check failures so BullMQ can retry the job", async () => {
      vi.spyOn(ExternalDependencyMonitorService.prototype, "runAllChecks").mockRejectedValue(
        new Error("database unavailable")
      );

      await expect(processExternalDependencyMonitor({ id: "job-2" } as Job)).rejects.toThrow(
        "database unavailable"
      );
    });
  });

  describe("health classification", () => {
    const classify = (
      response: { status: number } | null,
      latencyMs: number,
      error: Error | null = null
    ) => {
      const service = newService();
      const dependency = service.mapDependency(dependencyRow());
      return service.determineStatus(response, latencyMs, dependency, error);
    };

    it("is healthy for a 2xx response at or under the warning latency", () => {
      expect(classify({ status: 200 }, 750)).toBe("healthy");
    });

    it("is degraded once latency exceeds the warning threshold", () => {
      expect(classify({ status: 200 }, 751)).toBe("degraded");
    });

    it("stays degraded at exactly the critical latency", () => {
      expect(classify({ status: 200 }, 2_000)).toBe("degraded");
    });

    it("is down once latency exceeds the critical threshold", () => {
      expect(classify({ status: 200 }, 2_001)).toBe("down");
    });

    it("is degraded for a 4xx response", () => {
      expect(classify({ status: 404 }, 100)).toBe("degraded");
    });

    it("is down for a 5xx response", () => {
      expect(classify({ status: 503 }, 100)).toBe("down");
    });

    it("is down when the request throws", () => {
      expect(classify(null, 100, new Error("ECONNREFUSED"))).toBe("down");
    });

    it("is down when no response is returned", () => {
      expect(classify(null, 100)).toBe("down");
    });
  });

  describe("check execution", () => {
    it("records measured latency and marks a passing check healthy", async () => {
      const service = newService();
      const persist = vi.spyOn(service, "persistCheckResult").mockResolvedValue(undefined);
      vi.spyOn(service, "performRequest").mockResolvedValue({ status: 200 } as Response);

      const result = await service.runSingleCheck(dependencyRow(), "scheduled");

      expect(result.status).toBe("healthy");
      expect(result.statusCode).toBe(200);
      expect(typeof result.latencyMs).toBe("number");
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.alertTriggered).toBe(false);
      expect(persist).toHaveBeenCalledWith(
        expect.objectContaining({ providerKey: "stellar-horizon" }),
        expect.objectContaining({ status: "healthy", latencyMs: result.latencyMs }),
        expect.any(Date)
      );
    });

    it("triggers an alert once consecutive failures reach the threshold", async () => {
      const service = newService();
      vi.spyOn(service, "persistCheckResult").mockResolvedValue(undefined);
      vi.spyOn(service, "performRequest").mockRejectedValue(new Error("ECONNRESET"));

      // One failure already recorded, so this check is the second and hits failureThreshold 2.
      const result = await service.runSingleCheck(
        dependencyRow({ consecutive_failures: 1 }),
        "scheduled"
      );

      expect(result.status).toBe("down");
      expect(result.error).toBe("ECONNRESET");
      expect(result.alertTriggered).toBe(true);
    });

    it("does not trigger an alert below the failure threshold", async () => {
      const service = newService();
      vi.spyOn(service, "persistCheckResult").mockResolvedValue(undefined);
      vi.spyOn(service, "performRequest").mockRejectedValue(new Error("ECONNRESET"));

      const result = await service.runSingleCheck(
        dependencyRow({ consecutive_failures: 0 }),
        "scheduled"
      );

      expect(result.status).toBe("down");
      expect(result.alertTriggered).toBe(false);
    });

    it("clears the alert when a previously failing dependency recovers", async () => {
      const service = newService();
      vi.spyOn(service, "persistCheckResult").mockResolvedValue(undefined);
      vi.spyOn(service, "performRequest").mockResolvedValue({ status: 200 } as Response);

      const result = await service.runSingleCheck(
        dependencyRow({ status: "down", consecutive_failures: 5 }),
        "scheduled"
      );

      expect(result.status).toBe("healthy");
      expect(result.alertTriggered).toBe(false);
    });
  });
});
