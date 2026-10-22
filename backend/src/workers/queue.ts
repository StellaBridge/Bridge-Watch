import { Queue, Worker, Job } from "bullmq";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";
import { retryPolicyService } from "../services/retryPolicy.service.js";
import { RedisClientFactory } from "../config/redis.js";
import { queueFairnessService, DEFAULT_LANE_POLICIES, type LaneName } from "../services/queueFairness.service.js";

const factory = RedisClientFactory.getInstance();
const connection = factory.getBullMQConnection();

export const QUEUE_NAME = "bridge-watch-jobs";
export type Priority = "critical" | "high" | "medium" | "low";

// Queue concurrency configuration - loaded from config with env var fallbacks
const QUEUE_CONCURRENCY_CONFIG = {
  bridgeTransaction: config.QUEUE_CONCURRENCY_BRIDGE_TRANSACTION,
  priceAggregator: config.QUEUE_CONCURRENCY_PRICE_AGGREGATOR,
  analyticsAggregation: config.QUEUE_CONCURRENCY_ANALYTICS_AGGREGATION,
  webhookDelivery: config.QUEUE_CONCURRENCY_WEBHOOK_DELIVERY,
  default: config.QUEUE_CONCURRENCY_DEFAULT,
};

const LANE_CONCURRENCY: Record<Priority, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
};

export class JobQueue {
  private static instance: JobQueue;
  private queues: Record<string, Queue> = {};
  private workers: Record<Priority, Worker> = {} as Record<Priority, Worker>;

  private constructor() {
    const retryPolicy = retryPolicyService.getPolicy({ operation: "queue:default" });

    const priorities: Priority[] = ["critical", "high", "medium", "low"];
    for (const p of priorities) {
      const qname = `${QUEUE_NAME}-${p}`;
      this.queues[qname] = new Queue(qname, {
        connection,
        defaultJobOptions: {
          attempts: retryPolicy.maxRetries + 1,
          backoff: retryPolicyService.getBullMQBackoff({ operation: "queue:default" }),
          removeOnComplete: true,
          removeOnFail: false,
        },
        limiter: {
          max: Number(process.env[`QUEUE_RATE_MAX_${p.toUpperCase()}`] || 1000),
          duration: Number(process.env[`QUEUE_RATE_DURATION_MS_${p.toUpperCase()}`] || 1000),
        },
      } as any);
    }
  }

  public static getInstance(): JobQueue {
    if (!JobQueue.instance) {
      JobQueue.instance = new JobQueue();
    }
    return JobQueue.instance;
  }

  private queueForPriority(priority?: Priority) {
    const p: Priority = priority || "medium";
    return this.queues[`${QUEUE_NAME}-${p}`];
  }

  /**
   * Get or create a specific named queue with its configured concurrency.
   * Used for specialized queues like bridgeTransaction, priceAggregator, etc.
   */
  private getOrCreateNamedQueue(queueType: keyof typeof QUEUE_CONCURRENCY_CONFIG): Queue {
    const qname = `${QUEUE_NAME}-${queueType}`;
    if (!this.queues[qname]) {
      const concurrency = QUEUE_CONCURRENCY_CONFIG[queueType] ?? QUEUE_CONCURRENCY_CONFIG.default;
      const retryPolicy = retryPolicyService.getPolicy({ operation: "queue:default" });

      this.queues[qname] = new Queue(qname, {
        connection,
        defaultJobOptions: {
          attempts: retryPolicy.maxRetries + 1,
          backoff: retryPolicyService.getBullMQBackoff({ operation: "queue:default" }),
          removeOnComplete: true,
          removeOnFail: false,
        },
      } as any);

      logger.info({ queue: qname, concurrency }, "Created specialized queue");
    }
    return this.queues[qname];
  }

  /**
   * Get a specialized queue by type (bridgeTransaction, priceAggregator, analyticsAggregation, webhookDelivery).
   */
  public getSpecializedQueue(queueType: keyof typeof QUEUE_CONCURRENCY_CONFIG): Queue {
    return this.getOrCreateNamedQueue(queueType);
  }

  /**
   * Initialize a worker for a specialized queue with its configured concurrency.
   */
  public initSpecializedWorker(
    queueType: keyof typeof QUEUE_CONCURRENCY_CONFIG,
    processor: (job: Job) => Promise<void>,
  ): Worker {
    const queue = this.getOrCreateNamedQueue(queueType);
    const concurrency = QUEUE_CONCURRENCY_CONFIG[queueType] ?? QUEUE_CONCURRENCY_CONFIG.default;

    const worker = new Worker(queue.name, async (job) => processor(job), {
      connection,
      concurrency,
    });

    worker.on("completed", (job: Job) => {
      logger.info({ jobId: job.id, jobName: job.name, queue: queueType }, "Specialized job completed");
    });

    worker.on("failed", (job: Job | undefined, err: Error) => {
      logger.error({ jobId: job?.id, jobName: job?.name, queue: queueType, error: err.message }, "Specialized job failed");
    });

    return worker;
  }

  public async addJob(name: string, data: unknown, options: Record<string, any> = {}) {
    const priority: Priority | undefined = options.priority;
    const q = this.queueForPriority(priority);
    logger.info({ jobName: name, priority: priority ?? "medium" }, "Adding job to prioritized queue");
    const opts = { ...options };
    delete opts.priority;
    return q.add(name, data, opts);
  }

