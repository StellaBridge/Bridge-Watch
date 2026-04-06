import { logger } from "../../../utils/logger.js";
import type {
  ChannelName,
  IBroadcaster,
  OutboundDataMessage,
} from "../types.js";

// ─── BaseChannel ──────────────────────────────────────────────────────────────

/**
 * Abstract base for all pub/sub data channels.
 *
 * Each concrete channel:
 *  - Manages the set of subscribed client IDs
 *  - Starts a polling loop when the first subscriber joins
 *  - Stops the loop when the last subscriber leaves
 *  - Calls `broadcaster.broadcastToChannel()` to deliver data
 */
export abstract class BaseChannel {
  protected readonly subscribers = new Set<string>();
  private pollingTimer: ReturnType<typeof setInterval> | null = null;
  protected isActive = false;

  constructor(protected readonly broadcaster: IBroadcaster) {}

  abstract get name(): ChannelName;

  /** Polling interval in milliseconds. */
  abstract get pollingIntervalMs(): number;

  /** Fetch data from the underlying service and broadcast to subscribers. */
  abstract fetchAndBroadcast(): Promise<void>;

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  start(): void {
    if (this.isActive) return;
    this.isActive = true;

    // Immediate first fetch so subscribers get data right away.
    this.fetchAndBroadcast().catch((err) => {
      logger.warn({ err, channel: this.name }, "Initial channel fetch failed");
    });

    this.pollingTimer = setInterval(() => {
      this.fetchAndBroadcast().catch((err) => {
        logger.warn({ err, channel: this.name }, "Channel polling error");
      });
    }, this.pollingIntervalMs);

    logger.debug({ channel: this.name }, "Channel polling started");
  }

  stop(): void {
    if (!this.isActive) return;
    if (this.pollingTimer !== null) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
    this.isActive = false;
    logger.debug({ channel: this.name }, "Channel polling stopped");
  }

  // ─── Subscriber management ─────────────────────────────────────────────────

  addSubscriber(clientId: string): void {
    this.subscribers.add(clientId);
  }

  removeSubscriber(clientId: string): void {
    this.subscribers.delete(clientId);
    if (this.subscribers.size === 0) {
      this.stop();
    }
  }

  getSubscribers(): Set<string> {
    return this.subscribers;
  }

  get subscriberCount(): number {
    return this.subscribers.size;
  }

  // ─── Helper ────────────────────────────────────────────────────────────────

  protected async broadcast(message: OutboundDataMessage): Promise<void> {
    await this.broadcaster.broadcastToChannel(this.name, message);
  }
}
