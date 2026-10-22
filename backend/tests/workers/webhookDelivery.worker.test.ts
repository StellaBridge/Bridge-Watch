import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "crypto";

const mocks = vi.hoisted(() => ({
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
  loggerDebug: vi.fn(),
  processDelivery: vi.fn(),
  recordSuccess: vi.fn(),
  recordSignatureFailure: vi.fn(),
  recordFailure: vi.fn(),
  updateDeliveryStatus: vi.fn(),
  dnsLookup: vi.fn(),
  fetchMock: vi.fn(),
}));

// webhookDelivery.worker.ts builds its job processor inline inside
// initWebhookWorker() rather than exporting it separately, so this mock
// captures that function (and keeps Worker a real EventEmitter) so tests can
// invoke the processor and the "failed" listener directly.
vi.mock("bullmq", () => {
  const { EventEmitter } = require("events");
  class WorkerMock extends EventEmitter {
    processor: (job: any) => Promise<unknown>;
    constructor(_name: string, processor: (job: any) => Promise<unknown>, _opts: unknown) {
      super();
      this.processor = processor;
    }
    close = vi.fn().mockResolvedValue(undefined);
  }
  class QueueMock {
    add = vi.fn().mockResolvedValue({ id: "job-1" });
    on = vi.fn();
    close = vi.fn().mockResolvedValue(undefined);
  }
  return { Worker: WorkerMock, Queue: QueueMock };
});

vi.mock("../../src/config/index.js", () => ({
  config: { REDIS_HOST: "localhost", REDIS_PORT: 6379, REDIS_PASSWORD: undefined },
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: {
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
    error: mocks.loggerError,
    debug: mocks.loggerDebug,
  },
}));

function makeJob(attemptsMade: number, dataOverrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: `job-${attemptsMade}`,
    attemptsMade,
    data: {
      deliveryId: "del-1",
      webhookEndpointId: "ep-1",
      eventType: "alert.triggered",
      payload: { foo: "bar" },
      ...dataOverrides,
    },
  } as any;
}

// ─── Processor error handling: backoff calculation + permanent-failure routing ─

describe("webhookDelivery worker — retry backoff & permanent-failure routing", () => {
  let initWebhookWorker: (typeof import("../../src/workers/webhookDelivery.worker.js"))["initWebhookWorker"];
  let getWebhookWorker: (typeof import("../../src/workers/webhookDelivery.worker.js"))["getWebhookWorker"];

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    vi.doMock("../../src/services/webhook.service.js", () => ({
      webhookService: {
        processDelivery: mocks.processDelivery,
        recordSuccess: mocks.recordSuccess,
        recordSignatureFailure: mocks.recordSignatureFailure,
        recordFailure: mocks.recordFailure,
        updateDeliveryStatus: mocks.updateDeliveryStatus,
      },
    }));

    const mod = await import("../../src/workers/webhookDelivery.worker.js");
    initWebhookWorker = mod.initWebhookWorker;
    getWebhookWorker = mod.getWebhookWorker;
    await initWebhookWorker();
  });

  it("computes an exponential backoff delay for each retry attempt using the webhook delivery policy", async () => {
    // Pin Math.random so getDelayMs's jitter term resolves to exactly 0,
    // making the exponential sequence (base 1000ms, multiplier 2) exact:
    // 1000, 2000, 4000, 8000, 16000, 32000, 64000 for attempts 1..7.
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);
    mocks.processDelivery.mockRejectedValue(new Error("HTTP 500: upstream error"));
    const worker: any = getWebhookWorker();
    const expectedDelays = [1000, 2000, 4000, 8000, 16000, 32000, 64000];

    for (let attemptsMade = 0; attemptsMade < expectedDelays.length; attemptsMade++) {
      await expect(worker.processor(makeJob(attemptsMade))).rejects.toThrow();
    }

    const loggedDelays = mocks.loggerError.mock.calls
      .filter(([, message]) => message === "Webhook delivery failed, will retry")
      .map(([payload]) => payload.nextRetryIn);

    expect(loggedDelays).toEqual(expectedDelays);
    randomSpy.mockRestore();
  });

  it("caps the backoff delay at the configured maximum for very high attempt counts", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);
    mocks.processDelivery.mockRejectedValue(new Error("HTTP 500: upstream error"));
    const worker: any = getWebhookWorker();

    // 1000 * 2^12 = 4,096,000ms, well above the configured 3,600,000ms cap.
    await expect(worker.processor(makeJob(12))).rejects.toThrow();

    const [[payload]] = mocks.loggerError.mock.calls.filter(
      ([, message]) => message === "Webhook delivery failed, will retry"
    );
    expect(payload.nextRetryIn).toBe(3_600_000);
    randomSpy.mockRestore();
  });

  it("records a signature/auth failure before retries are exhausted when the response is 401 or 403", async () => {
    mocks.processDelivery.mockRejectedValue(new Error("HTTP 401: invalid signature"));
    const worker: any = getWebhookWorker();

    await expect(worker.processor(makeJob(0))).rejects.toThrow();

    expect(mocks.recordSignatureFailure).toHaveBeenCalledWith("ep-1", 401, "HTTP 401: invalid signature");
  });

  it("records success and resets the signature-failure counter after a successful delivery", async () => {
    mocks.processDelivery.mockResolvedValue({ status: 200, body: "ok" });
    const worker: any = getWebhookWorker();

    const result = await worker.processor(makeJob(0));

    expect(result).toEqual({ status: 200, body: "ok" });
    expect(mocks.recordSuccess).toHaveBeenCalledWith("ep-1");
  });

  it("flips the delivery to permanently failed and records a circuit-breaker failure once attempts are exhausted", async () => {
    // There is no separate Dead Letter Queue here: BullMQ itself stops
    // retrying once attempts are exhausted and emits "failed"; the nearest
    // real analog to DLQ routing is this handler flipping the delivery
    // status to "failed" and recording it against the endpoint's circuit
    // breaker, which is what actually happens on permanent failure.
    const worker: any = getWebhookWorker();
    const failedHandler = worker.listeners("failed")[0] as (job: any, err: Error) => Promise<void>;
    const job = makeJob(7); // attemptsMade === configured maxRetries (7)
    const err = new Error("Webhook delivery failed: HTTP 500: upstream error");

    await failedHandler(job, err);

    expect(mocks.updateDeliveryStatus).toHaveBeenCalledWith("del-1", "failed", undefined, err.message);
    expect(mocks.recordFailure).toHaveBeenCalledWith("ep-1");
  });

  it("does not treat an attempt as permanently failed while retries remain", async () => {
    const worker: any = getWebhookWorker();
    const failedHandler = worker.listeners("failed")[0] as (job: any, err: Error) => Promise<void>;
    const job = makeJob(3); // below the configured maxRetries (7)
    const err = new Error("Webhook delivery failed: HTTP 500: upstream error");

    await failedHandler(job, err);

    expect(mocks.updateDeliveryStatus).not.toHaveBeenCalled();
    expect(mocks.recordFailure).not.toHaveBeenCalled();
  });
});

