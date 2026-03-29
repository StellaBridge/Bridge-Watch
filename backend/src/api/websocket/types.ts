/**
 * TypeScript types for all WebSocket message formats.
 *
 * Message flow overview:
 *   Client  →  Server : InboundMessage  (subscribe / unsubscribe / ping)
 *   Server  →  Client : OutboundMessage (ack / data updates / errors)
 *
 * Available channels:
 *   prices  – aggregated VWAP prices for all supported Stellar assets  (public)
 *   health  – composite health scores per asset                        (public)
 *   bridges – bridge status and TVL updates                            (public)
 *   alerts  – real-time alert events                                   (private, auth required)
 */

// ─── Minimal WebSocket interface ──────────────────────────────────────────────

/**
 * Minimal surface of a `ws.WebSocket` that this module needs.
 * Using an interface instead of importing from `ws` avoids a transitive
 * dependency appearing in the project's own package.json.
 */
export interface WsSocket {
  readyState: number;
  send(data: string, cb?: (err?: Error) => void): void;
  ping(data?: Buffer): void;
  terminate(): void;
  close(code?: number, reason?: string): void;
  on(event: "message", cb: (data: Buffer) => void): this;
  on(event: "pong", cb: () => void): this;
  on(event: "close", cb: () => void): this;
  on(event: "error", cb: (err: Error) => void): this;
}

// ─── Channel definition ────────────────────────────────────────────────────────

/** Names of all available subscription channels. */
export type ChannelName = "prices" | "health" | "alerts" | "bridges";

/** Channels that require a valid auth token to subscribe. */
export const PRIVATE_CHANNELS = new Set<ChannelName>(["alerts"]);

/** All channel names in a stable array for enumeration. */
export const ALL_CHANNELS: ChannelName[] = [
  "prices",
  "health",
  "alerts",
  "bridges",
];

// ─── Broadcaster interface (breaks circular dep with channels) ─────────────────

/**
 * Minimal interface that channels need from the WebSocketServer.
 * Using an interface here breaks the circular import between
 * `websocket.server.ts` and `channels/index.ts`.
 */
export interface IBroadcaster {
  broadcastToChannel(
    channel: ChannelName,
    message: OutboundDataMessage
  ): Promise<void>;
}

// ─── Inbound messages (Client → Server) ───────────────────────────────────────

export interface ClientSubscribeMessage {
  type: "subscribe";
  /** Channel to subscribe to. */
  channel: ChannelName;
  /**
   * Bearer token required when subscribing to private channels (e.g. "alerts").
   * Can also be passed as the `?token=` query parameter on the WS URL.
   */
  token?: string;
  /** Optional channel-specific filter params (reserved for future use). */
  params?: {
    symbols?: string[];
    assetCode?: string;
  };
}

export interface ClientUnsubscribeMessage {
  type: "unsubscribe";
  channel: ChannelName;
}

export interface ClientPingMessage {
  type: "ping";
}

export type InboundMessage =
  | ClientSubscribeMessage
  | ClientUnsubscribeMessage
  | ClientPingMessage;

// ─── Outbound messages (Server → Client) ──────────────────────────────────────

/** Sent immediately after a connection is established. */
export interface WelcomeMessage {
  type: "welcome";
  clientId: string;
  /** All channel names the server exposes. */
  channels: ChannelName[];
  timestamp: string;
}

export interface SubscribedAck {
  type: "subscribed";
  channel: ChannelName;
  timestamp: string;
}

export interface UnsubscribedAck {
  type: "unsubscribed";
  channel: ChannelName;
  timestamp: string;
}

export interface PongMessage {
  type: "pong";
  timestamp: string;
}

/** Numeric codes embedded in {@link WsErrorMessage}. */
export const WsErrorCode = {
  /** Payload was not valid JSON. */
  INVALID_JSON: 4000,
  /** Message structure did not match any known inbound message type. */
  INVALID_MESSAGE: 4001,
  /** Missing or invalid auth token for a private channel. */
  UNAUTHORIZED: 4003,
  /** Requested channel does not exist. */
  UNKNOWN_CHANNEL: 4004,
  /** Client has exceeded the per-window message rate limit. */
  RATE_LIMITED: 4029,
} as const;

