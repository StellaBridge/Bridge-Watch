import crypto from "crypto";
import { getDatabase } from "../database/connection.js";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";
import { ingestionWatermarkCoordinator } from "./ingestionWatermarkCoordinator.service.js";
import { queueFairnessService, initDRRState, drrNextLane, type LaneName } from "./queueFairness.service.js";

export type IngestionJobType = "alert" | "event" | "metric";

export enum JobPriority {
  LOW = 1,
  MEDIUM = 2,
  HIGH = 3,
  CRITICAL = 4,
}

export interface IngestionJobPayload {
  [key: string]: unknown;
}

export interface IngestionJob {
  id: string;
  type: IngestionJobType;
  priority: JobPriority;
  payload: IngestionJobPayload;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  updatedAt: Date;
  nextRetryAt: Date | null;
  status: "pending" | "processing" | "failed" | "completed";
}

export interface IngestionMetrics {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  deadLetter: number;
}

export interface UnconfirmedEvent {
  id: string;
  sourceChain: string;
  eventType: string;
  payload: Record<string, unknown>;
  txHash: string;
  ledgerSequence: number;
  observedLedger: number;
  confirmations: number;
  requiredConfirmations: number;
  isConfirmed: boolean;
  isRolledBack: boolean;
}

const MIN_CONFIRMATIONS: Record<string, number> = {
  stellar: config.INGESTION_MIN_CONFIRMATIONS_STELLAR,
  ethereum: config.INGESTION_MIN_CONFIRMATIONS_ETHEREUM,
  polygon: config.INGESTION_MIN_CONFIRMATIONS_POLYGON,
  base: config.INGESTION_MIN_CONFIRMATIONS_BASE,
};

function getRequiredConfirmations(chain: string): number {
  return MIN_CONFIRMATIONS[chain] ?? 3;
}

export class IngestionQueueManager {
  private static instance: IngestionQueueManager;

  private readonly concurrencyLimit: number;
  private processingCount = 0;

  private constructor(concurrencyLimit: number = 5) {
    this.concurrencyLimit = concurrencyLimit;
  }

  public static getInstance(): IngestionQueueManager {
    if (!IngestionQueueManager.instance) {
      IngestionQueueManager.instance = new IngestionQueueManager();
    }
    return IngestionQueueManager.instance;
  }

  public async enqueueJob(params: {
    type: IngestionJobType;
    priority?: JobPriority;
    payload: IngestionJobPayload;
    maxAttempts?: number;
  }): Promise<IngestionJob> {
    const db = getDatabase();
    const now = new Date();
    const job: IngestionJob = {
      id: crypto.randomUUID(),
      type: params.type,
      priority: params.priority ?? JobPriority.MEDIUM,
      payload: params.payload,
      attempts: 0,
      maxAttempts: params.maxAttempts ?? 3,
      createdAt: now,
      updatedAt: now,
      nextRetryAt: null,
      status: "pending",
    };

    await db("ingestion_jobs").insert({
      id: job.id,
      type: job.type,
      priority: job.priority,
      payload: JSON.stringify(job.payload),
      attempts: job.attempts,
      max_attempts: job.maxAttempts,
      created_at: now,
      updated_at: now,
      next_retry_at: null,
      status: job.status,
    });
    logger.info({ jobId: job.id }, "Ingestion job enqueued");
    return job;
  }

  public async processPendingJobs(): Promise<void> {
    if (this.processingCount >= this.concurrencyLimit) {
      return;
    }

    const db = getDatabase();
    const pendingJobs = await db("ingestion_jobs")
      .where({ status: "pending" })
      .orWhere(function () {
        this.where({ status: "failed" })
          .where("attempts", "<", db.raw("max_attempts"))
          .where((qb: any) => {
            qb.where("next_retry_at", "<=", new Date()).orWhereNull("next_retry_at");
          });
      })
      .orderBy([{ column: "priority", order: "desc" }, { column: "created_at", order: "asc" }])
      .limit(this.concurrencyLimit - this.processingCount);

    for (const row of pendingJobs) {
      this.processingCount++;
      this.handleJob(row).finally(() => {
        this.processingCount--;
      });
    }
  }

  /**
   * Fair scheduling: uses Deficit Round Robin with minimum share guarantees
   * to prevent starvation of lower-priority lanes while still preferring
   * higher-priority work proportionally.
   */
  public async processPendingJobsFair(): Promise<void> {
    if (this.processingCount >= this.concurrencyLimit) {
      return;
    }

    const db = getDatabase();
    const availableSlots = this.concurrencyLimit - this.processingCount;

    // Map JobPriority to lane names
    const priorityToLane: Record<number, LaneName> = {
      4: "critical", // CRITICAL
      3: "high",     // HIGH
      2: "medium",   // MEDIUM
      1: "low",      // LOW
    };

    // Get counts per lane
    const laneCounts: Record<LaneName, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const [priority, lane] of Object.entries(priorityToLane)) {
      const count = await db("ingestion_jobs")
        .where({ status: "pending" })
        .andWhere({ priority: Number(priority) })
        .count("id as cnt")
        .first();
      laneCounts[lane] = Number(count?.cnt ?? 0);
    }

