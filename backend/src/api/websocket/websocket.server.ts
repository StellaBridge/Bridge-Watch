import { randomUUID } from "crypto";
import type { FastifyRequest } from "fastify";
import { config } from "../../config/index.js";
import { logger } from "../../utils/logger.js";
import { redactionService } from "../../privacy/redaction.service.js";
import { redactionDecisionService } from "../../privacy/redactionDecision.service.js";
import { factory, redisSubscriber } from "../../utils/redis.js";
import {
  type ClientState,
  type ChannelName,
  type InboundMessage,
  type OutboundMessage,
  type OutboundDataMessage,
  type ConnectionMetrics,
  type IBroadcaster,
  WsErrorCode,
  PRIVATE_CHANNELS,
  REDIS_WS_CHANNELS,
  ALL_CHANNELS,
} from "./types.js";
import {
  handleSubscribe,
  handleUnsubscribe,
  handlePing,
} from "./handlers/index.js";
import { ChannelManager } from "./channels/index.js";

/** `ws` WebSocket.OPEN numeric value (avoids importing ws directly). */
const WS_OPEN = 1;

/**
 * How often the server sends WebSocket-protocol ping frames to clients.
 * Clients that have not responded within HEARTBEAT_TIMEOUT_MS are terminated.
 */
const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 10_000;

/**
 * Central WebSocket server manager.
 *
 * Responsibilities
 * ────────────────
 * • Accepts incoming connections and maintains per-client {@link ClientState}.
 * • Routes inbound messages to the correct handler.
 * • Enforces a per-client sliding-window rate limit.
 * • Runs a WebSocket-protocol ping/pong heartbeat; terminates idle clients.
 * • Broadcasts outbound messages to channel subscribers.
 * • Subscribes to Redis pub/sub so all server instances share the same stream.
 * • Exposes aggregated connection metrics for monitoring.
 * • Performs a graceful shutdown: drains channels, closes sockets, quits Redis.
 *
 * Implements {@link IBroadcaster} so channel classes can call
 * `broadcastToChannel` without importing this file (breaks circular deps).
 */
export class WebSocketServer implements IBroadcaster {
  /** Active client connections keyed by client UUID. */
  private readonly clients = new Map<string, ClientState>();

  private readonly channelManager: ChannelManager;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * Shared Redis subscriber from the factory.
   * A Redis client in subscribe mode cannot issue regular commands, so we keep
   * a separate subscriber client here and use the standard `redis` for publishing.
   */
  private readonly subscriber: typeof redisSubscriber;

  private readonly counters = {
    totalConnections: 0,
    totalMessagesReceived: 0,
    totalMessagesSent: 0,
    startedAt: Date.now(),
  };

  constructor() {
    this.channelManager = new ChannelManager(this);

    this.subscriber = redisSubscriber;

    this.subscriber.on("error", (err) => {
      logger.error({ err }, "WS Redis subscriber error");
    });

    this.setupRedisSubscriber().catch((err) => {
      logger.error({ err }, "Failed to set up WS Redis subscriber");
    });

    this.startHeartbeat();
  }

  // ─── Redis pub/sub ──────────────────────────────────────────────────────────

  private async setupRedisSubscriber(): Promise<void> {
    await this.subscriber.connect();

    const redisChannels = Object.values(REDIS_WS_CHANNELS);
    await this.subscriber.subscribe(...redisChannels);

    this.subscriber.on("message", (redisChannel: string, payload: string) => {
      // Reverse-map the Redis channel key back to the WS channel name
      const entry = (
        Object.entries(REDIS_WS_CHANNELS) as [ChannelName, string][]
      ).find(([, rc]) => rc === redisChannel);

      if (!entry) return;

      const [channel] = entry;
      // Deliver directly to local subscribers; don't re-publish to Redis.
      this.broadcastLocal(channel, payload);
    });

    logger.info({ channels: redisChannels }, "WS Redis subscriber ready");
  }

  /**
   * Publish a message to the corresponding Redis pub/sub channel so that all
   * other server instances forward it to their local subscribers.
   */
  private async publishToRedis(
    channel: ChannelName,
    payload: string
  ): Promise<void> {
    await factory.getClient().publish(REDIS_WS_CHANNELS[channel], payload);
  }

  // ─── Connection handling ────────────────────────────────────────────────────

