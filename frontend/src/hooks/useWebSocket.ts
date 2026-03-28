import { useCallback, useEffect } from "react";
import { useWebSocketContext } from "../contexts/WebSocketContext";
import type { ConnectionState } from "../types";

/**
 * Subscribe to a WebSocket channel and receive typed messages.
 *
 * The hook also returns:
 * - `send`            — send a message (queued when offline)
 * - `connectionState` — current connection state
 *
 * @example
 * const { connectionState } = useWebSocket("health-updates", (data) => {
 *   console.log(data);
 * });
 */
export function useWebSocket(
  channel: string,
  onMessage: (data: unknown) => void
): { send: (data: unknown) => void; connectionState: ConnectionState } {
  const { subscribe, send, connectionState } = useWebSocketContext();

  useEffect(() => {
    const unsubscribe = subscribe(channel, onMessage);
    return unsubscribe;
  }, [channel, onMessage, subscribe]);

  const sendMessage = useCallback(
    (data: unknown) => {
      send(data);
    },
    [send]
  );

  return { send: sendMessage, connectionState };
}

/**
 * Returns the current WebSocket connection state without subscribing to a
 * channel. Useful for status indicators that only need the state.
 */
export function useConnectionState(): ConnectionState {
  const { connectionState } = useWebSocketContext();
  return connectionState;
}
