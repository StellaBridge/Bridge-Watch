import { BaseChannel } from "./base.channel.js";
import { BridgeService } from "../../../services/bridge.service.js";
import { logger } from "../../../utils/logger.js";
import type { IBroadcaster, BridgeUpdateMessage } from "../types.js";

/**
 * Bridges channel – broadcasts status and TVL data for all monitored bridges.
 *
 * Polling interval: 30 seconds (bridge status changes slowly; heavy on-chain
 * lookups are cached by the BridgeService).
 * Publishes a `bridge_update` message with an array of {@link BridgeData}.
 */
export class BridgesChannel extends BaseChannel {
  private readonly bridgeService = new BridgeService();

  constructor(broadcaster: IBroadcaster) {
    super(broadcaster);
  }

  get name() {
    return "bridges" as const;
  }

  get pollingIntervalMs() {
    return 30_000; // 30 s
  }

  async fetchAndBroadcast(): Promise<void> {
    if (this.subscriberCount === 0) return;

    let result;
    try {
      result = await this.bridgeService.getAllBridgeStatuses();
    } catch (err) {
      logger.warn({ err }, "Failed to fetch bridge statuses for WS broadcast");
      return;
    }

    if (result.bridges.length === 0) return;

    const message: BridgeUpdateMessage = {
      type: "bridge_update",
      channel: "bridges",
      data: result.bridges.map((b) => ({
        name: b.name,
        status: b.status,
        totalValueLocked: b.totalValueLocked,
        supplyOnStellar: b.supplyOnStellar,
        supplyOnSource: b.supplyOnSource,
        mismatchPercentage: b.mismatchPercentage,
        lastChecked: b.lastChecked,
      })),
      timestamp: new Date().toISOString(),
    };

    await this.broadcast(message);
  }
}