  /**
   * Register a new client connection.
   * Must be called from the Fastify WebSocket route handler.
   *
   * @param socket  The raw `ws.WebSocket` instance (first arg from @fastify/websocket v10).
   * @param request The originating Fastify request (used for IP, query params).
   */
  handleConnection(socket: ClientState["socket"], request: FastifyRequest): void {
    const clientId = randomUUID();
    const ip = request.ip;
    const query = request.query as Record<string, string>;

    // Allow authentication at connection time via ?token= query param so
    // clients can subscribe to private channels immediately after connecting.
    const token = query.token;
    const tenantId = query.tenant_id as string | undefined;
    const isAuthenticated = token ? this.validateToken(token) : false;

    const state: ClientState = {
      id: clientId,
      socket,
      subscriptions: new Set(),
      isAuthenticated,
      connectedAt: new Date(),
      lastSeen: new Date(),
      messageCount: 0,
      windowStart: Date.now(),
      ip,
      pendingPing: false,
      tenantId: isAuthenticated ? tenantId : undefined,
    };

    this.clients.set(clientId, state);
    this.counters.totalConnections++;

    logger.info(
      { clientId, ip, totalActive: this.clients.size },
      "WebSocket client connected"
    );

    // Send the welcome message so the client knows its assigned ID and the
    // available channels before it starts subscribing.
    this.sendToClientState(state, {
      type: "welcome",
      clientId,
      channels: ALL_CHANNELS,
      timestamp: new Date().toISOString(),
    });

    socket.on("message", (data: Buffer) => this.handleMessage(state, data));

    // Update lastSeen on protocol-level pong (heartbeat response).
    socket.on("pong", () => {
      state.lastSeen = new Date();
      state.pendingPing = false;
    });

    socket.on("close", () => this.removeClient(state));

    socket.on("error", (err: Error) => {
      logger.error({ err, clientId }, "WebSocket socket error");
      this.removeClient(state);
    });
  }

  // ─── Inbound message routing ────────────────────────────────────────────────

