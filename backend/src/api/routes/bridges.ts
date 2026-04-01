import type { FastifyInstance } from "fastify";
import { BridgeService } from "../../services/bridge.service.js";
import { BridgeTransactionService } from "../../services/bridgeTransaction.service.js";

export async function bridgesRoutes(server: FastifyInstance) {
  const bridgeService = new BridgeService();
  const bridgeTransactionService = new BridgeTransactionService();

  server.get(
    "/",
    {
      schema: {
        tags: ["Bridges"],
        summary: "List all bridge statuses",
        description: "Returns the current status for every monitored Stellar bridge.",
        response: {
          200: { type: "object", additionalProperties: true },
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

  server.get<{ Params: { bridge: string }; Querystring: { status?: string } }>(
    "/:bridge/transactions",
    {
      schema: {
        tags: ["Bridges"],
        summary: "List bridge transactions",
        params: {
          type: "object",
          properties: { bridge: { type: "string", example: "circle" } },
          required: ["bridge"],
        },
        querystring: {
          type: "object",
          properties: { status: { type: "string", example: "pending" } },
        },
        response: {
          200: { type: "object", properties: { transactions: { type: "array", items: { type: "object", additionalProperties: true } } } },
        },
      },
    },
    async (request, _reply) => {
      const { bridge } = request.params;
      const { status } = request.query;
      const transactions = await bridgeTransactionService.getTransactionsForBridge(bridge, status as any);
      return { transactions };
    },
  );

  server.get<{ Params: { bridge: string; txHash: string } }>(
    "/:bridge/transactions/:txHash",
    {
      schema: {
        tags: ["Bridges"],
        summary: "Get a bridge transaction by hash",
        params: {
          type: "object",
          properties: {
            bridge: { type: "string", example: "circle" },
            txHash: { type: "string", example: "0xabc123" },
          },
          required: ["bridge", "txHash"],
        },
        response: {
          200: { type: "object", additionalProperties: true },
          404: { $ref: "Error#" },
        },
      },
    },
    async (request, reply) => {
      const { bridge, txHash } = request.params;
      const transaction = await bridgeTransactionService.getTransactionByHash(bridge, txHash);
      if (!transaction) {
        return reply.status(404).send({ success: false, error: "Transaction not found" });
      }
      return transaction;
    },
  );

  server.post<{ Params: { bridge: string }; Body: Record<string, unknown> }>(
    "/:bridge/transactions",
    {
      schema: {
        tags: ["Bridges"],
        summary: "Create a bridge transaction record",
        params: {
          type: "object",
          properties: { bridge: { type: "string", example: "circle" } },
          required: ["bridge"],
        },
        body: {
          type: "object",
          properties: {
            symbol: { type: "string" },
            transactionType: { type: "string", enum: ["mint", "burn", "transfer"] },
            txHash: { type: "string" },
            sourceChain: { type: "string" },
            sourceAddress: { type: "string" },
            destinationAddress: { type: "string" },
            amount: { type: "string" },
            fee: { type: "string" },
            status: { type: "string", enum: ["pending", "confirmed", "failed", "cancelled", "processing"] },
            correlationId: { type: "string" },
            submittedAt: { type: "string", format: "date-time" },
          },
          required: ["symbol", "transactionType", "txHash", "amount"],
        },
        response: {
          201: { type: "object", additionalProperties: true },
        },
      },
    },
    async (request, reply) => {
      const { bridge } = request.params;
      const {
        symbol,
        transactionType,
        txHash,
        sourceChain,
        sourceAddress,
        destinationAddress,
        amount,
        fee,
        status,
        correlationId,
        submittedAt,
      } = request.body as any;

      const transaction = await bridgeTransactionService.createTransaction({
        bridge_name: bridge,
        symbol,
        transaction_type: transactionType,
        status: status || "pending",
        tx_hash: txHash,
        source_chain: sourceChain,
        source_address: sourceAddress,
        destination_address: destinationAddress,
        amount,
        fee: fee || "0",
        correlation_id: correlationId || null,
        submitted_at: submittedAt ? new Date(submittedAt) : new Date(),
      });

      return reply.status(201).send(transaction);
    },
  );

  server.patch<{ Params: { bridge: string; txHash: string }; Body: { status: string; errorMessage?: string } }>(
    "/:bridge/transactions/:txHash/status",
    {
      schema: {
        tags: ["Bridges"],
        summary: "Update a bridge transaction status",
        params: {
          type: "object",
          properties: {
            bridge: { type: "string", example: "circle" },
            txHash: { type: "string", example: "0xabc123" },
          },
          required: ["bridge", "txHash"],
        },
        body: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["pending", "confirmed", "failed", "cancelled", "processing"] },
            errorMessage: { type: "string" },
          },
          required: ["status"],
        },
        response: {
          200: { type: "object", additionalProperties: true },
          404: { $ref: "Error#" },
        },
      },
    },
    async (request, reply) => {
      const { bridge, txHash } = request.params;
      const { status, errorMessage } = request.body;
      const transaction = await bridgeTransactionService.updateTransactionStatus(bridge, txHash, status as any, errorMessage);
      if (!transaction) {
        return reply.status(404).send({ success: false, error: "Transaction not found" });
      }
      return transaction;
    },
  );

  server.get<{ Params: { bridge: string } }>(
    "/:bridge/transactions/metrics",
    {
      schema: {
        tags: ["Bridges"],
        summary: "Get bridge transaction metrics",
        params: {
          type: "object",
          properties: { bridge: { type: "string", example: "circle" } },
          required: ["bridge"],
        },
        response: {
          200: { type: "object", additionalProperties: true },
        },
      },
    },
    async (request, _reply) => {
      const { bridge } = request.params;
      const summary = await bridgeTransactionService.getBridgeTransactionSummary(bridge);
      return summary;
    },
  );
}
