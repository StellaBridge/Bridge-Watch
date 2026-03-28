import type { ConnectionState } from "../types";

type MessageHandler = (data: unknown) => void;
type ConnectionStateHandler = (state: ConnectionState) => void;

interface WebSocketConfig {
  heartbeatInterval?: number; // ms between pings, default 30000
  heartbeatTimeout?: number; // ms to wait for pong before closing stale conn, default 10000
  maxReconnectAttempts?: number; // default 10
  baseReconnectDelay?: number; // ms, default 1000
  maxReconnectDelay?: number; // ms, default 30000
  maxQueueSize?: number; // max messages to buffer offline, default 100
  debug?: boolean;
}

export class WebSocketService {
  private ws: WebSocket | null = null;
  private url = "";

  // Channel → handlers
  private listeners: Map<string, Set<MessageHandler>> = new Map();
  // Connection state change listeners
  private stateHandlers: Set<ConnectionStateHandler> = new Set();

  private _state: ConnectionState = "disconnected";
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  // Heartbeat
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimeoutTimer: ReturnType<typeof setTimeout> | null = null;

  // Message queue for offline buffering
  private messageQueue: unknown[] = [];

  // Graceful degradation
  private _isPollingFallback = false;

  private readonly cfg: Required<WebSocketConfig>;

  constructor(config: WebSocketConfig = {}) {
    this.cfg = {
      heartbeatInterval: config.heartbeatInterval ?? 30_000,
      heartbeatTimeout: config.heartbeatTimeout ?? 10_000,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 10,
      baseReconnectDelay: config.baseReconnectDelay ?? 1_000,
      maxReconnectDelay: config.maxReconnectDelay ?? 30_000,
      maxQueueSize: config.maxQueueSize ?? 100,
      debug:
        config.debug ??
        (typeof import.meta !== "undefined" &&
          (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true),
    };
  }

  // ---------------------------------------------------------------------------
  // Public accessors
  // ---------------------------------------------------------------------------

  get state(): ConnectionState {
    return this._state;
  }

  get isPollingFallback(): boolean {
    return this._isPollingFallback;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  connect(url: string): void {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.CONNECTING ||
        this.ws.readyState === WebSocket.OPEN)
    ) {
      return;
    }
    this.url = url;
    this._isPollingFallback = false;
    this._doConnect();
  }

  disconnect(): void {
    this._log("Disconnecting");
    this._clearReconnectTimer();
    this._stopHeartbeat();
    if (this.ws) {
      this.ws.close(1000, "Client disconnect");
      this.ws = null;
    }
    this.listeners.clear();
    this.messageQueue = [];
    this.reconnectAttempts = 0;
    this._setState("disconnected");
  }

  // ---------------------------------------------------------------------------
  // Subscription
  // ---------------------------------------------------------------------------

