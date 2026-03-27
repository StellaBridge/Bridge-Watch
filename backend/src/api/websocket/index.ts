/**
 * Public API for the WebSocket module.
 *
 * Import `wsServer` when you need to broadcast events from other parts of the
 * application (e.g. from the alert evaluation worker) or to integrate the
 * server with the Fastify route layer.
 */
export { WebSocketServer } from "./websocket.server.js";
export { wsServer } from "./websocket.server.js";
export type {
  ChannelName,
  ClientState,
  ConnectionMetrics,
  InboundMessage,
  OutboundMessage,
  OutboundDataMessage,
  PriceUpdateMessage,
  HealthUpdateMessage,
  AlertTriggeredMessage,
  BridgeUpdateMessage,
  WelcomeMessage,
  SubscribedAck,
  UnsubscribedAck,
  PongMessage,
  WsErrorMessage,
} from "./types.js";
export { WsErrorCode, ALL_CHANNELS, PRIVATE_CHANNELS } from "./types.js";
