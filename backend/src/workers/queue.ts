import { Queue, Worker, Job, ConnectionOptions } from "bullmq";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";

const connection: ConnectionOptions = {
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
  password: config.REDIS_PASSWORD,
};

export const QUEUE_NAME = "bridge-watch-jobs";

export class JobQueue {
  private static instance: JobQueue;
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
        removeOnComplete: true,
        removeOnFail: false,
      },
    });
  }

  public static getInstance(): JobQueue {
    if (!JobQueue.instance) {
      JobQueue.instance = new JobQueue();
    }
    return JobQueue.instance;
  }

  public async addJob(name: string, data: unknown, options: Record<string, any> = {}) {
    logger.info({ jobName: name }, "Adding job to queue");
    return this.queue.add(name, data, options);
  }

  public async addRepeatableJob(name: string, data: unknown, cron: string) {
    logger.info({ jobName: name, cron }, "Scheduling repeatable job");
    return this.queue.add(name, data, {
      repeat: { pattern: cron },
    });
  }

  public initWorker(processor: (job: Job) => Promise<void>) {
    if (this.worker) return;

    this.worker = new Worker(QUEUE_NAME, processor, {
      connection,
      concurrency: 5,
    });

    this.worker.on("completed", (job: Job) => {
      logger.info({ jobId: job.id, jobName: job.name }, "Job completed successfully");
    });

    this.worker.on("failed", (job: Job | undefined, err: Error) => {
      logger.error({ jobId: job?.id, jobName: job?.name, error: err.message }, "Job failed");
    });
  }

  public async getJobCounts() {
    return this.queue.getJobCounts();
  }

  public async getFailedJobs() {
    return this.queue.getFailed(0, 100);
  }

  public async stop() {
    if (this.worker) {
      await this.worker.close();
    }
    await this.queue.close();
    logger.info("Job queue system shut down");
  }
}
