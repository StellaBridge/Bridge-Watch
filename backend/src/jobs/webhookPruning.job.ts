import { Queue, QueueScheduler } from "bullmq";
import { ConnectionOptions } from "bullmq";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";
import { WEBHOOK_PRUNING_QUEUE_NAME } from "../workers/webhookPruning.worker.js";

const webhookPruningConnection: ConnectionOptions = {
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
  password: config.REDIS_PASSWORD,
};

let webhookPruningQueue: Queue | null = null;
let webhookPruningScheduler: QueueScheduler | null = null;

export async function initWebhookPruningJob(): Promise<void> {
  try {
    webhookPruningScheduler = new QueueScheduler(WEBHOOK_PRUNING_QUEUE_NAME, {
      connection: webhookPruningConnection,
    });

    webhookPruningQueue = new Queue(WEBHOOK_PRUNING_QUEUE_NAME, {
      connection: webhookPruningConnection,
    });

    await webhookPruningQueue.add(
      "prune-webhook-deliveries",
      {},
      {
        repeat: {
          pattern: "0 2 * * *",
        },
        jobId: "webhook-pruning-daily",
      }
    );

    logger.info("Webhook pruning job scheduled (daily at 02:00 UTC)");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error({ error: errorMessage }, "Failed to initialize webhook pruning job");
    throw error;
  }
}

export async function shutdownWebhookPruningJob(): Promise<void> {
  if (webhookPruningQueue) {
    await webhookPruningQueue.close();
    webhookPruningQueue = null;
  }

  if (webhookPruningScheduler) {
    await webhookPruningScheduler.close();
    webhookPruningScheduler = null;
  }

  logger.info("Webhook pruning job scheduler shut down");
}

export async function triggerWebhookPruning(): Promise<void> {
  if (!webhookPruningQueue) {
    throw new Error("Webhook pruning queue not initialized");
  }

  await webhookPruningQueue.add("prune-webhook-deliveries-manual", {}, {
    jobId: `webhook-pruning-manual-${Date.now()}`,
  });

  logger.info("Manual webhook pruning job triggered");
}
