import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildServer } from "../../src/index.js";
import type { FastifyInstance } from "fastify";

describe("Tags API", () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await buildServer();
  });

  afterAll(async () => {
    await server.close();
  });

  describe("POST /api/v1/tags", () => {
    it("should return 400 for missing fields", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/v1/tags",
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("error");
    });
  });

  describe("DELETE /api/v1/tags", () => {
    it("should return 400 for missing fields", async () => {
      const response = await server.inject({
        method: "DELETE",
        url: "/api/v1/tags",
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("error");
    });
  });

  describe("GET /api/v1/tags/find", () => {
    it("should return 400 when tag query is missing", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/tags/find",
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("error");
    });
  });

  describe("PUT /api/v1/tags/sync", () => {
    it("should return 400 for missing fields", async () => {
      const response = await server.inject({
        method: "PUT",
        url: "/api/v1/tags/sync",
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("error");
    });
  });

  describe("POST /api/v1/tags/propagate", () => {
    it("should return 400 for missing fields", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/v1/tags/propagate",
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("error");
    });
  });
});
