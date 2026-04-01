/**
 * Supply Chain Visualization routes.
 *
 * GET /api/v1/supply-chain        — full graph (nodes + edges)
 * GET /api/v1/supply-chain/nodes  — chain nodes only
 * GET /api/v1/supply-chain/edges  — bridge edges only
 */

import type { FastifyInstance } from "fastify";
import { SupplyChainService } from "../../services/supplyChain.service.js";

export async function supplyChainRoutes(server: FastifyInstance) {
  const svc = new SupplyChainService();

  server.get("/", async (_req, reply) => {
    try {
      const graph = await svc.getGraph();
      return reply.send(graph);
    } catch (err) {
      server.log.error({ err }, "Supply chain graph fetch failed");
      return reply.status(500).send({ error: "Failed to fetch supply chain data" });
    }
  });

  server.get("/nodes", async (_req, reply) => {
    try {
      const graph = await svc.getGraph();
      return reply.send({ nodes: graph.nodes, lastUpdated: graph.lastUpdated });
    } catch (err) {
      server.log.error({ err }, "Supply chain nodes fetch failed");
      return reply.status(500).send({ error: "Failed to fetch chain nodes" });
    }
  });

  server.get("/edges", async (_req, reply) => {
    try {
      const graph = await svc.getGraph();
      return reply.send({ edges: graph.edges, lastUpdated: graph.lastUpdated });
    } catch (err) {
      server.log.error({ err }, "Supply chain edges fetch failed");
      return reply.status(500).send({ error: "Failed to fetch bridge edges" });
    }
  });
}
