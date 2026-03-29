import { Job } from "bullmq";
import { PriceService } from "../services/price.service.js";
import { logger } from "../utils/logger.js";

const priceService = new PriceService();

export async function processPriceCollection(job: Job) {
  logger.info({ jobId: job.id }, "Starting price collection job");
  
  // Fetch all prices for aggregation
  const testAssets = ["USDC", "EUR", "GBP"];
  
  for (const asset of testAssets) {
    try {
      await priceService.getAggregatedPrice(asset);
      logger.debug({ asset }, "Fetched aggregated price");
    } catch (error) {
      logger.error({ asset, error }, "Failed to fetch aggregated price in background job");
      // Don't throw here to allow other assets to be fetched
    }
  }
}
