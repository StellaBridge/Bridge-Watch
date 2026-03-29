import { Job } from "bullmq";
import { AnalyticsService } from "../services/analytics.service.js";
import { logger } from "../utils/logger.js";

const analyticsService = new AnalyticsService();

/**
 * Worker to pre-compute and cache analytics aggregations
 */
export async function processAnalyticsAggregation(job: Job): Promise<void> {
  const { type, params } = job.data;

  logger.info({ jobId: job.id, type, params }, "Processing analytics aggregation");

  try {
    switch (type) {
      case "protocol-stats": {
        await analyticsService.getProtocolStats();
        logger.info("Protocol stats aggregated and cached");
        break;
      }

      case "bridge-comparisons": {
        await analyticsService.getBridgeComparisons();
        logger.info("Bridge comparisons aggregated and cached");
        break;
      }

      case "asset-rankings": {
        await analyticsService.getAssetRankings();
        logger.info("Asset rankings aggregated and cached");
        break;
      }

      case "volume-aggregation": {
        const { period, symbol, bridgeName } = params || {};
        await analyticsService.getVolumeAggregation(period || "daily", symbol, bridgeName);
        logger.info({ period, symbol, bridgeName }, "Volume aggregation computed and cached");
        break;
      }

      case "top-performers": {
        const { performerType, metric, limit } = params || {};
        await analyticsService.getTopPerformers(
          performerType || "assets",
          metric || "health",
          limit || 10
        );
        logger.info({ performerType, metric, limit }, "Top performers computed and cached");
        break;
      }

      case "trends": {
        const { trendMetric, trendSymbol, trendBridge } = params || {};
        await analyticsService.calculateTrend(trendMetric, trendSymbol, trendBridge);
        logger.info({ trendMetric, trendSymbol, trendBridge }, "Trend calculated and cached");
        break;
      }

      case "invalidate-cache": {
        const { pattern } = params || {};
        await analyticsService.invalidateCache(pattern);
        logger.info({ pattern }, "Analytics cache invalidated");
        break;
      }

      default:
        logger.warn({ type }, "Unknown analytics aggregation type");
    }
  } catch (error) {
    logger.error({ jobId: job.id, type, error }, "Analytics aggregation failed");
    throw error;
  }
}
