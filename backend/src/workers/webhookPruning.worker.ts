import { Worker, Job } from "bullmq";
import { ConnectionOptions } from "bullmq";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";
import { db } from "../database/db.js";

const WEBHOOK_PRUNING_QUEUE_NAME = "webhook-pruning";

const webhookPruningConnection: ConnectionOptions = {
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
  password: config.REDIS_PASSWORD,
};

const BATCH_SIZE = 5000;
const SUCCESS_RETENTION_DAYS = 30;
const FAILED_RETENTION_DAYS = 90;

let webhookPruningWorker: Worker | null = null;

interface PruningStats {
  successfulDeliveriesPruned: number;
  failedDeliveriesPruned: number;
  logsPruned: number;
  totalExecutionMs: number;
}

async function pruneWebhookDeliveries(): Promise<PruningStats> {
  const startTime = Date.now();
  const stats: PruningStats = {
    successfulDeliveriesPruned: 0,
    failedDeliveriesPruned: 0,
    logsPruned: 0,
    totalExecutionMs: 0,
  };

  try {
    logger.info("Starting webhook delivery pruning job");

    const successCutoff = new Date();
    successCutoff.setDate(successCutoff.getDate() - SUCCESS_RETENTION_DAYS);

    const failedCutoff = new Date();
    failedCutoff.setDate(failedCutoff.getDate() - FAILED_RETENTION_DAYS);

    let successfulBatchDeleted = 0;
    do {
      successfulBatchDeleted = await db("webhook_deliveries")
        .where("status", "delivered")
        .where("created_at", "<", successCutoff)
        .orderBy("created_at", "asc")
        .limit(BATCH_SIZE)
        .delete();

      stats.successfulDeliveriesPruned += successfulBatchDeleted;

      if (successfulBatchDeleted > 0) {
        logger.debug(
          { deleted: successfulBatchDeleted, total: stats.successfulDeliveriesPruned },
          "Pruned batch of successful webhook deliveries"
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    } while (successfulBatchDeleted === BATCH_SIZE);

    let failedBatchDeleted = 0;
    do {
      failedBatchDeleted = await db("webhook_deliveries")
        .whereIn("status", ["failed", "dead_letter"])
        .where("created_at", "<", failedCutoff)
        .orderBy("created_at", "asc")
        .limit(BATCH_SIZE)
        .delete();

      stats.failedDeliveriesPruned += failedBatchDeleted;

      if (failedBatchDeleted > 0) {
        logger.debug(
          { deleted: failedBatchDeleted, total: stats.failedDeliveriesPruned },
          "Pruned batch of failed webhook deliveries"
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    } while (failedBatchDeleted === BATCH_SIZE);

    let logsBatchDeleted = 0;
    do {
      logsBatchDeleted = await db("webhook_delivery_logs")
        .where("created_at", "<", failedCutoff)
        .orderBy("created_at", "asc")
        .limit(BATCH_SIZE)
        .delete();

      stats.logsPruned += logsBatchDeleted;

      if (logsBatchDeleted > 0) {
        logger.debug(
          { deleted: logsBatchDeleted, total: stats.logsPruned },
          "Pruned batch of webhook delivery logs"
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    } while (logsBatchDeleted === BATCH_SIZE);

    stats.totalExecutionMs = Date.now() - startTime;

    logger.info(
      {
        successfulDeliveriesPruned: stats.successfulDeliveriesPruned,
        failedDeliveriesPruned: stats.failedDeliveriesPruned,
        logsPruned: stats.logsPruned,
        executionTimeMs: stats.totalExecutionMs,
      },
      "Webhook delivery pruning completed"
    );

    return stats;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error({ error: errorMessage }, "Webhook delivery pruning failed");
    throw error;
  }
}

export async function initWebhookPruningWorker(): Promise<void> {
  if (webhookPruningWorker) {
    logger.warn("Webhook pruning worker already initialized");
    return;
  }

  webhookPruningWorker = new Worker(
    WEBHOOK_PRUNING_QUEUE_NAME,
    async (job: Job) => {
      logger.info({ jobId: job.id }, "Starting webhook pruning job");

      try {
        const stats = await pruneWebhookDeliveries();

        return {
          success: true,
          ...stats,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        logger.error({ jobId: job.id, error: errorMessage }, "Webhook pruning job failed");
        throw error;
      }
    },
    {
      connection: webhookPruningConnection,
      concurrency: 1,
    }
  );

  webhookPruningWorker.on("completed", (job: Job, result: any) => {
    logger.info(
      {
        jobId: job.id,
        successfulDeliveriesPruned: result.successfulDeliveriesPruned,
        failedDeliveriesPruned: result.failedDeliveriesPruned,
        logsPruned: result.logsPruned,
        executionTimeMs: result.totalExecutionMs,
      },
      "Webhook pruning job completed"
    );
  });

  webhookPruningWorker.on("failed", (job: Job | undefined, error: Error) => {
    logger.error(
      { jobId: job?.id, error: error.message },
      "Webhook pruning job failed"
    );
  });

  logger.info("Webhook pruning worker initialized");
}

export async function shutdownWebhookPruningWorker(): Promise<void> {
  if (webhookPruningWorker) {
    logger.info("Shutting down webhook pruning worker");
    await webhookPruningWorker.close();
    webhookPruningWorker = null;
  }
}

export { WEBHOOK_PRUNING_QUEUE_NAME };
