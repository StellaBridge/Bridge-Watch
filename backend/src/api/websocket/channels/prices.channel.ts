import { BaseChannel } from "./base.channel.js";
import { PriceService } from "../../../services/price.service.js";
import { SUPPORTED_ASSETS } from "../../../config/index.js";
import { logger } from "../../../utils/logger.js";
import type { IBroadcaster, PriceUpdateMessage } from "../types.js";

/**
 * Prices channel – broadcasts aggregated VWAP prices for all supported assets.
 *
 * Polling interval: 10 seconds.
 * Publishes a `price_update` message containing an array of {@link PriceData}
 * objects (one per asset) whenever fresh data is available.
 */
export class PricesChannel extends BaseChannel {
  private readonly priceService = new PriceService();

  constructor(broadcaster: IBroadcaster) {
    super(broadcaster);
  }

  get name() {
    return "prices" as const;
  }

  get pollingIntervalMs() {
    // Balance freshness with rate limits on the Stellar Horizon API
    return 10_000; // 10 s
  }

  async fetchAndBroadcast(): Promise<void> {
    if (this.subscriberCount === 0) return;

    const results = await Promise.allSettled(
      SUPPORTED_ASSETS.map((asset) =>
        this.priceService.getAggregatedPrice(asset.code)
      )
    );

    const priceData = results.flatMap((result, i) => {
      if (result.status === "rejected") {
        logger.warn(
          { symbol: SUPPORTED_ASSETS[i].code, err: result.reason },
          "Price fetch failed for channel broadcast"
        );
        return [];
      }
      const aggregated = result.value;
      if (!aggregated) return [];

      return [
        {
          symbol: aggregated.symbol,
          price: aggregated.vwap,
          vwap: aggregated.vwap,
          deviation: aggregated.deviation,
          sources: aggregated.sources,
          timestamp: aggregated.lastUpdated,
        },
      ];
    });

    if (priceData.length === 0) return;

    const message: PriceUpdateMessage = {
      type: "price_update",
      channel: "prices",
      data: priceData,
      timestamp: new Date().toISOString(),
    };

    await this.broadcast(message);
  }
}
