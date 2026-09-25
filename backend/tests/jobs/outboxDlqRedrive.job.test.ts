import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  nextRedriveDelayMs,
  runOutboxDlqRedriveJob,
} from "../../src/jobs/outboxDlqRedrive.job.js";

vi.mock("../../src/utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../src/database/connection.js", () => ({
  getDatabase: () => vi.fn(),
}));

vi.mock("../../src/services/distributedLock.service.js", () => ({
  distributedLockService: {
    withLock: vi.fn(),
  },
}));

const dlqRows: Array<Record<string, unknown>> = [];
const outboxStatuses = new Map<string, string>();

const redriveCalls: string[] = [];
const releaseCalls: string[] = [];

vi.mock("../../src/outbox/eventProducer.js", () => {
  return {
    OutboxProducer: class {
      async getDeadLetterEvents(limit: number) {
        return { events: dlqRows.slice(0, limit), total: dlqRows.length, hasMore: false };
      }
      async getOutboxStatusForDeadLetter(id: string) {
        return outboxStatuses.get(id) ?? null;
      }
      async redriveDeadLetter(id: string) {
        redriveCalls.push(id);
        return true;
      }
      async releaseDeadLetter(id: string) {
        releaseCalls.push(id);
      }
    },
  };
});

const deadLetterRow = (id: string, errorCount: number, minutesSinceLastAttempt: number) => ({
  id,
  outbox_id: `outbox-${id}`,
  event_type: "webhook.delivery",
  aggregate_id: "aggregate-1",
  payload: { value: "poisoned" },
  error_count: errorCount,
  last_error: "boom",
  last_attempt: new Date(Date.now() - minutesSinceLastAttempt * 60_000),
  created_at: new Date(Date.now() - 60 * 60_000),
});

describe("nextRedriveDelayMs", () => {
  it("doubles the delay with each cumulative error count", () => {
    const noJitter = () => 0.5;
    expect(nextRedriveDelayMs(0, noJitter)).toBe(60_000);
    expect(nextRedriveDelayMs(1, noJitter)).toBe(120_000);
    expect(nextRedriveDelayMs(2, noJitter)).toBe(240_000);
  });

  it("caps the delay at one hour", () => {
    expect(nextRedriveDelayMs(20, () => 0.5)).toBeLessThanOrEqual(3_600_000);
  });

  it("applies at most ±20% jitter", () => {
    expect(nextRedriveDelayMs(0, () => 1)).toBe(72_000);
    expect(nextRedriveDelayMs(0, () => 0)).toBe(48_000);
  });
});

describe("runOutboxDlqRedriveJob", () => {
  beforeEach(() => {
    dlqRows.length = 0;
    outboxStatuses.clear();
    redriveCalls.length = 0;
    releaseCalls.length = 0;
  });

  it("releases DLQ rows whose linked outbox event was delivered", async () => {
    dlqRows.push(deadLetterRow("dlq-1", 5, 30));
    outboxStatuses.set("dlq-1", "delivered");

    const result = await runOutboxDlqRedriveJob();

    expect(result.released).toBe(1);
    expect(result.redriven).toBe(0);
    expect(releaseCalls).toEqual(["dlq-1"]);
    expect(redriveCalls).toEqual([]);
  });

  it("skips events still working through their retry budget", async () => {
    dlqRows.push(deadLetterRow("dlq-2", 5, 0));
    outboxStatuses.set("dlq-2", "pending");

    const result = await runOutboxDlqRedriveJob();

    expect(result.redriven).toBe(0);
    expect(redriveCalls).toEqual([]);
  });

  it("waits for the exponential backoff before redriving", async () => {
    // First redrive: base delay 60s, so a DLQ row aged 30s is not due.
    dlqRows.push(deadLetterRow("dlq-3", 1, 0.5));
    outboxStatuses.set("dlq-3", "dead_letter");

    const result = await runOutboxDlqRedriveJob();

    expect(result.redriven).toBe(0);
    expect(redriveCalls).toEqual([]);
  });

  it("re-enqueues due events and keeps the DLQ row as an audit trail", async () => {
    // error_count 1 -> delay 120s; row aged 10 minutes is due.
    dlqRows.push(deadLetterRow("dlq-4", 1, 10));
    outboxStatuses.set("dlq-4", "dead_letter");

    const result = await runOutboxDlqRedriveJob();

    expect(result.redriven).toBe(1);
    expect(redriveCalls).toEqual(["dlq-4"]);
    expect(releaseCalls).toEqual([]);
  });
});
