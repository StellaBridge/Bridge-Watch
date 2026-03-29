import { create } from "zustand";
import { devtools } from "zustand/middleware";

export type WebSocketStatus = "connecting" | "connected" | "disconnected" | "reconnecting" | "error";

export interface WebSocketMessage {
  id: string;
  channel: string;
  data: unknown;
  timestamp: number;
}

export interface WebSocketError {
  code: number;
  message: string;
  timestamp: number;
}

export interface WebSocketState {
  // Connection state
  status: WebSocketStatus;
  url: string | null;
  lastConnectedAt: number | null;
  lastDisconnectedAt: number | null;
  reconnectAttempts: number;
  maxReconnectAttempts: number;

  // Subscriptions
  activeChannels: Set<string>;
  pendingSubscriptions: Set<string>;

  // Messages
  messageHistory: WebSocketMessage[];
  lastMessage: WebSocketMessage | null;
  messageCount: number;

  // Errors
  errors: WebSocketError[];
  lastError: WebSocketError | null;
}

export interface WebSocketActions {
  // Connection actions
  setStatus: (status: WebSocketStatus) => void;
  setUrl: (url: string) => void;
  markConnected: () => void;
  markDisconnected: () => void;
  incrementReconnectAttempts: () => void;
  resetReconnectAttempts: () => void;
  setMaxReconnectAttempts: (max: number) => void;

  // Subscription actions
  subscribe: (channel: string) => void;
  unsubscribe: (channel: string) => void;
  confirmSubscription: (channel: string) => void;
  clearPendingSubscriptions: () => void;
  isSubscribed: (channel: string) => boolean;

  // Message actions
  addMessage: (channel: string, data: unknown) => void;
  clearMessageHistory: () => void;
  setLastMessage: (message: WebSocketMessage | null) => void;

  // Error actions
  addError: (code: number, message: string) => void;
  clearErrors: () => void;

  // Reset
  reset: () => void;
}

const MAX_MESSAGE_HISTORY = 100;
const MAX_ERROR_HISTORY = 50;
const MAX_RECONNECT_ATTEMPTS_DEFAULT = 5;

const createMessageId = (): string =>
  `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

const initialWebSocketState: WebSocketState = {
  status: "disconnected",
  url: null,
  lastConnectedAt: null,
  lastDisconnectedAt: null,
  reconnectAttempts: 0,
  maxReconnectAttempts: MAX_RECONNECT_ATTEMPTS_DEFAULT,
  activeChannels: new Set(),
  pendingSubscriptions: new Set(),
  messageHistory: [],
  lastMessage: null,
  messageCount: 0,
  errors: [],
  lastError: null,
};

export const useWebSocketStore = create<WebSocketState & WebSocketActions>()(
  devtools(
    (set, get) => ({
      ...initialWebSocketState,

      setStatus: (status) => {
        set({ status }, false, `setStatus/${status}`);
      },

      setUrl: (url) => {
        set({ url }, false, "setUrl");
      },

      markConnected: () => {
        set(
          {
            status: "connected",
            lastConnectedAt: Date.now(),
            reconnectAttempts: 0,
          },
          false,
          "markConnected"
        );
      },

      markDisconnected: () => {
        set(
          {
            status: "disconnected",
            lastDisconnectedAt: Date.now(),
          },
          false,
          "markDisconnected"
        );
      },

      incrementReconnectAttempts: () => {
        set(
          { reconnectAttempts: get().reconnectAttempts + 1 },
          false,
          "incrementReconnectAttempts"
        );
      },

      resetReconnectAttempts: () => {
        set({ reconnectAttempts: 0 }, false, "resetReconnectAttempts");
      },

      setMaxReconnectAttempts: (max) => {
        set({ maxReconnectAttempts: max }, false, "setMaxReconnectAttempts");
      },

      subscribe: (channel) => {
        const { activeChannels, pendingSubscriptions } = get();
        if (!activeChannels.has(channel)) {
          set(
            {
              pendingSubscriptions: new Set(pendingSubscriptions).add(channel),
            },
            false,
            `subscribe/${channel}`
          );
        }
      },

      unsubscribe: (channel) => {
        const { activeChannels, pendingSubscriptions } = get();
        const newActive = new Set(activeChannels);
        const newPending = new Set(pendingSubscriptions);
        newActive.delete(channel);
        newPending.delete(channel);
        set(
          {
            activeChannels: newActive,
            pendingSubscriptions: newPending,
          },
          false,
          `unsubscribe/${channel}`
        );
      },

      confirmSubscription: (channel) => {
        const { activeChannels, pendingSubscriptions } = get();
        const newPending = new Set(pendingSubscriptions);
        newPending.delete(channel);
        set(
          {
            activeChannels: new Set(activeChannels).add(channel),
            pendingSubscriptions: newPending,
          },
          false,
          `confirmSubscription/${channel}`
        );
      },

      clearPendingSubscriptions: () => {
        set({ pendingSubscriptions: new Set() }, false, "clearPendingSubscriptions");
      },

      isSubscribed: (channel) => {
        return get().activeChannels.has(channel);
      },

      addMessage: (channel, data) => {
        const message: WebSocketMessage = {
          id: createMessageId(),
          channel,
          data,
          timestamp: Date.now(),
        };

        set((state) => ({
          lastMessage: message,
          messageCount: state.messageCount + 1,
          messageHistory: [message, ...state.messageHistory].slice(
            0,
            MAX_MESSAGE_HISTORY
          ),
        }), false, "addMessage");
      },

      clearMessageHistory: () => {
        set({ messageHistory: [], messageCount: 0 }, false, "clearMessageHistory");
      },

      setLastMessage: (message) => {
        set({ lastMessage: message }, false, "setLastMessage");
      },

      addError: (code, message) => {
        const error: WebSocketError = {
          code,
          message,
          timestamp: Date.now(),
        };

        set((state) => ({
          lastError: error,
          errors: [error, ...state.errors].slice(0, MAX_ERROR_HISTORY),
        }), false, "addError");
      },

      clearErrors: () => {
        set({ errors: [], lastError: null }, false, "clearErrors");
      },

      reset: () => {
        set(initialWebSocketState, false, "reset");
      },
    }),
    { name: "WebSocketStore" }
  )
);

// Selectors for optimized re-renders
export const selectWebSocketStatus = (state: WebSocketState & WebSocketActions) =>
  state.status;

export const selectIsConnected = (state: WebSocketState & WebSocketActions) =>
  state.status === "connected";

export const selectActiveChannels = (state: WebSocketState & WebSocketActions) =>
  Array.from(state.activeChannels);

export const selectLastMessage = (state: WebSocketState & WebSocketActions) =>
  state.lastMessage;

export const selectMessagesByChannel = (
  state: WebSocketState & WebSocketActions,
  channel: string
) => state.messageHistory.filter((m) => m.channel === channel);

export const selectConnectionStats = (state: WebSocketState & WebSocketActions) => ({
  status: state.status,
  reconnectAttempts: state.reconnectAttempts,
  maxReconnectAttempts: state.maxReconnectAttempts,
  activeChannelsCount: state.activeChannels.size,
  messageCount: state.messageCount,
  lastError: state.lastError,
});
