import type { FastifyInstance } from "fastify";
import { BridgeService } from "../../services/bridge.service.js";

export async function bridgesRoutes(server: FastifyInstance) {
  const bridgeService = new BridgeService();

  server.get(
    "/",
    {
      schema: {
        tags: ["Bridges"],
        summary: "List all bridge statuses",
        description: "Returns the current status for every monitored Stellar bridge.",
        response: {
          200: { type: "array", items: { type: "object", additionalProperties: true } },
        },
      },
    },
    async (_request, _reply) => {
      const bridges = await bridgeService.getAllBridgeStatuses();
      return bridges;
    },
  );

  server.get<{ Params: { bridge: string } }>(
    "/:bridge/stats",
    {
      schema: {
        tags: ["Bridges"],
        summary: "Get bridge statistics",
        params: {
          type: "object",
          properties: { bridge: { type: "string", description: "Bridge identifier", example: "allbridge" } },
          required: ["bridge"],
        },
        response: {
          200: { type: "object", additionalProperties: true },
          404: { $ref: "Error#" },
        },
      },
    },
    async (request, _reply) => {
      const { bridge } = request.params;
      const stats = await bridgeService.getBridgeStats(bridge);
      return stats;
    },
  );
}