export type WsErrorCodeValue = (typeof WsErrorCode)[keyof typeof WsErrorCode];

export interface WsErrorMessage {
  type: "error";
  message: string;
  code: WsErrorCodeValue;
  timestamp: string;
}

// ─── Data payload types ───────────────────────────────────────────────────────

export interface PriceSource {
  source: string;
  price: number;
  timestamp: string;
}

export interface PriceData {
  symbol: string;
  /** Best available single price (same as vwap when only one source). */
  price: number;
  /** Volume-weighted average price across all active sources. */
  vwap: number;
  /** Relative deviation between sources (0 = perfectly aligned). */
  deviation: number;
  sources: PriceSource[];
  timestamp: string;
}

export interface PriceUpdateMessage {
  type: "price_update";
  channel: "prices";
  data: PriceData[];
  timestamp: string;
}

export interface HealthFactors {
  liquidityDepth: number;
  priceStability: number;
  bridgeUptime: number;
  reserveBacking: number;
  volumeTrend: number;
}

export interface HealthData {
  symbol: string;
  /** Composite score 0–100. */
  overallScore: number;
  factors: HealthFactors;
  trend: "improving" | "stable" | "deteriorating";
  timestamp: string;
}

export interface HealthUpdateMessage {
  type: "health_update";
  channel: "health";
  data: HealthData[];
  timestamp: string;
}

export interface AlertData {
  ruleId: string;
  assetCode: string;
  alertType: string;
  priority: "critical" | "high" | "medium" | "low";
  triggeredValue: number;
  threshold: number;
  metric: string;
  timestamp: string;
}

export interface AlertTriggeredMessage {
  type: "alert_triggered";
  channel: "alerts";
  data: AlertData;
  timestamp: string;
}

export interface BridgeData {
  name: string;
  status: "healthy" | "degraded" | "down";
  totalValueLocked: number;
  supplyOnStellar: number;
  supplyOnSource: number;
  mismatchPercentage: number;
  lastChecked: string;
}

export interface BridgeUpdateMessage {
  type: "bridge_update";
  channel: "bridges";
  data: BridgeData[];
  timestamp: string;
}

export type OutboundDataMessage =
  | PriceUpdateMessage
  | HealthUpdateMessage
  | AlertTriggeredMessage
  | BridgeUpdateMessage;

export type OutboundMessage =
  | WelcomeMessage
  | SubscribedAck
  | UnsubscribedAck
  | PongMessage
  | WsErrorMessage
  | OutboundDataMessage;

// ─── Client state ─────────────────────────────────────────────────────────────

/** Runtime state maintained for each connected WebSocket client. */
export interface ClientState {
  /** Unique UUID assigned at connection time. */
  id: string;
  socket: WsSocket;
  /** Channels this client is actively subscribed to. */
  subscriptions: Set<ChannelName>;
  /**
   * True when the client provided a valid token (either in the WS URL
   * query-string or in a subscribe message for a private channel).
   */
  isAuthenticated: boolean;
  connectedAt: Date;
  /** Updated on every inbound message and on pong frames (heartbeat). */
  lastSeen: Date;
  /** Inbound message counter within the current rate-limit window. */
  messageCount: number;
  /** Epoch-ms start of the current rate-limit window. */
  windowStart: number;
  /** Remote IP address of the client. */
  ip: string;
}

// ─── Metrics ──────────────────────────────────────────────────────────────────

export interface ConnectionMetrics {
  /** Cumulative connections since server start. */
  totalConnections: number;
  /** Currently open connections. */
  activeConnections: number;
  totalMessagesReceived: number;
  totalMessagesSent: number;
  /** Number of clients subscribed to each channel. */
  subscriptionCounts: Record<ChannelName, number>;
  /** Server uptime in milliseconds. */
  uptime: number;
}

// ─── Redis pub/sub channel keys ───────────────────────────────────────────────

/**
 * Redis pub/sub channel names used for cross-instance broadcasting.
 * Each WS channel name maps to a Redis key used to synchronise all running
 * server instances.
 */
export const REDIS_WS_CHANNELS = {
  prices: "ws:channel:prices",
  health: "ws:channel:health",
  alerts: "ws:channel:alerts",
  bridges: "ws:channel:bridges",
} as const satisfies Record<ChannelName, string>;
