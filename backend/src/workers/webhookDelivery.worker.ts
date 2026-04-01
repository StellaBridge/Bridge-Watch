import { Worker, Job } from "bullmq";
import { ConnectionOptions } from "bullmq";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";
import { webhookService } from "../services/webhook.service.js";

// =============================================================================
// WEBHOOK DELIVERY WORKER
// =============================================================================

const WEBHOOK_QUEUE_NAME = "webhook-delivery";

const webhookConnection: ConnectionOptions = {
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
  password: config.REDIS_PASSWORD,
};

// Retry delays for backoff (in ms)
const RETRY_DELAYS = [1000, 5000, 15000, 60000, 300000, 900000, 3600000];
const MAX_RETRY_ATTEMPTS = 7;

let webhookWorker: Worker | null = null;

export async function initWebhookWorker(): Promise<void> {
  if (webhookWorker) {
    logger.warn("Webhook worker already initialized");
    return;
  }

  webhookWorker = new Worker(
    WEBHOOK_QUEUE_NAME,
    async (job: Job) => {
      logger.info(
        { jobId: job.id, attempt: job.attemptsMade + 1 },
        "Processing webhook delivery"
      );

      try {
        const result = await webhookService.processDelivery(job);
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";

        // Calculate next retry delay
        const delayIndex = Math.min(job.attemptsMade, RETRY_DELAYS.length - 1);
        const delay = RETRY_DELAYS[delayIndex];

        logger.error(
          { jobId: job.id, attempt: job.attemptsMade + 1, error: errorMessage, nextRetryIn: delay },
          "Webhook delivery failed, will retry"
        );

        // Throw error to trigger BullMQ retry with backoff
        throw new Error(`Webhook delivery failed: ${errorMessage}`);
      }
    },
    {
      connection: webhookConnection,
      concurrency: 10, // Process up to 10 deliveries concurrently
      limiter: {
        max: 100, // Max 100 jobs per second across all endpoints
        duration: 1000,
      },
    }
  );

  // Event handlers
  webhookWorker.on("completed", (job: Job) => {
    logger.info(
      { jobId: job.id, webhookEndpointId: job.data.webhookEndpointId },
      "Webhook delivery job completed"
    );
  });

  webhookWorker.on("failed", async (job: Job | undefined, err: Error) => {
    if (!job) return;

    const errorMessage = err.message;

    // Check if we've exceeded max attempts
    if (job.attemptsMade >= MAX_RETRY_ATTEMPTS) {
      logger.error(
        { jobId: job.id, webhookEndpointId: job.data.webhookEndpointId, attempts: job.attemptsMade },
        "Webhook delivery failed permanently after max retries"
      );

      // Update delivery status to failed
      try {
        const { webhookService } = await import("../services/webhook.service.js");
        await webhookService.updateDeliveryStatus(job.data.deliveryId, "failed", undefined, errorMessage);
      } catch (updateError) {
        logger.error({ jobId: job.id }, "Failed to update delivery status after max retries");
      }
    }
  });

  webhookWorker.on("error", (err: Error) => {
    logger.error({ error: err.message }, "Webhook worker error");
  });

  webhookWorker.on("stalled", (jobId: string) => {
    logger.warn({ jobId }, "Webhook delivery job stalled");
  });

  logger.info("Webhook delivery worker initialized");
}

export async function stopWebhookWorker(): Promise<void> {
  if (webhookWorker) {
    await webhookWorker.close();
    webhookWorker = null;
    logger.info("Webhook delivery worker stopped");
  }
}

export function getWebhookWorker(): Worker | null {
  return webhookWorker;
}
