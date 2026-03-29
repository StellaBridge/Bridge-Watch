import type { FastifyInstance } from "fastify";
import { wsServer } from "../websocket/websocket.server.js";

/**
 * WebSocket route: ws[s]://host/api/v1/ws
 *
 * Connection URL parameters
 * ─────────────────────────
 * ?token=<secret>   Optional bearer token.  Required before subscribing to
 *                   private channels (e.g. "alerts").  Can alternatively be
 *                   supplied per-message in the `subscribe` payload.
 *
 * Inbound message format (JSON)
 * ─────────────────────────────
 * { "type": "subscribe",   "channel": "prices" | "health" | "alerts" | "bridges", "token"?: "…" }
 * { "type": "unsubscribe", "channel": "prices" | "health" | "alerts" | "bridges" }
 * { "type": "ping" }
 *
 * Outbound message types (JSON)
 * ─────────────────────────────
 * welcome          – sent once after connect; carries clientId and channel list
 * subscribed       – ack for a successful subscribe
 * unsubscribed     – ack for a successful unsubscribe
 * pong             – response to an application-level ping
 * price_update     – array of aggregated VWAP prices (channel: prices)
 * health_update    – array of asset health scores  (channel: health)
 * bridge_update    – array of bridge statuses      (channel: bridges)
 * alert_triggered  – a single alert event          (channel: alerts, private)
 * error            – describes a protocol or auth error
 */
export async function websocketRoutes(server: FastifyInstance) {
  server.get(
    "/",
    { websocket: true },
    (socket, request) => {
      wsServer.handleConnection(socket as unknown as Parameters<typeof wsServer.handleConnection>[0], request);
    }
  );

  // Expose connection metrics for observability
  server.get("/metrics", async () => wsServer.getMetrics());
}