  public async addRepeatableJob(name: string, data: unknown, cron: string, priority?: Priority) {
    const q = this.queueForPriority(priority);
    logger.info({ jobName: name, cron, priority: priority ?? "medium" }, "Scheduling repeatable job");
    return q.add(name, data, {
      repeat: { pattern: cron },
    });
  }

  public initWorker(processor: (job: Job) => Promise<void>) {
    const priorities: Priority[] = ["critical", "high", "medium", "low"];
    for (const p of priorities) {
      if (this.workers[p]) continue;

      this.workers[p] = new Worker(`${QUEUE_NAME}-${p}`, async (job) => processor(job), {
        connection,
        concurrency: LANE_CONCURRENCY[p],
      });

      this.workers[p].on("completed", (job: Job) => {
        logger.info({ jobId: job.id, jobName: job.name, lane: p }, "Job completed successfully");
      });

      this.workers[p].on("failed", (job: Job | undefined, err: Error) => {
        logger.error({ jobId: job?.id, jobName: job?.name, lane: p, error: err.message }, "Job failed");
      });
    }
  }

  /**
   * Fairness governor: periodically assesses lane fairness and adjusts
   * per-lane concurrency/rate limits to prevent starvation.
   */
  public async runFairnessGovernor(): Promise<void> {
    try {
      const fairness = await queueFairnessService.getOverallFairness();
      const policies = await queueFairnessService.getAllPolicies();

      for (const assessment of fairness.byLane) {
        const lane = assessment.laneName;
        const queue = this.queues[`${QUEUE_NAME}-${lane}`];
        if (!queue) continue;

        const currentConcurrency = LANE_CONCURRENCY[lane];
        let newConcurrency = currentConcurrency;

        if (assessment.status === "starved" || assessment.status === "unfair") {
          // Boost concurrency for starved/unfair lanes (max 2x base)
          newConcurrency = Math.min(currentConcurrency * 2, 10);
          logger.warn({ lane, status: assessment.status, newConcurrency }, "Boosting lane concurrency due to unfairness");
        } else if (assessment.status === "healthy" && currentConcurrency > LANE_CONCURRENCY[lane]) {
          // Gradually reduce back to base when healthy
          newConcurrency = Math.max(currentConcurrency - 1, LANE_CONCURRENCY[lane]);
        }

        if (newConcurrency !== currentConcurrency) {
          // Note: BullMQ Worker concurrency can't be changed dynamically.
          // Instead we adjust the rate limiter on the queue.
          await queue.setRateLimiter({
            max: newConcurrency * 100, // scale rate limit with concurrency
            duration: 1000,
          });
        }
      }
    } catch (err) {
      logger.error({ err }, "Fairness governor error");
    }
  }

  public async getJobCounts() {
    const keys = Object.keys(this.queues);
    const counts = {} as Record<string, any>;
    for (const k of keys) {
      counts[k] = await this.queues[k].getJobCounts();
    }
    return counts;
  }

  /**
   * Get queue concurrency configuration for monitoring/metrics.
   * Returns both the configured concurrency and current job counts.
   */
  public async getQueueConcurrencyMetrics() {
    const metrics: Record<string, { concurrency: number; counts: any }> = {};
    const keys = Object.keys(this.queues);

    for (const k of keys) {
      const queue = this.queues[k];
      // Determine concurrency based on queue name
      let concurrency = LANE_CONCURRENCY.medium; // default

      // Check if it's a priority lane queue
      for (const p of ["critical", "high", "medium", "low"] as Priority[]) {
        if (k === `${QUEUE_NAME}-${p}`) {
          concurrency = LANE_CONCURRENCY[p];
          break;
        }
      }

      // Check if it's a specialized queue
      for (const qType of Object.keys(QUEUE_CONCURRENCY_CONFIG) as Array<keyof typeof QUEUE_CONCURRENCY_CONFIG>) {
        if (k === `${QUEUE_NAME}-${qType}`) {
          concurrency = QUEUE_CONCURRENCY_CONFIG[qType];
          break;
        }
      }

      metrics[k] = {
        concurrency,
        counts: await queue.getJobCounts(),
      };
    }

    return metrics;
  }

  public async getFailedJobs() {
    const keys = Object.keys(this.queues);
    let combined: any[] = [];
    for (const k of keys) {
      combined = combined.concat(await this.queues[k].getFailed(0, 100));
    }
    return combined;
  }

  public async getRepeatableJobs() {
    const keys = Object.keys(this.queues);
    const entries: Array<{
      queue: string;
      name: string;
      pattern: string | null;
      every: number | null;
      nextRunAt: Date | null;
    }> = [];
    for (const k of keys) {
      const jobs: any[] = await this.queues[k].getRepeatableJobs();
      for (const j of jobs) {
        entries.push({
          queue: k,
          name: typeof j.name === "string" ? j.name : String(j.key ?? "unknown"),
          pattern: typeof j.pattern === "string" ? j.pattern : null,
          every: typeof j.every === "number" ? j.every : null,
          nextRunAt: typeof j.next === "number" ? new Date(j.next) : null,
        });
      }
    }
    return entries;
  }

  public async stop() {
    for (const w of Object.values(this.workers)) {
      await w.close();
    }
    for (const k of Object.keys(this.queues)) {
      await this.queues[k].close();
    }
    logger.info("Job queue system shut down");
  }
}