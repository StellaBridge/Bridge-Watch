import { Queue, Worker, Job, ConnectionOptions } from "bullmq";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";

const QUEUE_NAME = "backfill";
const connection: ConnectionOptions = {
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
  password: config.REDIS_PASSWORD || undefined,
};

export class BackfillQueue {
  private static instance: BackfillQueue;
  public queue: Queue;
  private worker: Worker | null = null;

  private constructor() {
    this.queue = new Queue(QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: config.RETRY_MAX || 3,
        backoff: {
          type: "exponential",
          delay: 1000,
        },
        removeOnComplete: {
          age: 3600,
          count: 1000,
        },
        removeOnFail: {
          age: 86400,
        },
      },
    });

    logger.info({ queueName: QUEUE_NAME }, "Backfill queue initialized");
  }

  public static getInstance(): BackfillQueue {
    if (!BackfillQueue.instance) {
      BackfillQueue.instance = new BackfillQueue();
    }
    return BackfillQueue.instance;
  }

  public async addJob(name: string, data: unknown, options: Record<string, unknown> = {}) {
    logger.info({ jobName: name, options }, "Enqueuing backfill job");
    return this.queue.add(name, data, options);
  }

  public initWorker(
    processor: (job: Job) => Promise<void>,
    onFailed?: (job: Job, error: Error) => Promise<void>,
  ): void {
    if (this.worker) {
      logger.warn("Backfill worker already initialized");
      return;
    }

    this.worker = new Worker(
      QUEUE_NAME,
      processor,
      {
        connection,
        concurrency: config.BACKFILL_QUEUE_CONCURRENCY,
      },
    );

    this.worker.on("completed", (job: Job) => {
      logger.info({ jobId: job.id, jobName: job.name }, "Backfill job completed");
    });

    this.worker.on("failed", async (job: Job | undefined, err: Error) => {
      logger.error({ jobId: job?.id, jobName: job?.name, error: err.message }, "Backfill job failed");
      if (job && onFailed) {
        await onFailed(job, err);
      }
    });
  }

  public async stop(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
      logger.info("Backfill worker stopped");
    }

    await this.queue.close();
    logger.info("Backfill queue closed");
  }
}

export function getBackfillQueue(): BackfillQueue {
  return BackfillQueue.getInstance();
}
