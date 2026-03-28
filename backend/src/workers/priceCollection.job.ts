import { Job } from "bullmq";
import { PriceService } from "../services/price.service.js";
import { SUPPORTED_ASSETS } from "../config/index.js";
import { logger } from "../utils/logger.js";

const priceService = new PriceService();

export async function processPriceCollection(job: Job) {
  logger.info({ jobId: job.id }, "Starting price collection job");
  
  const _assetsToFetch = SUPPORTED_ASSETS.filter(a => a.code !== "XLM"); // XLM is usually the base or handled differently if needed, but let's fetch all for completeness if they are in SUPPORTED_ASSETS. 
  // Actually, the service handles USDC as 1.
  
  for (const asset of SUPPORTED_ASSETS) {
    try {
      await priceService.getAggregatedPrice(asset.code);
      logger.debug({ asset: asset.code }, "Fetched aggregated price");
    } catch (error) {
      logger.error({ asset: asset.code, error }, "Failed to fetch aggregated price in background job");
      // Don't throw here to allow other assets to be fetched
    }
  }
}