  /**
   * Subscribe to a channel. Returns an unsubscribe function.
   */
  subscribe(channel: string, handler: MessageHandler): () => void {
    if (!this.listeners.has(channel)) {
      this.listeners.set(channel, new Set());
      // Notify server if already connected
      if (this.ws?.readyState === WebSocket.OPEN) {
        this._sendRaw({ type: "subscribe", channel });
      }
    }
    this.listeners.get(channel)!.add(handler);
    this._log("Subscribed:", channel);

    return () => {
      const handlers = this.listeners.get(channel);
      if (!handlers) return;
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.listeners.delete(channel);
        if (this.ws?.readyState === WebSocket.OPEN) {
          this._sendRaw({ type: "unsubscribe", channel });
        }
        this._log("Unsubscribed:", channel);
      }
    };
  }

  /**
   * Listen for connection state changes. The handler is called immediately
   * with the current state, then on every subsequent change.
   * Returns an unsubscribe function.
   */
  onStateChange(handler: ConnectionStateHandler): () => void {
    this.stateHandlers.add(handler);
    handler(this._state);
    return () => {
      this.stateHandlers.delete(handler);
    };
  }

  // ---------------------------------------------------------------------------
  // Sending
  // ---------------------------------------------------------------------------

  /**
   * Send a message. If the connection is not open the message is queued and
   * flushed once the connection is re-established (up to maxQueueSize).
   */
  send(data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this._sendRaw(data);
    } else {
      if (this.messageQueue.length < this.cfg.maxQueueSize) {
        this.messageQueue.push(data);
        this._log(
          `Queued message (${this.messageQueue.length}/${this.cfg.maxQueueSize})`
        );
      } else {
        this._log("Queue full — dropping message");
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private _doConnect(): void {
    if (!this.url) return;
    this._setState("connecting");
    this._log("Connecting to", this.url);

    try {
      this.ws = new WebSocket(this.url);
    } catch (err) {
      this._log("Failed to create WebSocket:", err);
      this._handleUnavailable();
      return;
    }

    this.ws.onopen = () => {
      this._log("Connected");
      this.reconnectAttempts = 0;
      this._setState("connected");
      this._startHeartbeat();
      this._flushQueue();
      // Re-subscribe to all active channels
      this.listeners.forEach((_, channel) => {
        this._sendRaw({ type: "subscribe", channel });
      });
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as Record<
          string,
          unknown
        >;

        // Pong resets the heartbeat timeout
        if (data.type === "pong" || data.type === "ping") {
          this._log("Heartbeat pong");
          this._clearHeartbeatTimeout();
          return;
        }

        const channel = (data.channel ?? data.type) as string | undefined;
        if (channel) {
          this.listeners.get(channel)?.forEach((h) => h(data));
        }
        // Wildcard listeners receive every message
        this.listeners.get("*")?.forEach((h) => h(data));
      } catch {
        this._log("Failed to parse message:", event.data);
      }
    };

    this.ws.onclose = (event) => {
      this._log("Closed:", event.code, event.reason);
      this._stopHeartbeat();

      if (event.code === 1000) {
        // Intentional close — do not reconnect
        this._setState("disconnected");
        return;
      }

      this._setState("disconnected");
      this._scheduleReconnect();
    };

    this.ws.onerror = () => {
      this._log("Socket error");
      this._setState("error");
    };
  }

  private _scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.cfg.maxReconnectAttempts) {
      this._log("Max reconnect attempts reached — switching to polling fallback");
      this._handleUnavailable();
      return;
    }

    const attempt = this.reconnectAttempts++;
    // Exponential backoff with ±500 ms jitter
    const delay = Math.min(
      this.cfg.baseReconnectDelay * 2 ** attempt + Math.random() * 500,
      this.cfg.maxReconnectDelay
    );

    this._log(
      `Reconnecting in ${Math.round(delay)} ms`,
      `(attempt ${attempt + 1}/${this.cfg.maxReconnectAttempts})`
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this._doConnect();
    }, delay);
  }

  private _handleUnavailable(): void {
    this._isPollingFallback = true;
    this._setState("error");
    this._log("WebSocket unavailable — callers should fall back to polling");
  }

  private _startHeartbeat(): void {
    this._stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this._log("Sending ping");
        this._sendRaw({ type: "ping", timestamp: Date.now() });
        // If no pong arrives within the timeout, close the stale connection
        this.heartbeatTimeoutTimer = setTimeout(() => {
          this._log("Heartbeat timeout — closing stale connection");
          this.ws?.close(4000, "Heartbeat timeout");
        }, this.cfg.heartbeatTimeout);
      }
    }, this.cfg.heartbeatInterval);
  }

  private _stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this._clearHeartbeatTimeout();
  }

  private _clearHeartbeatTimeout(): void {
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
  }

  private _clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private _sendRaw(data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private _flushQueue(): void {
    if (this.messageQueue.length === 0) return;
    this._log(`Flushing ${this.messageQueue.length} queued messages`);
    const queue = this.messageQueue.splice(0);
    queue.forEach((msg) => this._sendRaw(msg));
  }

  private _setState(next: ConnectionState): void {
    if (this._state === next) return;
    this._state = next;
    this._log("State →", next);
    this.stateHandlers.forEach((h) => h(next));
  }

  private _log(...args: unknown[]): void {
    if (this.cfg.debug) {
      console.log("[WebSocket]", ...args);
    }
  }
}

export const wsService = new WebSocketService();
