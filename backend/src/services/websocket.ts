import { randomUUID } from "crypto";
import { config } from "../config/index.js";
import { redactionService } from "../privacy/redaction.service.js";
import { redactionDecisionService } from "../privacy/redactionDecision.service.js";

const MAX_HISTORY_PER_TOPIC = config.WS_MAX_HISTORY_PER_TOPIC;
const MAX_HISTORY_AGE_MS = config.WS_MAX_HISTORY_AGE_MS;
const BATCH_INTERVAL_MS = config.WS_BATCH_INTERVAL_MS;
const MAX_BATCH_SIZE = config.WS_MAX_BATCH_SIZE;
const MESSAGE_RATE_LIMIT_WINDOW_MS = config.WS_RATE_LIMIT_WINDOW_MS;
const MAX_MESSAGES_PER_WINDOW = config.WS_RATE_LIMIT_MAX_MESSAGES;
const HEARTBEAT_INTERVAL_MS = config.WS_HEARTBEAT_INTERVAL_MS;
const HEARTBEAT_TIMEOUT_MS = config.WS_HEARTBEAT_TIMEOUT_MS;

export type WebsocketMessageType =
  | "price_update"
  | "health_score"
  | "alert_notification"
  | "transaction_update"
  | "system"
  | "batch"
  | "replay";

export type WebsocketMessagePriority = "critical" | "high" | "medium" | "low";

export interface WebsocketBroadcastMessage {
  id: string;
  sequence: number;
  type: WebsocketMessageType;
  topic: string;
  priority: WebsocketMessagePriority;
  payload: unknown;
  timestamp: string;
  expiresAt: string;
  ackRequired: boolean;
}

export interface WebsocketPublishOptions {
  priority?: WebsocketMessagePriority;
  ackRequired?: boolean;
  timestamp?: string;
}

export interface WebsocketSubscribeRequest {
  topic: string;
  filter?: Record<string, unknown>;
}

export interface WebsocketClientInfo {
  id: string;
  connectedAt: string;
  lastSeen: number;
  subscriptions: string[];
  filters: Record<string, Record<string, unknown>>;
  presence: "online" | "offline";
}

export interface WebsocketReplayMetrics {
  totalStored: number;
  totalExpired: number;
  replayRequests: number;
  replayMessagesDelivered: number;
  sequenceHighWatermark: number;
  topicSizes: Record<string, number>;
}

interface SocketConnection {
  send: (message: string) => void;
  ping(data?: Buffer): void;
  terminate(): void;
  on: (event: string, callback: (...args: unknown[]) => void) => void;
  readyState?: number;
}

interface ClientState {
  id: string;
  socket?: SocketConnection;
  connectedAt: string;
  lastSeen: number;
  presence: "online" | "offline";
  subscriptions: Set<string>;
  filters: Map<string, Record<string, unknown>>;
  pendingAcks: Map<string, number>;
  rateLimitWindowStart: number;
  rateLimitCount: number;
  pendingPing: boolean;
}

interface QueuedMessage {
  message: WebsocketBroadcastMessage;
  targets: Set<string>;
  enqueuedAt: number;
}

