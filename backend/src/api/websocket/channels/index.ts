import type {
  ChannelName,
  IBroadcaster,
} from "../types.js";
import { PricesChannel } from "./prices.channel.js";
import { HealthChannel } from "./health.channel.js";
import { AlertsChannel } from "./alerts.channel.js";
import { BridgesChannel } from "./bridges.channel.js";
export { BaseChannel } from "./base.channel.js";

// ─── ChannelManager ───────────────────────────────────────────────────────────

import { BaseChannel } from "./base.channel.js";

/**
 * Manages all channel instances and routes subscription requests.
 */
export class ChannelManager {
  private readonly channels: ReadonlyMap<ChannelName, BaseChannel>;

  constructor(broadcaster: IBroadcaster) {
    this.channels = new Map<ChannelName, BaseChannel>([
      ["prices", new PricesChannel(broadcaster)],
      ["health", new HealthChannel(broadcaster)],
      ["alerts", new AlertsChannel(broadcaster)],
      ["bridges", new BridgesChannel(broadcaster)],
    ]);
  }

  addSubscriber(channel: ChannelName, clientId: string): void {
    this.channels.get(channel)?.addSubscriber(clientId);
  }

  removeSubscriber(channel: ChannelName, clientId: string): void {
    this.channels.get(channel)?.removeSubscriber(clientId);
  }

  getSubscribers(channel: ChannelName): Set<string> {
    return this.channels.get(channel)?.getSubscribers() ?? new Set<string>();
  }

  getSubscriberCount(channel: ChannelName): number {
    return this.channels.get(channel)?.subscriberCount ?? 0;
  }

  /**
   * Ensure the channel's polling loop is running.
   * Called when the first subscriber joins a channel.
   */
  ensureChannelActive(channel: ChannelName): void {
    this.channels.get(channel)?.start();
  }

  /** Stop all channels (called on graceful shutdown). */
  async stopAll(): Promise<void> {
    for (const channel of this.channels.values()) {
      channel.stop();
    }
  }
}
