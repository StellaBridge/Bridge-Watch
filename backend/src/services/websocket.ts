import { randomUUID } from "crypto";

const MAX_HISTORY_PER_TOPIC = 50;
const BATCH_INTERVAL_MS = 120;
const MAX_BATCH_SIZE = 20;
const MESSAGE_RATE_LIMIT_WINDOW_MS = 1000;
const MAX_MESSAGES_PER_WINDOW = 20;

export type WebsocketMessageType =
  | "price_update"
  | "health_score"
  | "alert_notification"
  | "system"
  | "batch"
  | "replay";

export type WebsocketMessagePriority = "critical" | "high" | "medium" | "low";

export interface WebsocketBroadcastMessage {
  id: string;
  type: WebsocketMessageType;
  topic: string;
  priority: WebsocketMessagePriority;
  payload: unknown;
  timestamp: string;
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

interface SocketConnection {
  send: (message: string) => void;
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
  private queue: QueuedMessage[] = [];
  private batchTimer: ReturnType<typeof setInterval>;

  private constructor() {
    this.batchTimer = setInterval(() => this.flushQueue(), BATCH_INTERVAL_MS);
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
    };

    this.clients.set(clientId, client);
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
    client.presence = "offline";
    client.socket = undefined;
    client.lastSeen = Date.now();
  }

  public subscribe(clientId: string, topic: string, filter: Record<string, unknown> = {}): void {
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
    const message: WebsocketBroadcastMessage = {
      id: randomUUID(),
      type,
      topic,
      priority: options.priority ?? "medium",
      payload,
      timestamp: options.timestamp ?? new Date().toISOString(),
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

  private enqueue(message: WebsocketBroadcastMessage): void {
    const targets = this.getMatchingClients(message.topic, message.payload);
    if (targets.size === 0) return;

    this.queue.push({
      message,
      targets,
      enqueuedAt: Date.now(),
    });
    this.queue.sort((a, b) => PRIORITY_WEIGHT[b.message.priority] - PRIORITY_WEIGHT[a.message.priority]);
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

  private sendBatch(clientId: string, messages: WebsocketBroadcastMessage[]): void {
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

  private filterMatches(filter: Record<string, unknown>, payload: unknown): boolean {
    if (typeof payload !== "object" || payload === null) return false;

    for (const [key, value] of Object.entries(filter)) {
      const payloadValue = (payload as Record<string, unknown>)[key];
      if (payloadValue === undefined) return false;
      if (Array.isArray(value)) {
        if (Array.isArray(payloadValue)) {
          if (!value.some((item) => (payloadValue as unknown[]).includes(item))) {
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
    while (history.length > MAX_HISTORY_PER_TOPIC) {
      history.shift();
    }
    this.history.set(message.topic, history);
  }

  private sendReplay(clientId: string, topics: string[] = []): void {
    const client = this.clients.get(clientId);
    if (!client || client.presence !== "online" || !client.socket) return;

    const replayTopics = topics.length > 0 ? topics : Array.from(client.subscriptions);
    const replayMessages: WebsocketBroadcastMessage[] = [];

    for (const [topic, history] of this.history.entries()) {
      if (replayTopics.some((subscription) => this.topicMatches(subscription, topic))) {
        replayMessages.push(...history);
      }
    }

    if (replayMessages.length === 0) {
      return;
    }

    this.sendMessage(client.socket, {
      type: "replay",
      messages: replayMessages.slice(-MAX_BATCH_SIZE),
    });
  }

  private sendMessage(connection: SocketConnection, payload: unknown): void {
    try {
      connection.send(JSON.stringify(payload));
    } catch (error) {
      // ignore send errors; socket may be closing.
    }
  }

  private sendSystem(connection: SocketConnection, payload: Record<string, unknown>): void {
    this.sendMessage(connection, { type: "system", ...payload });
  }
}
