import { describe, it, expect, beforeEach } from "vitest";
import {
  MetricsService,
  getMetricsService,
} from "../../src/services/metrics.service.js";

/** Find a single sample from a getMetricsJSON() entry by metricName + labels. */
const findSample = (
  json: any[],
  name: string,
  match: (labels: Record<string, unknown>) => boolean,
  metricName?: string,
) => {
  const metric = json.find((m) => m.name === name);
  if (!metric) return undefined;
  return metric.values.find(
    (v: any) =>
      (metricName ? v.metricName === metricName : true) && match(v.labels ?? {}),
  );
};

describe("MetricsService", () => {
  let metrics: MetricsService;

  beforeEach(() => {
    // Each instance owns its own prom-client Registry, so tests stay isolated.
    metrics = new MetricsService();
  });

  describe("getMetricsService (singleton)", () => {
    it("returns the same instance on repeated calls", () => {
      expect(getMetricsService()).toBe(getMetricsService());
    });
  });

  describe("registration & exposure", () => {
    it("exposes registered counters/gauges/histograms in Prometheus text", async () => {
      const text = await metrics.getMetrics();
      expect(text).toContain("http_requests_total");
      expect(text).toContain("bridge_health_score");
      expect(text).toContain("db_query_duration_seconds");
      expect(text).toContain("queue_jobs_completed_total");
    });

    it("exposes metrics as JSON with names and metric types", async () => {
      const json = await metrics.getMetricsJSON();
      const byName = Object.fromEntries(json.map((m: any) => [m.name, m.type]));
      expect(byName["http_requests_total"]).toBe("counter");
      expect(byName["bridge_health_score"]).toBe("gauge");
      expect(byName["db_pending_migrations_count"]).toBe("gauge");
      expect(byName["http_request_duration_seconds"]).toBe("histogram");
    });

    it("registers default Node.js process metrics", async () => {
      const text = await metrics.getMetrics();
      expect(text).toMatch(/nodejs_eventloop_lag_seconds|process_cpu_user_seconds_total/);
    });

    it("getRegistry returns a usable registry", () => {
      const registry = metrics.getRegistry();
      expect(registry).toBeDefined();
      expect(typeof registry.metrics).toBe("function");
    });
  });

  describe("recordHttpRequest", () => {
    it("increments the request counter with method/route/status labels", async () => {
      metrics.recordHttpRequest("GET", "/api/v1/health", 200, 0.012);

      const json = await metrics.getMetricsJSON();
      const sample = findSample(
        json,
        "http_requests_total",
        (l) =>
          l.method === "GET" &&
          l.route === "/api/v1/health" &&
          String(l.status_code) === "200",
      );
      expect(sample?.value).toBe(1);
    });

    it("observes the request-duration histogram", async () => {
      metrics.recordHttpRequest("GET", "/price", 200, 0.5);

      const json = await metrics.getMetricsJSON();
      const count = findSample(
        json,
        "http_request_duration_seconds",
        (l) => l.route === "/price",
        "http_request_duration_seconds_count",
      );
      expect(count?.value).toBe(1);
    });

    it("records request and response sizes only when provided", async () => {
      metrics.recordHttpRequest("POST", "/ingest", 201, 0.1, 2048, 4096);

      const json = await metrics.getMetricsJSON();
      const reqCount = findSample(
        json,
        "http_request_size_bytes",
        (l) => l.route === "/ingest",
        "http_request_size_bytes_count",
      );
      const resCount = findSample(
        json,
        "http_response_size_bytes",
        (l) => l.route === "/ingest",
        "http_response_size_bytes_count",
      );
      expect(reqCount?.value).toBe(1);
      expect(resCount?.value).toBe(1);
    });

    it("omits size histograms when sizes are not passed", async () => {
      metrics.recordHttpRequest("GET", "/nosize", 200, 0.01);

      const json = await metrics.getMetricsJSON();
      const reqCount = findSample(
        json,
        "http_request_size_bytes",
        (l) => l.route === "/nosize",
        "http_request_size_bytes_count",
      );
      expect(reqCount).toBeUndefined();
    });
  });

  describe("recordDbQuery", () => {
    it("counts queries and observes duration", async () => {
      metrics.recordDbQuery("select", "bridges", 0.02);

      const json = await metrics.getMetricsJSON();
      const total = findSample(
        json,
        "db_queries_total",
        (l) => l.operation === "select" && l.table === "bridges",
      );
      expect(total?.value).toBe(1);
    });

    it("increments the error counter when an error is supplied", async () => {
      metrics.recordDbQuery("insert", "alerts", 0.05, { type: "unique_violation" });

      const json = await metrics.getMetricsJSON();
      const errors = findSample(
        json,
        "db_query_errors_total",
        (l) =>
          l.operation === "insert" &&
          l.table === "alerts" &&
          l.error_type === "unique_violation",
      );
      expect(errors?.value).toBe(1);
    });
  });

  describe("recordQueueJob", () => {
    it("increments the completed counter on success", async () => {
      metrics.recordQueueJob("verifications", "verify", 12, true);

      const json = await metrics.getMetricsJSON();
      const completed = findSample(
        json,
        "queue_jobs_completed_total",
        (l) => l.queue_name === "verifications" && l.job_type === "verify",
      );
      expect(completed?.value).toBe(1);
    });

    it("increments the failed counter with an error type on failure", async () => {
      metrics.recordQueueJob("verifications", "verify", 8, false, "timeout");

      const json = await metrics.getMetricsJSON();
      const failed = findSample(
        json,
        "queue_jobs_failed_total",
        (l) => l.job_type === "verify" && l.error_type === "timeout",
      );
      expect(failed?.value).toBe(1);
    });

    it("defaults the failure error type to 'unknown'", async () => {
      metrics.recordQueueJob("q", "j", 1, false);

      const json = await metrics.getMetricsJSON();
      const failed = findSample(
        json,
        "queue_jobs_failed_total",
        (l) => l.job_type === "j" && l.error_type === "unknown",
      );
      expect(failed?.value).toBe(1);
    });
  });

  describe("recordBridgeVerification", () => {
    it("counts the verification and the success branch", async () => {
      metrics.recordBridgeVerification("b1", "Circle", "USDC", true);

      const json = await metrics.getMetricsJSON();
      const total = findSample(
        json,
        "bridge_verifications_total",
        (l) => l.bridge_id === "b1" && l.asset === "USDC",
      );
      const success = findSample(
        json,
        "bridge_verification_success_total",
        (l) => l.bridge_id === "b1",
      );
      expect(total?.value).toBe(1);
      expect(success?.value).toBe(1);
    });

    it("records the failure branch with a reason", async () => {
      metrics.recordBridgeVerification("b2", "Allbridge", "USDC", false, "reserve_drift");

      const json = await metrics.getMetricsJSON();
      const failure = findSample(
        json,
        "bridge_verification_failure_total",
        (l) => l.bridge_id === "b2" && l.reason === "reserve_drift",
      );
      expect(failure?.value).toBe(1);
    });
  });

  describe("reset", () => {
    it("clears recorded metric values", async () => {
      metrics.recordHttpRequest("GET", "/reset-me", 200, 0.01);
      metrics.reset();

      const json = await metrics.getMetricsJSON();
      const sample = findSample(
        json,
        "http_requests_total",
        (l) => l.route === "/reset-me",
      );
      expect(sample).toBeUndefined();
    });
  });
});
