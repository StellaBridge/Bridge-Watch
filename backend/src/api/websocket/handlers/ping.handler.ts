import type { ClientState } from "../types.js";
import type { WebSocketServer } from "../websocket.server.js";

/**
 * Handle a `ping` message from a client.
 *
 * Replies with a `pong` message containing the current server timestamp.
 * This application-level ping is separate from the WebSocket protocol-level
 * ping/pong that the server uses for heartbeat management.
 */
export function handlePing(
  state: ClientState,
  server: WebSocketServer
): void {
  server.sendToClient(state, {
    type: "pong",
    timestamp: new Date().toISOString(),
  });
}
