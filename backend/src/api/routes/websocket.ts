import type { FastifyInstance } from "fastify";
import { WebsocketService } from "../../services/websocket.js";

const websocketService = WebsocketService.getInstance();

// WS /api/v1/ws - WebSocket for real-time updates
// Protocol:
// - Client sends: { type: "subscribe", topic: "prices", filter?: { symbols: ["USDC"] } }
// - Client sends: { type: "unsubscribe", topic: "health:USDC" }
// - Client sends: { type: "resume", clientId: "..." }
// - Client sends: { type: "ack", messageId: "..." }
// - Server sends: { type: "system", message: "connected", clientId: "..." }
// - Server sends: { type: "batch", messages: [...] }
// - Server sends: { type: "replay", messages: [...] }

export async function websocketRoutes(server: FastifyInstance) {
  server.get("/", { websocket: true }, (socket, _request) => {
    server.log.info("WebSocket client connected");

    let clientId: string | undefined;

    const sendError = (message: string) => {
      try {
        socket.send(JSON.stringify({ type: "error", message }));
      } catch {
        // ignore
      }
    };

    const bindClient = (resumeId?: string) => {
      clientId = websocketService.addClient(socket, resumeId);
    };

    bindClient();

    socket.on("message", (message: Buffer) => {
      const data = message.toString();
      server.log.debug(`WebSocket message received: ${data}`);

      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(data);
      } catch {
        sendError("Invalid JSON");
        return;
      }

      if (parsed.type === "subscribe" && typeof parsed.topic === "string") {
        websocketService.subscribe(clientId!, parsed.topic, (parsed.filter as Record<string, unknown>) ?? {});
        return;
      }

      if (parsed.type === "unsubscribe" && typeof parsed.topic === "string") {
        websocketService.unsubscribe(clientId!, parsed.topic);
        return;
      }

      if (parsed.type === "resume" && typeof parsed.clientId === "string") {
        bindClient(parsed.clientId);
        return;
      }

      if (parsed.type === "ack" && typeof parsed.messageId === "string") {
        websocketService.receiveAck(clientId!, parsed.messageId);
        return;
      }

      sendError("Unsupported message type or missing fields");
    });

    socket.on("close", () => {
      if (clientId) {
        websocketService.removeClient(clientId);
      }
      server.log.info("WebSocket client disconnected");
    });
  });
}