// ─── Real webhookService: HMAC signing and SSRF protection on delivery ─────

function createFakeDb(endpointRow: Record<string, unknown> | null) {
  const db: any = vi.fn((table: string) => {
    const builder: any = {};
    builder.where = vi.fn().mockReturnValue(builder);
    builder.whereNotNull = vi.fn().mockReturnValue(builder);
    builder.whereNot = vi.fn().mockReturnValue(builder);
    builder.orderBy = vi.fn().mockReturnValue(builder);
    builder.limit = vi.fn().mockResolvedValue([]);
    builder.first = vi.fn().mockResolvedValue(table === "webhook_endpoints" ? endpointRow : null);
    builder.insert = vi.fn().mockReturnValue(builder);
    builder.onConflict = vi.fn().mockReturnValue(builder);
    builder.merge = vi.fn().mockResolvedValue(undefined);
    builder.update = vi.fn().mockResolvedValue(1);
    builder.delete = vi.fn().mockResolvedValue(1);
    builder.returning = vi.fn().mockResolvedValue([]);
    return builder;
  });
  db.raw = vi.fn((value: string) => value);
  db.fn = { now: () => new Date() };
  return db;
}

function makeEndpointRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "ep-1",
    owner_address: "GABC",
    url: "https://hooks.example.com/alerts",
    name: "Test Endpoint",
    description: null,
    secret: "test-secret-value",
    secret_rotated_at: null,
    is_active: true,
    rate_limit_per_minute: 60,
    custom_headers: "{}",
    filter_event_types: "[]",
    is_batch_delivery_enabled: false,
    batch_window_ms: 5000,
    retry_backoff_multiplier: 2,
    retry_max_delay_ms: 3_600_000,
    retry_jitter_ratio: 0.2,
    consecutive_failures: 0,
    circuit_breaker_status: "closed",
    circuit_breaker_tripped_at: null,
    circuit_breaker_reset_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

describe("webhookDelivery worker — HMAC signing & SSRF protection on the real delivery path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function setupWorkerWithEndpoint(endpointRow: Record<string, unknown>) {
    (global as any).fetch = mocks.fetchMock;
    vi.resetModules();
    vi.doMock("../../src/database/connection.js", () => ({
      getDatabase: () => createFakeDb(endpointRow),
    }));
    vi.doMock("node:dns/promises", () => ({ lookup: mocks.dnsLookup }));

    const mod = await import("../../src/workers/webhookDelivery.worker.js");
    await mod.initWebhookWorker();
    return mod.getWebhookWorker() as any;
  }

  it("attaches a valid HMAC-SHA256 signature header to the outgoing webhook request", async () => {
    mocks.dnsLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    mocks.fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => "OK" });

    const worker = await setupWorkerWithEndpoint(makeEndpointRow());

    await worker.processor(makeJob(0));

    expect(mocks.fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, options] = mocks.fetchMock.mock.calls[0];
    expect(calledUrl).toBe("https://hooks.example.com/alerts");

    const headers = options.headers as Record<string, string>;
    expect(headers["X-Webhook-Event-Id"]).toBeDefined();
    expect(headers["Content-Type"]).toBe("application/json");

    // Recompute the HMAC independently to prove this is a genuine signature
    // over the exact request body and timestamp, not a stubbed value.
    const timestamp = headers["X-Webhook-Timestamp"];
    const expectedSignature = createHmac("sha256", "test-secret-value")
      .update(`${timestamp}.${JSON.stringify({ foo: "bar" })}`)
      .digest("hex");
    expect(headers["X-Webhook-Signature"]).toBe(expectedSignature);
  });

  it("rejects delivery to a private/internal address before making any outbound request", async () => {
    const worker = await setupWorkerWithEndpoint(makeEndpointRow({ url: "http://127.0.0.1:8080/hook" }));

    await expect(worker.processor(makeJob(0))).rejects.toThrow(/public address/);
    expect(mocks.fetchMock).not.toHaveBeenCalled();
  });

  it("rejects delivery when a hostname resolves to a private address (DNS-rebinding style SSRF)", async () => {
    mocks.dnsLookup.mockResolvedValue([{ address: "10.0.0.5", family: 4 }]);
    const worker = await setupWorkerWithEndpoint(makeEndpointRow());

    await expect(worker.processor(makeJob(0))).rejects.toThrow(/public address/);
    expect(mocks.fetchMock).not.toHaveBeenCalled();
  });
});
