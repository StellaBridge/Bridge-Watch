import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildServer } from "../../src/index.js";
import type { FastifyInstance } from "fastify";

describe("Operator Notes API", () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await buildServer();
  });

  afterAll(async () => {
    await server.close();
  });

  describe("POST /api/v1/notes", () => {
    it("should return 400 for missing fields", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/v1/notes",
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("error");
    });
  });

  describe("GET /api/v1/notes/search", () => {
    it("should return 400 when query is missing", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/notes/search",
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("error");
    });
  });
});