    // Also include retryable failed jobs
    for (const [priority, lane] of Object.entries(priorityToLane)) {
      const count = await db("ingestion_jobs")
        .where({ status: "failed" })
        .andWhere({ priority: Number(priority) })
        .andWhere("attempts", "<", db.raw("max_attempts"))
        .andWhere((qb: any) => {
          qb.where("next_retry_at", "<=", new Date()).orWhereNull("next_retry_at");
        })
        .count("id as cnt")
        .first();
      laneCounts[lane] += Number(count?.cnt ?? 0);
    }

    // Initialize or get DRR state (in production, persist this)
    const drrState = initDRRState(1);
    const policies = await queueFairnessService.getAllPolicies();

    // Plan which lanes to serve using DRR
    const plan: LaneName[] = [];
    for (let i = 0; i < availableSlots; i++) {
      const lane = drrNextLane(drrState, laneCounts, policies);
      plan.push(lane);
      // Decrement the virtual depth so we don't over-plan
      if (laneCounts[lane] > 0) laneCounts[lane]--;
    }

    // Execute the plan
    for (const lane of plan) {
      const priority = Object.entries(priorityToLane).find(([, l]) => l === lane)?.[0];
      if (!priority) continue;

      const row = await db("ingestion_jobs")
        .where({ status: "pending" })
        .andWhere({ priority: Number(priority) })
        .orderBy("created_at", "asc")
        .first();

      if (!row) {
        // Check retryable failed
        const retryRow = await db("ingestion_jobs")
          .where({ status: "failed" })
          .andWhere({ priority: Number(priority) })
          .andWhere("attempts", "<", db.raw("max_attempts"))
          .andWhere((qb: any) => {
            qb.where("next_retry_at", "<=", new Date()).orWhereNull("next_retry_at");
          })
          .orderBy("created_at", "asc")
          .first();

        if (retryRow) {
          this.processingCount++;
          this.handleJob(retryRow).finally(() => this.processingCount--);
        }
        continue;
      }

      this.processingCount++;
      this.handleJob(row).finally(() => this.processingCount--);
    }
  }

  private async handleJob(row: any): Promise<void> {
    const db = getDatabase();
    const jobId = row.id;
    try {
      await db("ingestion_jobs")
        .where({ id: jobId })
        .update({ status: "processing", updated_at: new Date() });

      await this.processJobLogic(row);

      await db("ingestion_jobs")
        .where({ id: jobId })
        .update({ status: "completed", updated_at: new Date() });
      logger.info({ jobId }, "Ingestion job completed");
    } catch (err) {
      const attempts = (row.attempts ?? 0) + 1;
      const maxAttempts = row.max_attempts ?? 3;
      const nextRetry = attempts < maxAttempts ? this.calculateBackoff(attempts) : null;

      await db("ingestion_jobs")
        .where({ id: jobId })
        .update({
          attempts,
          next_retry_at: nextRetry,
          status: "failed",
          updated_at: new Date(),
        });

      logger.error({ jobId, err }, "Ingestion job processing failed");

      if (attempts >= maxAttempts) {
        await this.moveToDeadLetter(row);
      }
    }
  }

  private async processJobLogic(jobRow: any): Promise<void> {
    return;
  }

  public async bufferUnconfirmedEvent(params: {
    sourceChain: string;
    eventType: string;
    payload: Record<string, unknown>;
    txHash: string;
    ledgerSequence: number;
    currentLedger: number;
  }): Promise<UnconfirmedEvent> {
    const db = getDatabase();
    const required = getRequiredConfirmations(params.sourceChain);
    const confirmations = Math.max(0, params.currentLedger - params.ledgerSequence);

    const [row] = await db("unconfirmed_events")
      .insert({
        source_chain: params.sourceChain,
        event_type: params.eventType,
        payload: JSON.stringify(params.payload),
        tx_hash: params.txHash,
        ledger_sequence: params.ledgerSequence,
        observed_ledger: params.currentLedger,
        confirmations: confirmations,
        required_confirmations: required,
        is_confirmed: confirmations >= required,
        confirmed_at: confirmations >= required ? new Date() : null,
      })
      .onConflict(["tx_hash", "source_chain"])
      .merge({
        confirmations: confirmations,
        is_confirmed: confirmations >= required,
        confirmed_at: confirmations >= required ? new Date() : null,
        updated_at: new Date(),
      })
      .returning("*");

    // Publish durable source progress with finality separated from observation.
    // Downstream consumers can therefore wait for the confirmation boundary,
    // rather than treating a fast provider's wall-clock update as complete.
    await ingestionWatermarkCoordinator.publish({
      source: params.sourceChain,
      coveredThrough: params.currentLedger,
      finalizedThrough: Math.max(0, params.currentLedger - required),
      gaps: [],
    });

    if (confirmations >= required) {
      logger.info(
        { txHash: params.txHash, sourceChain: params.sourceChain, confirmations, required },
        "Event confirmed and ready for processing"
      );
    } else {
      logger.debug(
        { txHash: params.txHash, sourceChain: params.sourceChain, confirmations, required },
        "Event buffered awaiting confirmations"
      );
    }

    return this.mapUnconfirmedEvent(row);
  }

  public async checkConfirmationsAndProcess(): Promise<void> {
    const db = getDatabase();
    const now = new Date();
    const cutoff = new Date(now.getTime() - config.INGESTION_UNCONFIRMED_EVENT_TTL_MINUTES * 60 * 1000);

    const unconfirmed = await db("unconfirmed_events")
      .where({ is_confirmed: false, is_rolled_back: false })
      .where("observed_at", ">", cutoff);

    for (const event of unconfirmed) {
      const currentLedger = await this.getCurrentLedger(event.source_chain as string);
      if (currentLedger === null) continue;

      const eventLedger = Number(event.ledger_sequence);
      const confirmations = currentLedger - eventLedger;

      if (confirmations >= Number(event.required_confirmations)) {
        await db("unconfirmed_events")
          .where({ id: event.id })
          .update({
            confirmations,
            is_confirmed: true,
            confirmed_at: now,
            updated_at: now,
          });
        logger.info(
          { eventId: event.id, confirmations, required: event.required_confirmations },
          "Event reached required confirmations"
        );
      } else {
        await db("unconfirmed_events")
          .where({ id: event.id })
          .update({ confirmations: Math.max(0, confirmations), updated_at: now });
      }
    }
  }

  public async detectReorgAndRollback(): Promise<string[]> {
    const db = getDatabase();
    const now = new Date();
    const rollbackCutoff = new Date(now.getTime() - config.INGESTION_UNCONFIRMED_EVENT_TTL_MINUTES * 60 * 1000);
    const chainGroups = await db("unconfirmed_events")
      .where({ is_rolled_back: false })
      .where("observed_at", ">", rollbackCutoff)
      .select("source_chain")
      .distinct();

    const rolledBackEventIds: string[] = [];

    for (const group of chainGroups) {
      const chain = group.source_chain as string;
      const currentLedger = await this.getCurrentLedger(chain);
      if (currentLedger === null) continue;

      const confirmedEvents = await db("unconfirmed_events")
        .where({ source_chain: chain, is_confirmed: true, is_rolled_back: false })
        .where("ledger_sequence", ">", currentLedger - config.INGESTION_REORG_BUFFER_DEPTH)
        .select("ledger_sequence", "tx_hash", "id")
        .orderBy("ledger_sequence", "desc")
        .limit(50);

      for (const event of confirmedEvents) {
        const txStillValid = await this.checkTransactionOnChain(chain, event.tx_hash as string, Number(event.ledger_sequence));
        if (!txStillValid) {
          await db("unconfirmed_events")
            .where({ id: event.id })
            .update({
              is_rolled_back: true,
              is_confirmed: false,
              rolled_back_at: now,
              updated_at: now,
            });

          await db("ingestion_jobs")
            .where({ status: "pending" })
            .whereRaw("payload::jsonb @> ?", JSON.stringify({ txHash: event.tx_hash }))
            .delete();

          logger.warn(
            { eventId: event.id, txHash: event.tx_hash, chain },
            "Event rolled back due to re-org detection"
          );
          rolledBackEventIds.push(event.id as string);
        }
      }
    }

    if (rolledBackEventIds.length > 0) {
      logger.warn({ count: rolledBackEventIds.length }, "Re-org detected and rollback applied");
    }

    return rolledBackEventIds;
  }

  public async getMetrics(): Promise<IngestionMetrics> {
    const db = getDatabase();
    const [{ pending }, { processing }, { completed }, { failed }, { deadLetter }] = await Promise.all([
      db("ingestion_jobs").where({ status: "pending" }).count({ count: "*" }).first(),
      db("ingestion_jobs").where({ status: "processing" }).count({ count: "*" }).first(),
      db("ingestion_jobs").where({ status: "completed" }).count({ count: "*" }).first(),
      db("ingestion_jobs").where({ status: "failed" }).count({ count: "*" }).first(),
      db("dead_letter_jobs").count({ count: "*" }).first(),
    ]);
    return {
      pending: Number(pending?.count ?? 0),
      processing: Number(processing?.count ?? 0),
      completed: Number(completed?.count ?? 0),
      failed: Number(failed?.count ?? 0),
      deadLetter: Number(deadLetter?.count ?? 0),
    };
  }

  public async getUnconfirmedEventMetrics(): Promise<{
    total: number;
    pendingConfirmation: number;
    confirmed: number;
    rolledBack: number;
  }> {
    const db = getDatabase();
    const [total, pendingConfirmation, confirmed, rolledBack] = await Promise.all([
      db("unconfirmed_events").count({ count: "*" }).first(),
      db("unconfirmed_events").where({ is_confirmed: false, is_rolled_back: false }).count({ count: "*" }).first(),
      db("unconfirmed_events").where({ is_confirmed: true }).count({ count: "*" }).first(),
      db("unconfirmed_events").where({ is_rolled_back: true }).count({ count: "*" }).first(),
    ]);
    return {
      total: Number(total?.count ?? 0),
      pendingConfirmation: Number(pendingConfirmation?.count ?? 0),
      confirmed: Number(confirmed?.count ?? 0),
      rolledBack: Number(rolledBack?.count ?? 0),
    };
  }

  public async requeueDeadLetter(jobId: string): Promise<void> {
    const db = getDatabase();
    const deadJob = await db("dead_letter_jobs").where({ id: jobId }).first();
    if (!deadJob) {
      throw new Error(`Dead-letter job not found: ${jobId}`);
    }
    const now = new Date();
    await db("ingestion_jobs").insert({
      id: deadJob.id,
      type: deadJob.type,
      priority: deadJob.priority,
      payload: deadJob.payload,
      attempts: 0,
      max_attempts: deadJob.max_attempts ?? 3,
      created_at: deadJob.created_at,
      updated_at: now,
      next_retry_at: null,
      status: "pending",
    });
    await db("dead_letter_jobs").where({ id: jobId }).delete();
    logger.info({ jobId }, "Dead-letter job re-queued");
  }

  private calculateBackoff(attempt: number): Date {
    const baseDelayMs = 5_000;
    const delay = baseDelayMs * Math.pow(2, attempt - 1);
    const next = new Date();
    next.setTime(next.getTime() + delay);
    return next;
  }

  private async moveToDeadLetter(jobRow: any): Promise<void> {
    const db = getDatabase();
    await db("dead_letter_jobs").insert({
      id: jobRow.id,
      type: jobRow.type,
      priority: jobRow.priority,
      payload: jobRow.payload,
      attempts: jobRow.attempts,
      max_attempts: jobRow.max_attempts,
      error_message: jobRow.last_error ?? null,
      created_at: jobRow.created_at,
      failed_at: new Date(),
    });
    await db("ingestion_jobs").where({ id: jobRow.id }).delete();
    logger.warn({ jobId: jobRow.id }, "Job moved to dead-letter queue");
  }

  private mapUnconfirmedEvent(row: any): UnconfirmedEvent {
    return {
      id: row.id,
      sourceChain: row.source_chain,
      eventType: row.event_type,
      payload: typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload,
      txHash: row.tx_hash,
      ledgerSequence: Number(row.ledger_sequence),
      observedLedger: Number(row.observed_ledger),
      confirmations: Number(row.confirmations),
      requiredConfirmations: Number(row.required_confirmations),
      isConfirmed: row.is_confirmed,
      isRolledBack: row.is_rolled_back,
    };
  }

  private async getCurrentLedger(sourceChain: string): Promise<number | null> {
    try {
      const db = getDatabase();
      if (sourceChain === "stellar") {
        const result = await db("unconfirmed_events")
          .where({ source_chain: sourceChain })
          .max("observed_ledger as max_ledger")
          .first();
        const ledger = result?.max_ledger ? Number(result.max_ledger) : null;
        return ledger !== null ? ledger + 1 : null;
      }
      return null;
    } catch {
      return null;
    }
  }

  private async checkTransactionOnChain(chain: string, txHash: string, ledgerSequence: number): Promise<boolean> {
    try {
      const db = getDatabase();
      const existing = await db("unconfirmed_events")
        .where({ tx_hash: txHash, source_chain: chain, ledger_sequence: ledgerSequence, is_rolled_back: false })
        .first();
      return !!existing;
    } catch {
      return true;
    }
  }
}

export const ingestionQueueManager = IngestionQueueManager.getInstance();
