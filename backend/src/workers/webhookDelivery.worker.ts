import { Worker, Job } from "bullmq";
import { ConnectionOptions } from "bullmq";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";
import { webhookService, computeRetryDelay } from "../services/webhook.service.js";
import { retryPolicyService } from "../services/retryPolicy.service.js";

// =============================================================================
// WEBHOOK DELIVERY WORKER
// =============================================================================

const WEBHOOK_QUEUE_NAME = "webhook-delivery";

const webhookConnection: ConnectionOptions = {
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
  password: config.REDIS_PASSWORD,
};

const WEBHOOK_RETRY_POLICY = retryPolicyService.getPolicy({
  operation: "webhook:delivery",
  maxRetries: 7,
  baseDelayMs: 1000,
  maxDelayMs: 3_600_000,
});

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

        // Record success — resets the consecutive failure counter
        try {
          await webhookService.recordSuccess(job.data.webhookEndpointId);
        } catch (cbError) {
          logger.error(
            { jobId: job.id, error: cbError instanceof Error ? cbError.message : String(cbError) },
            "Failed to record webhook success for circuit breaker"
          );
        }

        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";

        // Compute endpoint-specific retry delay for observability
        let delay = retryPolicyService.getDelayMs(job.attemptsMade + 1, {
          operation: "webhook:delivery",
          ...WEBHOOK_RETRY_POLICY,
        });

        try {
          const endpoint = await webhookService.getEndpoint(job.data.webhookEndpointId);
          if (endpoint) {
            delay = webhookService.getRetryDelayMs(job.attemptsMade + 1, endpoint);
          }
        } catch {
          // Fall back to default policy if endpoint lookup fails
        }

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
    let maxRetries = WEBHOOK_RETRY_POLICY.maxRetries;
    try {
      const endpoint = await webhookService.getEndpoint(job.data.webhookEndpointId);
      if (endpoint) {
        maxRetries = endpoint.retryMaxAttempts;
      }
    } catch {
      // Fall back to default
    }

    if (job.attemptsMade >= maxRetries) {
      logger.error(
        { jobId: job.id, webhookEndpointId: job.data.webhookEndpointId, attempts: job.attemptsMade },
        "Webhook delivery failed permanently after max retries"
      );

      // Update delivery status to failed
      try {
        const { webhookService: svc } = await import("../services/webhook.service.js");
        await svc.updateDeliveryStatus(job.data.deliveryId, "failed", undefined, errorMessage);
      } catch (updateError) {
        logger.error({ jobId: job.id }, "Failed to update delivery status after max retries");
      }

      // Record failure for circuit breaker tracking
      try {
        const { webhookService: svc } = await import("../services/webhook.service.js");
        await svc.recordFailure(job.data.webhookEndpointId);
      } catch (cbError) {
        logger.error(
          { jobId: job.id, error: cbError instanceof Error ? cbError.message : String(cbError) },
          "Failed to record webhook failure for circuit breaker"
        );
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
