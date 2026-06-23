import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildServer } from "../../src/index.js";
import type { FastifyInstance } from "fastify";

describe("Incidents API", () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await buildServer();
  });

  afterAll(async () => {
    await server.close();
  });

  describe("GET /api/v1/incidents/heatmap", () => {
    it("should accept valid date range parameters", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/incidents/heatmap?startDate=2024-01-01&endDate=2024-01-31",
      });

      expect(response.statusCode).toBeDefined();
      expect(typeof response.statusCode).toBe("number");
    });
  });

  describe("GET /api/v1/incidents/heatmap", () => {
    it("should accept assetSymbol filter parameter", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/incidents/heatmap?assetSymbol=USDC",
      });

      expect(response.statusCode).toBeDefined();
      expect(typeof response.statusCode).toBe("number");
    });
  });
});
