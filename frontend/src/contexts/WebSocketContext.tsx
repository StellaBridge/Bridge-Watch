import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { wsService } from "../services/websocket";
import type { ConnectionState } from "../types";

const WS_URL = `ws://${window.location.hostname}:3002/api/v1/ws`;

interface WebSocketContextValue {
  /** Current connection state */
  connectionState: ConnectionState;
  /** True when WebSocket is unavailable and callers should poll instead */
  isPollingFallback: boolean;
  /**
   * Send a message. Queued automatically when the connection is not open
   * and flushed once reconnected.
   */
  send: (data: unknown) => void;
  /**
   * Subscribe to a channel. Returns an unsubscribe function.
   * Safe to call before the connection is open — the subscription is
   * replayed to the server on every (re)connect.
   */
  subscribe: (channel: string, handler: (data: unknown) => void) => () => void;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("disconnected");
  const connectedRef = useRef(false);

  useEffect(() => {
    // Initiate a single connection for the whole app lifetime
    if (!connectedRef.current) {
      connectedRef.current = true;
      wsService.connect(WS_URL);
    }

    const unsub = wsService.onStateChange(setConnectionState);
    return unsub;
  }, []);

  const send = useCallback((data: unknown) => {
    wsService.send(data);
  }, []);

  const subscribe = useCallback(
    (channel: string, handler: (data: unknown) => void) =>
      wsService.subscribe(channel, handler),
    []
  );

  return (
    <WebSocketContext.Provider
      value={{
        connectionState,
        isPollingFallback: wsService.isPollingFallback,
        send,
        subscribe,
      }}
    >
      {children}
    </WebSocketContext.Provider>
  );
}

/** Must be used inside <WebSocketProvider>. */
export function useWebSocketContext(): WebSocketContextValue {
  const ctx = useContext(WebSocketContext);
  if (!ctx) {
    throw new Error(
      "useWebSocketContext must be called inside <WebSocketProvider>"
    );
  }
  return ctx;
}
