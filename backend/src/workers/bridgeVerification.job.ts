import { Job } from "bullmq";
import { BridgeService } from "../services/bridge.service.js";
import { SUPPORTED_ASSETS } from "../config/index.js";
import { logger } from "../utils/logger.js";
import { config } from "../config/index.js";
import { getMetricsService } from "../services/metrics.service.js";

const bridgeService = new BridgeService();
const metricsService = getMetricsService();

export async function processBridgeVerification(job: Job) {
  logger.info({ jobId: job.id }, "Starting bridge verification job");
  
  // Phase 1 assets that apply to the cross-chain bridge verification
  const bridgedAssets = SUPPORTED_ASSETS.filter(a => ["USDC", "EURC"].includes(a.code));
  
  for (const asset of bridgedAssets) {
    try {
      const result = await bridgeService.verifySupply(asset.code);
      
      // Record metrics (using asset code as identifier since bridgeId is not in result)
      metricsService.recordBridgeVerification(
        'stellar-bridge',
        'Stellar Bridge',
        asset.code,
        !result.isFlagged && !result.errorStatus,
        result.errorStatus || (result.isFlagged ? 'supply_mismatch' : undefined)
      );
      
      if (result.isFlagged) {
        logger.error(
          { asset: asset.code, result }, 
          `CRITICAL: Bridge supply mismatch exceeds threshold of ${config.BRIDGE_SUPPLY_MISMATCH_THRESHOLD}%`
        );
      } else if (result.errorStatus) {
        logger.warn(
          { asset: asset.code, error: result.errorStatus },
          "Bridge verification skipped or failed due to fetch error."
        );
      } else {
        logger.info(
          { asset: asset.code, mismatch: result.mismatchPercentage },
          "Bridge reserve verification completed successfully."
        );
      }
    } catch (error) {
      // Record failure metric
      metricsService.recordBridgeVerification(
        'stellar-bridge',
        'Stellar Bridge',
        asset.code,
        false,
        'exception'
      );
      
      logger.error({ error, asset: asset.code }, "Unexpected failure during bridge verification job");
    }
  }
}