  private handleMessage(state: ClientState, data: Buffer): void {
    state.lastSeen = new Date();
    this.counters.totalMessagesReceived++;

    // ── Per-client sliding-window rate limit ────────────────────────────────
    const now = Date.now();
    if (now - state.windowStart > config.RATE_LIMIT_WINDOW_MS) {
      state.messageCount = 0;
      state.windowStart = now;
    }

    if (state.messageCount >= config.RATE_LIMIT_MAX) {
      this.sendToClientState(state, {
        type: "error",
        message: "Rate limit exceeded. Reduce your message frequency.",
        code: WsErrorCode.RATE_LIMITED,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    state.messageCount++;

    // ── Parse ───────────────────────────────────────────────────────────────
    let message: InboundMessage;
    try {
      message = JSON.parse(data.toString()) as InboundMessage;
    } catch {
      this.sendToClientState(state, {
        type: "error",
        message: "Payload must be valid JSON.",
        code: WsErrorCode.INVALID_JSON,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    logger.debug(
      { clientId: state.id, msgType: message.type },
      "WS inbound message"
    );

    // ── Dispatch ────────────────────────────────────────────────────────────
    switch (message.type) {
      case "subscribe":
        handleSubscribe(state, message, this);
        break;
      case "unsubscribe":
        handleUnsubscribe(state, message, this);
        break;
      case "ping":
        handlePing(state, this);
        break;
      default: {
        const unknown = (message as { type: string }).type;
        this.sendToClientState(state, {
          type: "error",
          message: `Unknown message type: "${unknown}"`,
          code: WsErrorCode.INVALID_MESSAGE,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  private removeClient(state: ClientState): void {
    if (!this.clients.has(state.id)) return; // guard against double-removal

    logger.info(
      { clientId: state.id, totalActive: this.clients.size - 1 },
      "WebSocket client disconnected"
    );

    for (const channel of state.subscriptions) {
      this.channelManager.removeSubscriber(channel, state.id);
    }

    this.clients.delete(state.id);
  }

  // ─── Outbound delivery ──────────────────────────────────────────────────────

  /**
   * Serialise and send a typed message to a single client by ClientState.
   * No-ops silently when the socket is no longer open.
   */
  sendToClientState(state: ClientState, message: OutboundMessage): void {
    if (state.socket.readyState !== WS_OPEN) return;

    try {
      state.socket.send(JSON.stringify(message));
      this.counters.totalMessagesSent++;
    } catch (err) {
      logger.warn({ err, clientId: state.id }, "Failed to send WS message");
    }
  }

  /**
   * Send a data message to a single client identified by their UUID.
   * Implements {@link IBroadcaster}. No-ops when the client is not found.
   */
  sendToClient(clientId: string, message: OutboundDataMessage): void {
    const state = this.clients.get(clientId);
    if (!state) return;
    this.sendToClientState(state, message);
  }

  /**
   * Deliver a pre-serialised JSON string to every local subscriber of the
   * given channel without publishing to Redis.
   */
  broadcastLocal(channel: ChannelName, payload: string): void {
    const subscribers = this.channelManager.getSubscribers(channel);
    for (const clientId of subscribers) {
      const state = this.clients.get(clientId);
      if (state && state.socket.readyState === WS_OPEN) {
        try {
          state.socket.send(payload);
          this.counters.totalMessagesSent++;
        } catch (err) {
          logger.warn({ err, clientId }, "WS broadcast send failed");
        }
      }
    }
  }

  /**
   * Broadcast a typed data message to local subscribers AND publish to Redis
   * so other server instances can forward it to their own subscribers.
   *
   * Implements {@link IBroadcaster}.
   */
  async broadcastToChannel(
    channel: ChannelName,
    message: OutboundDataMessage
  ): Promise<void> {
    // Redact operational fields (addresses, evidence, endpoint details) before
    // the message is serialized to local clients and published to Redis, so no
    // cross-instance sink exposes the sensitive material.
    const result = redactionService.redact(message, { sink: "websocket" });
    void redactionDecisionService.record(result.decision, { resourceType: "websocket", resourceId: channel });

    const payload = JSON.stringify(result.output);
    this.broadcastLocal(channel, payload);

    await this.publishToRedis(channel, payload).catch((err) => {
      logger.error({ err, channel }, "WS Redis publish failed");
    });
  }

  // ─── Subscription helpers (used by handlers) ────────────────────────────────

  addSubscription(state: ClientState, channel: ChannelName): void {
    state.subscriptions.add(channel);
    this.channelManager.addSubscriber(channel, state.id);
    this.channelManager.ensureChannelActive(channel);
  }

  removeSubscription(state: ClientState, channel: ChannelName): void {
    state.subscriptions.delete(channel);
    this.channelManager.removeSubscriber(channel, state.id);
  }

  // ─── Auth ───────────────────────────────────────────────────────────────────

  /**
   * Returns `true` when `token` matches the configured `WS_AUTH_SECRET`.
   * Always returns `false` when no secret is configured (auth disabled).
   */
  validateToken(token: string): boolean {
    const secret = config.WS_AUTH_SECRET;
    if (!secret) return false;
    // Constant-time string comparison is unnecessary here because
    // WS_AUTH_SECRET is a server-side secret, not a user password.
    return token === secret;
  }

  isPrivateChannel(channel: ChannelName): boolean {
    return PRIVATE_CHANNELS.has(channel);
  }

  // ─── Heartbeat ──────────────────────────────────────────────────────────────

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();

      for (const state of this.clients.values()) {
        // A client that was pinged last sweep and never replied with a pong
        // has silently disappeared – terminate immediately.
        if (state.pendingPing) {
          logger.warn(
            { clientId: state.id },
            "WebSocket client missed pong – terminating connection"
          );
          state.socket.terminate();
          this.removeClient(state);
          continue;
        }

        // If the client has not been seen for longer than the combined
        // interval + timeout window, it is also considered dead.
        const cutoffMs = now - (HEARTBEAT_INTERVAL_MS + HEARTBEAT_TIMEOUT_MS);
        if (state.lastSeen.getTime() < cutoffMs) {
          logger.warn(
            { clientId: state.id },
            "WebSocket client heartbeat timeout – terminating connection"
          );
          state.socket.terminate();
          this.removeClient(state);
          continue;
        }

        // Send a ping; the pong handler will clear `pendingPing`.
        if (state.socket.readyState === WS_OPEN) {
          state.pendingPing = true;
          state.socket.ping();
        }
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  // ─── Metrics ────────────────────────────────────────────────────────────────

  getMetrics(): ConnectionMetrics {
    const subscriptionCounts = {} as Record<ChannelName, number>;
    for (const ch of ALL_CHANNELS) {
      subscriptionCounts[ch] = this.channelManager.getSubscriberCount(ch);
    }

    return {
      totalConnections: this.counters.totalConnections,
      activeConnections: this.clients.size,
      totalMessagesReceived: this.counters.totalMessagesReceived,
      totalMessagesSent: this.counters.totalMessagesSent,
      subscriptionCounts,
      uptime: Date.now() - this.counters.startedAt,
    };
  }

  // ─── Shutdown ───────────────────────────────────────────────────────────────

  /**
   * Gracefully shut down the WebSocket server:
   *  1. Stop the heartbeat timer.
   *  2. Stop all channel polling loops.
   *  3. Close every open client connection with code 1001 (Going Away).
   *  4. Quit the Redis subscriber connection.
   */
  async shutdown(): Promise<void> {
    logger.info(
      { activeConnections: this.clients.size },
      "WebSocket server shutting down"
    );

    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    await this.channelManager.stopAll();

    for (const state of this.clients.values()) {
      try {
        state.socket.close(1001, "Server is shutting down");
      } catch {
        // Ignore – socket may already be closed
      }
    }

    this.clients.clear();

    try {
      await this.subscriber.quit();
    } catch {
      // Ignore – subscriber may already be closed
    }

    logger.info("WebSocket server shutdown complete");
  }
}

/**
 * Singleton WebSocket server instance shared across the application.
 *
 * Channels and the Fastify route handler both reference this instance.
 * On graceful shutdown call `wsServer.shutdown()`.
 */
export const wsServer = new WebSocketServer();
