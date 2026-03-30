import { BaseChannel } from "./base.channel.js";
import { HealthService } from "../../../services/health.service.js";
import { SUPPORTED_ASSETS } from "../../../config/index.js";
import { logger } from "../../../utils/logger.js";
import type { IBroadcaster, HealthUpdateMessage } from "../types.js";

/**
 * Health channel – broadcasts composite health scores for all supported assets.
 *
 * Polling interval: 30 seconds (scores change slowly and are compute-intensive).
 * Publishes a `health_update` message containing an array of {@link HealthData}.
 */
export class HealthChannel extends BaseChannel {
  private readonly healthService = new HealthService();

  constructor(broadcaster: IBroadcaster) {
    super(broadcaster);
  }

  get name() {
    return "health" as const;
  }

  get pollingIntervalMs() {
    return 30_000; // 30 s
  }

  async fetchAndBroadcast(): Promise<void> {
    if (this.subscriberCount === 0) return;

    const results = await Promise.allSettled(
      SUPPORTED_ASSETS.map((asset) =>
        this.healthService.getHealthScore(asset.code)
      )
    );

    const healthData = results.flatMap((result, i) => {
      if (result.status === "rejected") {
        logger.warn(
          { symbol: SUPPORTED_ASSETS[i].code, err: result.reason },
          "Health score fetch failed for channel broadcast"
        );
        return [];
      }
      const score = result.value;
      if (!score) return [];

      return [
        {
          symbol: score.symbol,
          overallScore: score.overallScore,
          factors: score.factors,
          trend: score.trend,
          timestamp: score.lastUpdated,
        },
      ];
    });

    if (healthData.length === 0) return;

    const message: HealthUpdateMessage = {
      type: "health_update",
      channel: "health",
      data: healthData,
      timestamp: new Date().toISOString(),
    };

    await this.broadcast(message);
  }
}
