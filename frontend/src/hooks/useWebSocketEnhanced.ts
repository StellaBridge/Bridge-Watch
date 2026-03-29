import { useEffect, useRef, useCallback } from "react";
import { wsService } from "../services/websocket";
import {
  useWebSocketStore,
  selectIsConnected,
  selectActiveChannels,
} from "../stores";

const WS_URL = `ws://${window.location.hostname}:3002/api/v1/ws`;

/**
 * Enhanced WebSocket hook that integrates with the Zustand WebSocket store.
 * Provides connection state management, automatic reconnection tracking,
 * and subscription management.
 */
export function useWebSocket(channel: string, onMessage: (data: unknown) => void) {
  const connectedRef = useRef(false);

  // Connect to WebSocket store for state management
  const isConnected = useWebSocketStore(selectIsConnected);
  const activeChannels = useWebSocketStore(selectActiveChannels);
  const {
    setUrl,
    setStatus,
    markConnected,
    markDisconnected,
    incrementReconnectAttempts,
    subscribe,
    confirmSubscription,
    unsubscribe,
    addMessage,
    addError,
  } = useWebSocketStore();

  useEffect(() => {
    // Initialize WebSocket URL in store
    setUrl(WS_URL);

    if (!connectedRef.current) {
      setStatus("connecting");
      wsService.connect(WS_URL);
      connectedRef.current = true;
    }

    // Subscribe to channel through store
    subscribe(channel);

    const handleOpen = () => {
      markConnected();
      confirmSubscription(channel);
    };

    const handleClose = () => {
      markDisconnected();
    };

    const handleError = () => {
      addError(1006, "WebSocket connection error");
      incrementReconnectAttempts();
    };

    // Add event listeners for connection tracking
    wsService.on("open", handleOpen);
    wsService.on("close", handleClose);
    wsService.on("error", handleError);

    const unsubscribeChannel = wsService.subscribe(channel, (data) => {
      addMessage(channel, data);
      onMessage(data);
    });

    return () => {
      unsubscribe(channel);
      unsubscribeChannel();
      wsService.off("open", handleOpen);
      wsService.off("close", handleClose);
      wsService.off("error", handleError);
    };
  }, [channel, onMessage]);

  const send = useCallback(
    (data: unknown) => {
      if (isConnected) {
        wsService.send(data);
      } else {
        console.warn("WebSocket not connected. Message not sent.", data);
      }
    },
    [isConnected]
  );

  const isSubscribed = activeChannels.includes(channel);

  return {
    send,
    isConnected,
    isSubscribed,
  };
}

/**
 * Hook to access WebSocket connection status and statistics
 */
export function useWebSocketStatus() {
  const status = useWebSocketStore((state) => state.status);
  const reconnectAttempts = useWebSocketStore(
    (state) => state.reconnectAttempts
  );
  const maxReconnectAttempts = useWebSocketStore(
    (state) => state.maxReconnectAttempts
  );
  const lastError = useWebSocketStore((state) => state.lastError);
  const messageCount = useWebSocketStore((state) => state.messageCount);

  return {
    status,
    isConnected: status === "connected",
    isConnecting: status === "connecting",
    isReconnecting: status === "reconnecting",
    reconnectAttempts,
    maxReconnectAttempts,
    lastError,
    messageCount,
  };
}
