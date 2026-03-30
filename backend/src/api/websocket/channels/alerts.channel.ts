import { BaseChannel } from "./base.channel.js";
import { AlertService } from "../../../services/alert.service.js";
import { logger } from "../../../utils/logger.js";
import type { IBroadcaster, AlertTriggeredMessage } from "../types.js";

/**
 * Alerts channel – streams real-time alert events to authenticated subscribers.
 *
 * Strategy: poll the `alert_events` table every 5 seconds for events newer
 * than the last-seen timestamp.  This design is self-contained (no external
 * publisher needed) and automatically de-duplicates across the sliding window.
 * When a Redis pub/sub event for `ws:channel:alerts` arrives via the
 * WebSocketServer's subscriber, it is forwarded directly by the server without
 * going through this channel's polling loop.
 *
 * Polling interval: 5 seconds.
 * Requires authentication – subscribers must supply a valid token.
 */
export class AlertsChannel extends BaseChannel {
  private readonly alertService = new AlertService();
  /** Epoch-ms of the most recently delivered alert event. */
  private lastSeenAt = new Date(Date.now() - 5_000);

  constructor(broadcaster: IBroadcaster) {
    super(broadcaster);
  }

  get name() {
    return "alerts" as const;
  }

  get pollingIntervalMs() {
    return 5_000; // 5 s
  }

  async fetchAndBroadcast(): Promise<void> {
    if (this.subscriberCount === 0) return;

    let recentAlerts;
    try {
      recentAlerts = await this.alertService.getRecentAlerts(50);
    } catch (err) {
      logger.warn({ err }, "Failed to fetch recent alerts for WS broadcast");
      return;
    }

    const cutoff = this.lastSeenAt;
    const newAlerts = recentAlerts.filter((a) => a.time > cutoff);

    if (newAlerts.length === 0) return;

    // Advance the cursor to the most recent alert we've seen
    const latest = newAlerts.reduce(
      (max, a) => (a.time > max ? a.time : max),
      cutoff
    );
    this.lastSeenAt = latest;

    for (const alert of newAlerts) {
      const message: AlertTriggeredMessage = {
        type: "alert_triggered",
        channel: "alerts",
        data: {
          ruleId: alert.ruleId,
          assetCode: alert.assetCode,
          alertType: alert.alertType,
          priority: alert.priority,
          triggeredValue: alert.triggeredValue,
          threshold: alert.threshold,
          metric: alert.metric,
          timestamp: alert.time.toISOString(),
        },
        timestamp: new Date().toISOString(),
      };

      await this.broadcast(message);
    }
  }
}
