import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";

describe("API key routes", () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.API_KEY_BOOTSTRAP_TOKEN = "bootstrap-secret";
    const { buildServer } = await import("../../src/index.js");
    server = await buildServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it("creates and lists API keys with the bootstrap token", async () => {
    const createResponse = await server.inject({
      method: "POST",
      url: "/api/v1/admin/api-keys",
      headers: {
        "x-api-key": "bootstrap-secret",
      },
      payload: {
        name: "Ops automation",
        scopes: ["jobs:read", "jobs:trigger"],
        rateLimitPerMinute: 45,
      },
    });

    expect(createResponse.statusCode).toBe(201);
    const created = JSON.parse(createResponse.body);
    expect(created).toHaveProperty("apiKey");
    expect(created.key.name).toBe("Ops automation");

    const listResponse = await server.inject({
      method: "GET",
      url: "/api/v1/admin/api-keys",
      headers: {
        "x-api-key": "bootstrap-secret",
      },
    });

    expect(listResponse.statusCode).toBe(200);
    const listed = JSON.parse(listResponse.body);
    expect(Array.isArray(listed.keys)).toBe(true);
    expect(listed.keys.length).toBeGreaterThan(0);
  });
});
