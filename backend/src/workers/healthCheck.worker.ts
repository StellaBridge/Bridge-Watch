import { Worker, Queue } from "bullmq";
import { config } from "../config/index.js";
import { HealthService, type HealthScore } from "../services/health.service.js";
import { logger } from "../utils/logger.js";
import { alertRoutingService, type RouteableAlert } from "../services/alertRouting.service.js";
import { duplicateAlertCheckService } from "../services/duplicateAlertCheck.service.js";
import type { AlertEvent } from "../services/alert.service.js";
import { HealthScoreModel } from "../database/models/healthScore.model.js";

const QUEUE_NAME = "health-check";

const healthScoreModel = new HealthScoreModel();

const connection = {
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
  password: config.REDIS_PASSWORD || undefined,
};

export const healthCheckQueue = new Queue(QUEUE_NAME, { connection });

function buildDeterioratingAlert(score: HealthScore): RouteableAlert {
  return {
    eventTime: new Date(),
    alertRuleId: `health-check-${score.symbol}`,
    ownerAddress: "system",
    ruleName: "Health Score Deteriorating",
    assetCode: score.symbol,
    sourceType: "health_score_drop",
    severity: score.overallScore < 0.3 ? "critical" : "high",
    triggeredValue: score.overallScore,
    threshold: 0.5,
    metric: "overall_health_score",
  };
}

async function routeDeterioratingAlerts(scores: HealthScore[]): Promise<void> {
  const deteriorating = scores.filter((s) => s.trend === "deteriorating");
  const now = new Date();
  for (const score of deteriorating) {
    const dedupEvent: Omit<AlertEvent, "eventId"> = {
      ruleId: `health-check-${score.symbol}`,
      assetCode: score.symbol,
      alertType: "health_score_drop",
      priority: score.overallScore < 0.3 ? "critical" : "high",
      triggeredValue: score.overallScore,
      threshold: 0.5,
      metric: "overall_health_score",
      webhookDelivered: false,
      onChainEventId: null,
      lifecycleState: "open",
      acknowledgedAt: null,
      acknowledgedBy: null,
      assignedAt: null,
      assignedTo: null,
      closedAt: null,
      closedBy: null,
      closureNote: null,
      updatedAt: now,
      time: now,
    };

    const dedupResult = duplicateAlertCheckService.check(dedupEvent);

    if (!dedupResult.isDuplicate || dedupResult.action !== "block") {
      const alert = buildDeterioratingAlert(score);
      await alertRoutingService.routeAlert(alert);
      logger.info({ symbol: score.symbol, score: score.overallScore }, "Health deterioration alert routed");
    } else {
      logger.debug({ symbol: score.symbol, reason: dedupResult.reason }, "Health deterioration alert suppressed by deduplication");
    }
  }
}

/**
 * Inserts one row per score into health_scores (TimescaleDB hypertable).
 * Columns: time, symbol, overall_score, liquidity_depth_score, price_stability_score,
 *          bridge_uptime_score, reserve_backing_score, volume_trend_score.
 * Errors per-symbol are swallowed so a single bad row never halts the batch.
 */
async function persistHealthScores(scores: HealthScore[]): Promise<void> {
  const now = new Date();
  for (const score of scores) {
    try {
      await healthScoreModel.insert({
        time: now,
        symbol: score.symbol,
        overall_score: score.overallScore,
        liquidity_depth_score: score.factors.liquidityDepth,
        price_stability_score: score.factors.priceStability,
        bridge_uptime_score: score.factors.bridgeUptime,
        reserve_backing_score: score.factors.reserveBacking,
        volume_trend_score: score.factors.volumeTrend,
      });
    } catch (err) {
      logger.error({ err, symbol: score.symbol }, "Failed to persist health score");
    }
  }
}

export async function processHealthCheckJob(job: { id?: string }) {
  const healthService = new HealthService();
  logger.info({ jobId: job.id }, "Processing health check job");

  const scores = await healthService.computeAllHealthScores();

  await persistHealthScores(scores);
  await routeDeterioratingAlerts(scores);

  logger.info({ assetCount: scores.length }, "Health check completed for all assets");
  return { success: true, scores };
}

/**
 * Worker that periodically computes composite health scores for all
 * monitored assets, persists them to TimescaleDB, and triggers alerts
 * for any asset whose trend has become deteriorating.
 */
export const healthCheckWorker = new Worker(
  QUEUE_NAME,
  async (job) => {
    try {
      return await processHealthCheckJob(job);
    } catch (error) {
      logger.error({ error }, "Health check job failed");
      throw error;
    }
  },
  { connection, concurrency: 1 }
);

healthCheckWorker.on("completed", (job) => {
  logger.debug({ jobId: job?.id }, "Health check job completed");
});

healthCheckWorker.on("failed", (job, error) => {
  logger.error({ jobId: job?.id, error: error.message }, "Health check job failed");
});
