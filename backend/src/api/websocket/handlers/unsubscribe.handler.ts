import type { ClientState } from "../types.js";
import type { WebSocketServer } from "../websocket.server.js";
import {
  WsErrorCode,
  ALL_CHANNELS,
  type ClientUnsubscribeMessage,
} from "../types.js";

/**
 * Handle an `unsubscribe` message from a client.
 *
 * Removes the subscription and replies with an `unsubscribed` ack.
 * If the client was not subscribed to the channel, the ack is still sent
 * (idempotent behaviour).
 */
export function handleUnsubscribe(
  state: ClientState,
  message: ClientUnsubscribeMessage,
  server: WebSocketServer
): void {
  const { channel } = message;
  const now = new Date().toISOString();

  if (!(ALL_CHANNELS as string[]).includes(channel)) {
    server.sendToClient(state, {
      type: "error",
      message: `Unknown channel "${channel}".`,
      code: WsErrorCode.UNKNOWN_CHANNEL,
      timestamp: now,
    });
    return;
  }

  server.removeSubscription(state, channel);

  server.sendToClient(state, {
    type: "unsubscribed",
    channel,
    timestamp: now,
  });
}
