import { AnalyticsService } from "../services/analytics.service.js";
import { PriceService } from "../services/price.service.js";
import { SUPPORTED_ASSETS } from "../config/index.js";
import { logger } from "../utils/logger.js";

/**
 * Cache warming script/job to pre-fetch expensive data.
 */
export async function runCacheWarming() {
  logger.info("Starting cache warming process...");
  const analyticsService = new AnalyticsService();
  const priceService = new PriceService();

  try {
    // We pass bypassCache=true to force a refresh of the underlying data into Redis
    const bypassCache = true;

    // Pre-fetch protocol stats
    logger.info("Warming protocol stats");
    await analyticsService.getProtocolStats(bypassCache);

    // Pre-fetch bridge comparisons
    logger.info("Warming bridge comparisons");
    await analyticsService.getBridgeComparisons(bypassCache);

    // Pre-fetch asset rankings
    logger.info("Warming asset rankings");
    await analyticsService.getAssetRankings(bypassCache);

    // Pre-fetch health/tvl/volume top performers
    logger.info("Warming top performers");
    await analyticsService.getTopPerformers("assets", "health", 10, bypassCache);
    await analyticsService.getTopPerformers("bridges", "tvl", 10, bypassCache);

    // Provide warm price aggregated data
    logger.info("Warming price aggregates for supported assets");
    for (const asset of SUPPORTED_ASSETS) {
      if (asset.code !== "native" && asset.code !== "XLM") {
        try {
          await priceService.getAggregatedPrice(asset.code, bypassCache);
        } catch (e) {
          logger.warn({ asset: asset.code }, "Could not warm price for asset");
        }
      }
    }

    logger.info("Cache warming successfully completed");
  } catch (error) {
    logger.error({ error }, "Cache warming failed");
    throw error;
  }
}

// Automatically runs if executed as script directly
// @ts-expect-error - Required for direct execution script detection
if (import.meta.url === `file://${process.argv[1]}`) {
  runCacheWarming().then(() => process.exit(0)).catch(() => process.exit(1));
}