const PRIORITY_WEIGHT: Record<WebsocketMessagePriority, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export class WebsocketService {
  private static instance: WebsocketService;
  private clients = new Map<string, ClientState>();
  private topicSubscribers = new Map<string, Set<string>>();
  private history = new Map<string, WebsocketBroadcastMessage[]>();
  private sequenceCounter = 0;
  private replayMetrics = {
    totalExpired: 0,
    replayRequests: 0,
    replayMessagesDelivered: 0,
  };
  private queue: QueuedMessage[] = [];
  private batchTimer: ReturnType<typeof setInterval>;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  private constructor() {
    this.batchTimer = setInterval(() => this.flushQueue(), BATCH_INTERVAL_MS);
    this.startHeartbeat();
  }

  public static getInstance(): WebsocketService {
    if (!this.instance) {
      this.instance = new WebsocketService();
    }

    return this.instance;
  }

  public addClient(socket: SocketConnection, resumeId?: string): string {
    const now = Date.now();
    if (resumeId && this.clients.has(resumeId)) {
      const existing = this.clients.get(resumeId)!;
      existing.socket = socket;
      existing.presence = "online";
      existing.lastSeen = now;
      existing.rateLimitWindowStart = now;
      existing.rateLimitCount = 0;
      existing.pendingPing = false;
      this.registerSocketHandlers(existing, socket);
      this.sendSystem(socket, {
        message: "resumed",
        clientId: existing.id,
        timestamp: new Date().toISOString(),
      });
      this.sendReplay(existing.id);
      return existing.id;
    }

    const clientId = randomUUID();
    const client: ClientState = {
      id: clientId,
      socket,
      connectedAt: new Date().toISOString(),
      lastSeen: now,
      presence: "online",
      subscriptions: new Set(),
      filters: new Map(),
      pendingAcks: new Map(),
      rateLimitWindowStart: now,
      rateLimitCount: 0,
      pendingPing: false,
    };

    this.clients.set(clientId, client);
    this.registerSocketHandlers(client, socket);

    this.sendSystem(socket, {
      message: "connected",
      clientId,
      timestamp: new Date().toISOString(),
    });

    return clientId;
  }

  public removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;
    this.cleanupSubscriptions(client);

    // Purge disconnected client from all topic subscriber sets
    for (const [topic, subscribers] of this.topicSubscribers.entries()) {
      subscribers.delete(clientId);
      if (subscribers.size === 0) {
        this.topicSubscribers.delete(topic);
      }
    }

    client.presence = "offline";
    client.socket = undefined;
    // Intentionally do NOT update lastSeen so the heartbeat sweep can
    // detect and purge stale clients that silently disconnected.
  }

  private registerSocketHandlers(
    client: ClientState,
    socket: SocketConnection,
  ): void {
    socket.on("pong", () => {
      client.lastSeen = Date.now();
      client.pendingPing = false;
    });

    socket.on("close", () => {
      this.removeClient(client.id);
    });
  }

  public touchClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.lastSeen = Date.now();
    }
  }

  public subscribe(
    clientId: string,
    topic: string,
    filter: Record<string, unknown> = {},
  ): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.subscriptions.add(topic);
    if (Object.keys(filter).length > 0) {
      client.filters.set(topic, filter);
    }

    const subscribers = this.topicSubscribers.get(topic) ?? new Set();
    subscribers.add(clientId);
    this.topicSubscribers.set(topic, subscribers);

    if (client.socket) {
      this.sendSystem(client.socket, {
        message: "subscribed",
        topic,
        timestamp: new Date().toISOString(),
      });
    }

    this.sendReplay(clientId, [topic]);
  }

  public unsubscribe(clientId: string, topic: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.subscriptions.delete(topic);
    client.filters.delete(topic);
    const subscribers = this.topicSubscribers.get(topic);
    subscribers?.delete(clientId);

    if (client.socket) {
      this.sendSystem(client.socket, {
        message: "unsubscribed",
        topic,
        timestamp: new Date().toISOString(),
      });
    }
  }

  public publish(
    type: Exclude<WebsocketMessageType, "batch" | "replay">,
    topic: string,
    payload: unknown,
    options: WebsocketPublishOptions = {},
  ): void {
    // Redact operational payloads before they enter replay history or are
    // delivered, so addresses, hashes, and evidence are not exposed over the
    // socket or replayed on reconnect.
    const result = redactionService.redact(payload, { sink: "websocket" });
    void redactionDecisionService.record(result.decision);
    const safePayload = result.output;

    const timestamp = options.timestamp ?? new Date().toISOString();
    const createdAtMs = Date.parse(timestamp);
    const expiresAtMs =
      (Number.isFinite(createdAtMs) ? createdAtMs : Date.now()) +
      MAX_HISTORY_AGE_MS;
    const message: WebsocketBroadcastMessage = {
      id: randomUUID(),
      sequence: ++this.sequenceCounter,
      type,
      topic,
      priority: options.priority ?? "medium",
      payload: safePayload,
      timestamp,
      expiresAt: new Date(expiresAtMs).toISOString(),
      ackRequired: options.ackRequired ?? false,
    };

    this.recordHistory(message);
    this.enqueue(message);
  }

  public receiveAck(clientId: string, messageId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;
    client.pendingAcks.delete(messageId);
  }

  public getClientInfo(clientId: string): WebsocketClientInfo | undefined {
    const client = this.clients.get(clientId);
    if (!client) return undefined;
    return {
      id: client.id,
      connectedAt: client.connectedAt,
      lastSeen: client.lastSeen,
      subscriptions: Array.from(client.subscriptions),
      filters: Object.fromEntries(client.filters),
      presence: client.presence,
    };
  }

  public listClients(): WebsocketClientInfo[] {
    return Array.from(this.clients.values()).map((client) => ({
      id: client.id,
      connectedAt: client.connectedAt,
      lastSeen: client.lastSeen,
      subscriptions: Array.from(client.subscriptions),
      filters: Object.fromEntries(client.filters),
      presence: client.presence,
    }));
  }

  public getReplayMessages(
    topics: string[] = [],
    options: {
      limit?: number;
      sinceSequence?: number;
    } = {},
  ): WebsocketBroadcastMessage[] {
    const replayTopics = topics.length > 0 ? topics : ["*"];
    const limit = Math.min(
      Math.max(options.limit ?? MAX_BATCH_SIZE, 1),
      MAX_HISTORY_PER_TOPIC,
    );
    const sinceSequence = options.sinceSequence ?? 0;

    const replayMessages: WebsocketBroadcastMessage[] = [];
    for (const [topic, history] of this.history.entries()) {
      this.pruneExpired(topic, history);
      if (
        !replayTopics.some((subscription) =>
          this.topicMatches(subscription, topic),
        )
      ) {
        continue;
      }

      for (const message of this.history.get(topic) ?? []) {
        if (message.sequence > sinceSequence) {
          replayMessages.push(message);
        }
      }
    }

    replayMessages.sort((left, right) => left.sequence - right.sequence);
    this.replayMetrics.replayRequests += 1;

    const sliced = replayMessages.slice(-limit);
    this.replayMetrics.replayMessagesDelivered += sliced.length;
    return sliced;
  }

  public getReplayMetrics(): WebsocketReplayMetrics {
    const topicSizes: Record<string, number> = {};
    let totalStored = 0;

    for (const [topic, history] of this.history.entries()) {
      this.pruneExpired(topic, history);
      const size = this.history.get(topic)?.length ?? 0;
      topicSizes[topic] = size;
      totalStored += size;
    }

    return {
      totalStored,
      totalExpired: this.replayMetrics.totalExpired,
      replayRequests: this.replayMetrics.replayRequests,
      replayMessagesDelivered: this.replayMetrics.replayMessagesDelivered,
      sequenceHighWatermark: this.sequenceCounter,
      topicSizes,
    };
  }

  private enqueue(message: WebsocketBroadcastMessage): void {
    const targets = this.getMatchingClients(message.topic, message.payload);
    if (targets.size === 0) return;

    this.queue.push({
      message,
      targets,
      enqueuedAt: Date.now(),
    });
    this.queue.sort(
      (a, b) =>
        PRIORITY_WEIGHT[b.message.priority] -
        PRIORITY_WEIGHT[a.message.priority],
    );
    if (message.priority === "critical" || message.priority === "high") {
      this.flushQueue();
    }
  }

  private flushQueue(): void {
    if (this.queue.length === 0) return;

    const clientBatches = new Map<string, WebsocketBroadcastMessage[]>();
    const now = Date.now();

    while (this.queue.length > 0) {
      const queued = this.queue.shift();
      if (!queued) break;
      for (const clientId of queued.targets) {
        const client = this.clients.get(clientId);
        if (!client || client.presence !== "online" || !client.socket) {
          continue;
        }

        if (!this.canSend(client, now)) {
          continue;
        }

        if (!clientBatches.has(clientId)) {
          clientBatches.set(clientId, []);
        }

        const batch = clientBatches.get(clientId)!;
        batch.push(queued.message);
        if (queued.message.ackRequired) {
          client.pendingAcks.set(queued.message.id, Date.now());
        }

        if (batch.length >= MAX_BATCH_SIZE) {
          this.sendBatch(clientId, batch.splice(0, batch.length));
        }
      }
    }

    for (const [clientId, messages] of clientBatches.entries()) {
      if (messages.length > 0) {
        this.sendBatch(clientId, messages);
      }
    }
  }

  private sendBatch(
    clientId: string,
    messages: WebsocketBroadcastMessage[],
  ): void {
    const client = this.clients.get(clientId);
    if (!client || client.presence !== "online" || !client.socket) return;
    this.sendMessage(client.socket, {
      type: "batch",
      messages,
    });
  }

  private canSend(client: ClientState, now: number): boolean {
    if (now - client.rateLimitWindowStart > MESSAGE_RATE_LIMIT_WINDOW_MS) {
      client.rateLimitWindowStart = now;
      client.rateLimitCount = 0;
    }
    if (client.rateLimitCount >= MAX_MESSAGES_PER_WINDOW) {
      return false;
    }
    client.rateLimitCount += 1;
    return true;
  }

  private getMatchingClients(topic: string, payload: unknown): Set<string> {
    const matching = new Set<string>();
    for (const client of this.clients.values()) {
      if (client.presence !== "online") continue;
      for (const subscription of client.subscriptions) {
        if (!this.topicMatches(subscription, topic)) continue;
        const filter = client.filters.get(subscription);
        if (filter && !this.filterMatches(filter, payload)) continue;
        matching.add(client.id);
      }
    }
    return matching;
  }

  private topicMatches(subscription: string, topic: string): boolean {
    if (subscription === topic) return true;
    if (subscription === "*") return true;
    if (topic.startsWith(`${subscription}:`)) return true;
    if (subscription.startsWith(`${topic}:`)) return true;
    return false;
  }

  private filterMatches(
    filter: Record<string, unknown>,
    payload: unknown,
  ): boolean {
    if (typeof payload !== "object" || payload === null) return false;

    for (const [key, value] of Object.entries(filter)) {
      const payloadValue = (payload as Record<string, unknown>)[key];
      if (payloadValue === undefined) return false;
      if (Array.isArray(value)) {
        if (Array.isArray(payloadValue)) {
          if (
            !value.some((item) => (payloadValue as unknown[]).includes(item))
          ) {
            return false;
          }
        } else if (!value.includes(payloadValue)) {
          return false;
        }
      } else if (payloadValue !== value) {
        return false;
      }
    }

    return true;
  }

  private recordHistory(message: WebsocketBroadcastMessage): void {
    const history = this.history.get(message.topic) ?? [];
    history.push(message);
    this.pruneExpired(message.topic, history);
    while (history.length > MAX_HISTORY_PER_TOPIC) {
      history.shift();
    }
    this.history.set(message.topic, history);
  }

  private sendReplay(clientId: string, topics: string[] = []): void {
    const client = this.clients.get(clientId);
    if (!client || client.presence !== "online" || !client.socket) return;

    const replayTopics =
      topics.length > 0 ? topics : Array.from(client.subscriptions);
    const replayMessages = this.getReplayMessages(replayTopics, {
      limit: MAX_BATCH_SIZE,
    });

    if (replayMessages.length === 0) {
      return;
    }

    this.sendMessage(client.socket, {
      type: "replay",
      messages: replayMessages.slice(-MAX_BATCH_SIZE),
    });
  }

  private pruneExpired(
    topic: string,
    history: WebsocketBroadcastMessage[],
  ): void {
    const now = Date.now();
    const kept = history.filter(
      (message) => Date.parse(message.expiresAt) > now,
    );
    const removed = history.length - kept.length;
    if (removed > 0) {
      this.replayMetrics.totalExpired += removed;
    }

    if (kept.length > 0) {
      this.history.set(topic, kept);
      return;
    }

    this.history.delete(topic);
  }

  private cleanupSubscriptions(client: ClientState): void {
    for (const topic of client.subscriptions) {
      const subscribers = this.topicSubscribers.get(topic);
      subscribers?.delete(client.id);
      if (subscribers && subscribers.size === 0) {
        this.topicSubscribers.delete(topic);
      }
    }
    client.subscriptions.clear();
    client.filters.clear();
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();

      for (const [clientId, client] of this.clients) {
        if (client.pendingPing) {
          // eslint-disable-next-line no-console
          console.warn(
            `[WebsocketService] Client ${clientId} missed pong – terminating connection`,
          );
          client.socket?.terminate();
          this.cleanupSubscriptions(client);
          this.clients.delete(clientId);
          continue;
        }

        const cutoffMs = now - (HEARTBEAT_INTERVAL_MS + HEARTBEAT_TIMEOUT_MS);
        if (client.lastSeen < cutoffMs) {
          // eslint-disable-next-line no-console
          console.warn(
            `[WebsocketService] Client ${clientId} heartbeat timeout – terminating connection`,
          );
          client.socket?.terminate();
          this.cleanupSubscriptions(client);
          this.clients.delete(clientId);
          continue;
        }

        if (client.socket && client.presence === "online") {
          client.pendingPing = true;
          client.socket.ping();
        }
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private sendMessage(connection: SocketConnection, payload: unknown): void {
    try {
      connection.send(JSON.stringify(payload));
    } catch (error) {
      // ignore send errors; socket may be closing.
    }
  }

  private sendSystem(
    connection: SocketConnection,
    payload: Record<string, unknown>,
  ): void {
    this.sendMessage(connection, { type: "system", ...payload });
  }

  public shutdown(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
    }
  }
}
