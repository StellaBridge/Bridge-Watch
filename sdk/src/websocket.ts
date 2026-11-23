/**
 * Real-time WebSocket client for alert and incident streaming
 */

export interface AlertEvent {
  id: string;
  type: 'alert' | 'incident';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface WebSocketClientOptions {
  url: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export interface WebSocketSubscription {
  unsubscribe: () => void;
}

type EventHandler = (event: AlertEvent) => void;

export class BridgeWatchWebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectInterval: number;
  private maxReconnectAttempts: number;
  private reconnectAttempts = 0;
  private messageHandlers: Set<EventHandler> = new Set();
  private isClosing = false;

  constructor(options: WebSocketClientOptions) {
    this.url = options.url;
    this.reconnectInterval = options.reconnectInterval ?? 3000;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 5;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          this.reconnectAttempts = 0;
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const alertEvent: AlertEvent = JSON.parse(event.data);
            this.messageHandlers.forEach((handler) => handler(alertEvent));
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
          }
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          reject(error);
        };

        this.ws.onclose = () => {
          if (!this.isClosing) {
            this.attemptReconnect();
          }
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    setTimeout(() => {
      this.connect().catch((error) => {
        console.error('Reconnection failed:', error);
      });
    }, this.reconnectInterval * this.reconnectAttempts);
  }

  subscribe(handler: EventHandler): WebSocketSubscription {
    this.messageHandlers.add(handler);

    return {
      unsubscribe: () => {
        this.messageHandlers.delete(handler);
      },
    };
  }

  disconnect(): void {
    this.isClosing = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.messageHandlers.clear();
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
