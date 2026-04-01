import type { ClientState } from "../types.js";
import type { WebSocketServer } from "../websocket.server.js";
import {
  WsErrorCode,
  PRIVATE_CHANNELS,
  ALL_CHANNELS,
  type ClientSubscribeMessage,
} from "../types.js";

/**
 * Handle a `subscribe` message from a client.
 *
 * Validates:
 *  1. The channel name is recognised.
 *  2. Private channels require a valid auth token (either supplied in this
 *     message or already validated at connection time via a URL query param).
 *
 * On success, registers the subscription and replies with a `subscribed` ack.
 */
export function handleSubscribe(
  state: ClientState,
  message: ClientSubscribeMessage,
  server: WebSocketServer
): void {
  const { channel, token } = message;
  const now = new Date().toISOString();

  // ── Validate channel name ─────────────────────────────────────────────────
  if (!(ALL_CHANNELS as string[]).includes(channel)) {
    server.sendToClient(state, {
      type: "error",
      message: `Unknown channel "${channel}". Valid channels: ${ALL_CHANNELS.join(", ")}.`,
      code: WsErrorCode.UNKNOWN_CHANNEL,
      timestamp: now,
    });
    return;
  }

  // ── Auth check for private channels ──────────────────────────────────────
  if (PRIVATE_CHANNELS.has(channel)) {
    // Clients can authenticate at connection time (URL ?token=) or per
    // subscribe message.  Try the message token first, then fall back to
    // the connection-level flag.
    const authenticated =
      state.isAuthenticated ||
      (token !== undefined && server.validateToken(token));

    if (!authenticated) {
      server.sendToClient(state, {
        type: "error",
        message: `Channel "${channel}" requires authentication. Provide a valid token.`,
        code: WsErrorCode.UNAUTHORIZED,
        timestamp: now,
      });
      return;
    }

    // Upgrade the connection-level auth flag so subsequent private-channel
    // subscribes don't need a token again.
    if (token && !state.isAuthenticated) {
      state.isAuthenticated = true;
    }
  }

  // ── Idempotent subscription ───────────────────────────────────────────────
  if (state.subscriptions.has(channel)) {
    // Re-send the ack so the client knows it's already subscribed.
    server.sendToClient(state, {
      type: "subscribed",
      channel,
      timestamp: now,
    });
    return;
  }

  server.addSubscription(state, channel);

  server.sendToClient(state, {
    type: "subscribed",
    channel,
    timestamp: now,
  });
}
