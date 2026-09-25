import { Job } from "bullmq";
import { config } from "../config/index.js";
import { JobQueue } from "./queue.js";
import { processPriceCollection } from "./priceCollection.job.js";
import { processHealthCalculation } from "./healthCalculation.job.js";
import { processBridgeVerification } from "./bridgeVerification.job.js";
import { processAnalyticsAggregation } from "./analyticsAggregation.worker.js";
import { processMetricsRollup } from "./metricsRollup.worker.js";
import { processDigestScheduler } from "./digestScheduler.worker.js";
import { processMetadataSync } from "./metadataSync.job.js";
import { processExternalDependencyMonitor } from "./externalDependencyMonitor.job.js";
import { processReconciliation } from "./reconciliation.job.js";
import { processStalenessDetection } from "./stalenessDetection.job.js";
import { logger } from "../utils/logger.js";
import { initSupplyVerificationJob } from "../jobs/supplyVerification.job.js";
import { runAuditRetentionJob } from "../jobs/auditRetention.job.js";
import { runExternalSourceArchiveRetentionJob } from "../jobs/externalSourceArchiveRetention.job.js";
import { processCachePriming } from "./cachePrimer.job.js";
import { processAnomalyDetection } from "./anomalyDetection.job.js";
import { processMetricsAggregation } from "./metricsAggregation.worker.js";
import { processSearchIndexRebuild } from "./searchIndexRebuild.job.js";
import { processIncidentSlaBreach } from "./incidentSlaBreach.job.js";
import { processProviderCredentialRotation } from "./providerCredentialRotation.job.js";
import { processApiContractMonitor } from "./apiContractMonitor.job.js";
import { scheduleEvmReserveAttestations } from "./evmReserveAttestation.worker.js";

