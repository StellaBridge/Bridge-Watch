import { OutboxProducer } from "../outbox/eventProducer.js";
import { getDatabase } from "../database/connection.js";
import { distributedLockService } from "../services/distributedLock.service.js";
import { logger } from "../utils/logger.js";

// Sweep interval for the redrive job (~5 min default)
const REDRIVE_INTERVAL_MS = Number(process.env.OUTBOX_DLQ_REDRIVE_INTERVAL_MS) || 300_000;
// Maximum number of DLQ rows inspected per sweep
const REDRIVE_BATCH_SIZE = Number(process.env.OUTBOX_DLQ_REDRIVE_BATCH_SIZE) || 50;
// Base delay before the first redrive attempt (issue #1260)
const BASE_DELAY_MS = Number(process.env.OUTBOX_DLQ_REDRIVE_BASE_DELAY_MS) || 60_000;
// Ceiling on the backoff delay
const MAX_DELAY_MS = Number(process.env.OUTBOX_DLQ_REDRIVE_MAX_DELAY_MS) || 3_600_000;
// ±20% jitter applied to every backoff delay
const JITTER_RATIO = 0.2;

let redriveInterval: NodeJS.Timeout | null = null;

/**
 * Exponential backoff delay before a dead-lettered event is re-driven,
 * grown by the event's cumulative error count and jittered ±20% so a
 * storm of poisoned events does not redrive in lockstep (issue #1260).
 */
export function nextRedriveDelayMs(errorCount: number, random: () => number = Math.random): number {
  const delay = Math.min(BASE_DELAY_MS * Math.pow(2, Math.max(0, errorCount)), MAX_DELAY_MS);
  const jitter = delay * JITTER_RATIO;
  return Math.max(0, Math.round(delay + (random() * 2 - 1) * jitter));
}

export interface OutboxDlqRedriveResult {
  inspected: number;
  redriven: number;
  released: number;
}

/**
 * Automatic DLQ redrive sweep (issue #1260).
 *
 * For each dead-lettered event:
 *  - when its outbox row was finally delivered after a redrive, the DLQ
 *    row is released (deleted);
 *  - when the outbox row is pending/processing, nothing is done — the
 *    re-enqueued event is still working through its retry budget;
 *  - once the exponential backoff since `last_attempt` has elapsed, the
 *    event is re-enqueued (outbox row back to `pending`, retry budget
 *    reset) and the DLQ row's `last_attempt` moves forward so the next
 *    eligible redrive waits the (longer) backoff again.
 */
export async function runOutboxDlqRedriveJob(): Promise<OutboxDlqRedriveResult> {
  const producer = new OutboxProducer(getDatabase());
  const { events } = await producer.getDeadLetterEvents(REDRIVE_BATCH_SIZE, 0);

  const result: OutboxDlqRedriveResult = { inspected: events.length, redriven: 0, released: 0 };

  for (const event of events) {
    const outboxStatus = await producer.getOutboxStatusForDeadLetter(event.id);

    // The re-enqueued event was delivered — release its DLQ row.
    if (outboxStatus === "delivered") {
      await producer.releaseDeadLetter(event.id);
      result.released += 1;
      continue;
    }

    // Already working through a retry budget after a previous redrive.
    if (outboxStatus === "pending" || outboxStatus === "processing") {
      continue;
    }

    const dueAt = new Date(event.lastAttempt.getTime() + nextRedriveDelayMs(event.errorCount));
    if (dueAt.getTime() > Date.now()) {
      continue;
    }

    const redriven = await producer.redriveDeadLetter(event.id);
    if (redriven) {
      result.redriven += 1;
    }
  }

  logger.info(
    { inspected: result.inspected, redriven: result.redriven, released: result.released },
    "Outbox DLQ redrive sweep complete"
  );

  return result;
}

const LOCK_KEY = "outbox-dlq-redrive-sweep";

function runLocked(): Promise<unknown> {
  return distributedLockService.withLock(LOCK_KEY, REDRIVE_INTERVAL_MS, runOutboxDlqRedriveJob);
}

export function startOutboxDlqRedriveJob(): void {
  logger.info({ intervalMs: REDRIVE_INTERVAL_MS }, "Starting outbox DLQ redrive job");

  redriveInterval = setInterval(() => {
    runLocked().catch((err) => {
      logger.error({ error: err }, "Scheduled outbox DLQ redrive sweep failed");
    });
  }, REDRIVE_INTERVAL_MS);
}

export function stopOutboxDlqRedriveJob(): void {
  if (redriveInterval) {
    clearInterval(redriveInterval);
    redriveInterval = null;
    logger.info("Stopped outbox DLQ redrive job");
  }
}
