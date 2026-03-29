import { Job } from "bullmq";
import { JobQueue } from "./queue.js";
import { processPriceCollection } from "./priceCollection.job.js";
import { processHealthCalculation } from "./healthCalculation.job.js";
import { processBridgeVerification } from "./bridgeVerification.job.js";
import { processAnalyticsAggregation } from "./analyticsAggregation.worker.js";
import { logger } from "../utils/logger.js";

export async function initJobSystem() {
  const jobQueue = JobQueue.getInstance();

  // Initialize worker with processor
  jobQueue.initWorker(async (job: Job) => {
    switch (job.name) {
      case "price-collection":
        await processPriceCollection(job);
        break;
      case "health-calculation":
        await processHealthCalculation(job);
        break;
      case "bridge-verification":
        await processBridgeVerification(job);
        break;
      case "analytics-aggregation":
        await processAnalyticsAggregation(job);
        break;
      default:
        logger.warn({ jobName: job.name }, "Unknown job name in worker");
    }
  });

  // Schedule repeatable jobs
  // price-collection: every 30 seconds
  await jobQueue.addRepeatableJob("price-collection", {}, "*/30 * * * * *");
  
  // health-calculation: every 5 minutes
  await jobQueue.addRepeatableJob("health-calculation", {}, "*/5 * * * *");
  
  // bridge-verification: every 5 minutes
  await jobQueue.addRepeatableJob("bridge-verification", {}, "*/5 * * * *");

  // Analytics aggregation jobs
  // Protocol stats: every 2 minutes
  await jobQueue.addRepeatableJob("analytics-aggregation", { type: "protocol-stats" }, "*/2 * * * *");
  
  // Bridge comparisons: every 3 minutes
  await jobQueue.addRepeatableJob("analytics-aggregation", { type: "bridge-comparisons" }, "*/3 * * * *");
  
  // Asset rankings: every 3 minutes
  await jobQueue.addRepeatableJob("analytics-aggregation", { type: "asset-rankings" }, "*/3 * * * *");
  
  // Volume aggregations: every 5 minutes
  await jobQueue.addRepeatableJob("analytics-aggregation", { 
    type: "volume-aggregation",
    params: { period: "hourly" }
  }, "*/5 * * * *");
  
  await jobQueue.addRepeatableJob("analytics-aggregation", { 
    type: "volume-aggregation",
    params: { period: "daily" }
  }, "*/5 * * * *");
  
  // Top performers: every 5 minutes
  await jobQueue.addRepeatableJob("analytics-aggregation", { 
    type: "top-performers",
    params: { performerType: "assets", metric: "health", limit: 10 }
  }, "*/5 * * * *");
  
  await jobQueue.addRepeatableJob("analytics-aggregation", { 
    type: "top-performers",
    params: { performerType: "bridges", metric: "tvl", limit: 10 }
  }, "*/5 * * * *");

  logger.info("Scheduled job system initialized");
}
