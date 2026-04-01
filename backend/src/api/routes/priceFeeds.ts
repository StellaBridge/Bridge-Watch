/**
 * External Price Feed Aggregator routes.
 *
 * GET /api/v1/price-feeds/:symbol          — consensus price for one asset
 * GET /api/v1/price-feeds                  — consensus prices for all defaults
 * GET /api/v1/price-feeds/:symbol/compare  — side-by-side source comparison
 * GET /api/v1/price-feeds/health           — source health status
 */

import type { FastifyInstance } from "fastify";
import { ExternalPriceAggregatorService } from "../../services/externalPriceAggregator.service.js";

const DEFAULT_SYMBOLS = ["USDC", "USDT", "WBTC", "WETH", "ETH", "XLM"];

export async function priceFeedsRoutes(server: FastifyInstance) {
  const aggregator = new ExternalPriceAggregatorService();

  /** GET /price-feeds/health — source health overview */
  server.get("/health", async (_req, reply) => {
    const health = aggregator.getSourceHealth();
    return reply.send({ sources: health });
  });

  /** GET /price-feeds — consensus prices for all default symbols */
  server.get("/", async (_req, reply) => {
    try {
      const results = await aggregator.getConsensusPrices(DEFAULT_SYMBOLS);
      return reply.send({
        prices: results,
        symbols: DEFAULT_SYMBOLS,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      server.log.error({ err }, "Price feeds bulk fetch failed");
      return reply.status(500).send({ error: "Failed to fetch price feeds" });
    }
  });

  /** GET /price-feeds/:symbol — consensus price for a single asset */
  server.get<{ Params: { symbol: string } }>(
    "/:symbol",
    async (req, reply) => {
      const { symbol } = req.params;
      try {
        const result = await aggregator.getConsensusPrice(symbol.toUpperCase());
        if (result.sourcesUsed === 0) {
          return reply
            .status(404)
            .send({ error: `No price data available for ${symbol}` });
        }
        return reply.send(result);
      } catch (err) {
        server.log.error({ err, symbol }, "Price feed fetch failed");
        return reply.status(500).send({ error: "Failed to fetch price feed" });
      }
    }
  );

  /** GET /price-feeds/:symbol/compare — per-source price breakdown */
  server.get<{ Params: { symbol: string } }>(
    "/:symbol/compare",
    async (req, reply) => {
      const { symbol } = req.params;
      try {
        const result = await aggregator.compareSourcePrices(symbol.toUpperCase());
        return reply.send(result);
      } catch (err) {
        server.log.error({ err, symbol }, "Price comparison fetch failed");
        return reply.status(500).send({ error: "Failed to compare price sources" });
      }
    }
  );
}