export async function initJobSystem() {
  const jobQueue = JobQueue.getInstance();

  // Run high-priority cache priming on startup
  try {
    const { cachePrimerService, CachePriority } = await import("../services/cachePrimer.service.js");
    logger.info("Running startup high-priority cache priming");
    await cachePrimerService.prime(CachePriority.HIGH);
  } catch (error) {
    logger.error({ error }, "Startup cache priming failed, continuing with job initialization");
  }

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
      case "metrics-rollup":
        await processMetricsRollup(job);
        break;
      case "audit-retention":
        await runAuditRetentionJob(job.data.retentionDays);
        break;
      case "external-source-archive-retention":
        await runExternalSourceArchiveRetentionJob();
        break;
      case "digest-scheduler-daily":
        await processDigestScheduler(job);
        break;
      case "digest-scheduler-weekly":
        await processDigestScheduler(job);
        break;
      case "metadata-sync":
        await processMetadataSync(job);
        break;
      case "external-dependency-monitor":
        await processExternalDependencyMonitor(job);
        break;
      case "staleness-detection":
        await processStalenessDetection(job);
        break;
      case "reconciliation":
        await processReconciliation(job as any);
        break;
      case "anomaly-detection":
        await processAnomalyDetection(job);
        break;
      case "metrics-aggregation-pipeline":
        await processMetricsAggregation(job);
        break;
      case "search-index-rebuild":
        await processSearchIndexRebuild(job);
        break;
      case "incident-sla-breach":
        await processIncidentSlaBreach(job);
        break;
      case "provider-credential-rotation":
        await processProviderCredentialRotation(job);
        break;
      case "api-contract-monitor":
        await processApiContractMonitor(job);
        break;
      default:
        logger.warn({ jobName: job.name }, "Unknown job name in worker");
    }
  });

  // Initialize supply verification job system (dedicated queue and worker)
  await initSupplyVerificationJob();

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

  // Metrics rollup: every 15 minutes to keep daily stats fresh
  await jobQueue.addRepeatableJob("metrics-rollup", { type: "bridge-volume" }, "*/15 * * * *");

  // Audit log retention: daily at 02:00 UTC, keep 90 days of info-level entries
  await jobQueue.addRepeatableJob("audit-retention", { retentionDays: 90 }, "0 2 * * *");

  // External source response archive retention: daily at 02:30 UTC
  await jobQueue.addRepeatableJob(
    "external-source-archive-retention",
    {},
    "30 2 * * *"
  );

  // Digest scheduler jobs
  // Daily digest: every hour (service will check user preferences and timezone)
  await jobQueue.addRepeatableJob("digest-scheduler-daily", { digestType: "daily" }, "0 * * * *");
  
  // Weekly digest: every hour on Monday (service will check user preferences)
  await jobQueue.addRepeatableJob("digest-scheduler-weekly", { digestType: "weekly" }, "0 * * * 1");

  // Metadata sync: every 4 hours
  await jobQueue.addRepeatableJob("metadata-sync", {}, "0 */4 * * *");

  // External dependency checks: every 2 minutes
  await jobQueue.addRepeatableJob("external-dependency-monitor", {}, "*/2 * * * *");
  // Staleness detection: every 5 minutes
  await jobQueue.addRepeatableJob("staleness-detection", {}, "*/5 * * * *");
  // Anomaly detection: correlate fresh price, liquidity, supply, and bridge signals every minute
  await jobQueue.addRepeatableJob("anomaly-detection", {}, "*/1 * * * *");
  // reconciliation: per-asset, every hour (top of hour)
  // Note: This uses the queue helper for retry/backoff defaults.
  const reconciledAssetCodes = ["USDC", "EURC"];
  if (config.WORMHOLE_WATCHED_ASSET_STELLAR_ISSUER) {
    reconciledAssetCodes.push(config.WORMHOLE_WATCHED_ASSET_SYMBOL);
  }
  for (const assetCode of reconciledAssetCodes) {
    await jobQueue.addJob("reconciliation", { assetCode }, {
      repeat: { pattern: "0 * * * *" },
      jobId: `reconciliation:${assetCode}`,
    });
  }

  // Cache priming: High priority every hour, Full every day at 03:00 UTC
  await jobQueue.addRepeatableJob("cache-priming", { priority: "high" }, "0 * * * *");
  await jobQueue.addRepeatableJob("cache-priming", {}, "0 3 * * *");

  // Metrics aggregation pipeline: hourly rollups every hour, daily rollups just after
  // midnight, weekly rollups Monday at 01:00, retention cleanup daily at 03:00 UTC.
  await jobQueue.addRepeatableJob("metrics-aggregation-pipeline", { type: "hourly" }, "5 * * * *");
  await jobQueue.addRepeatableJob("metrics-aggregation-pipeline", { type: "daily" }, "15 0 * * *");
  await jobQueue.addRepeatableJob("metrics-aggregation-pipeline", { type: "weekly" }, "30 1 * * 1");
  await jobQueue.addRepeatableJob("metrics-aggregation-pipeline", { type: "retention" }, "0 3 * * *");

  // Search index incremental rebuild: every 10 minutes; full rebuild nightly at 01:00 UTC
  await jobQueue.addRepeatableJob("search-index-rebuild", { full: false }, "*/10 * * * *");
  await jobQueue.addRepeatableJob("search-index-rebuild", { full: true }, "0 1 * * *");

  // Incident SLA breach detection: every 5 minutes
  await jobQueue.addRepeatableJob("incident-sla-breach", {}, "*/5 * * * *");

  // Provider credential rotation scheduler: daily at 04:00 UTC
  await jobQueue.addRepeatableJob("provider-credential-rotation", {}, "0 4 * * *");

  // External API contract monitoring: every 15 minutes
  await jobQueue.addRepeatableJob("api-contract-monitor", {}, "*/15 * * * *");

  // #1243 — EVM reserve attestation: poll lock contracts every hour
  await scheduleEvmReserveAttestations();

  logger.info("Scheduled job system initialized");
}
