import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

vi.hoisted(() => {
  process.env.NODE_ENV = "test";
  process.env.API_KEY_BOOTSTRAP_TOKEN = "bootstrap-secret";
});

vi.mock("../../src/services/audit.service.js", () => {
  return {
    auditService: {
      query: vi.fn().mockResolvedValue({ entries: [], total: 0 }),
      getEntry: vi.fn().mockResolvedValue(null),
      verifyChecksum: vi.fn().mockReturnValue(true),
      getStats: vi.fn().mockResolvedValue({ total: 0 }),
      exportCsv: vi.fn().mockResolvedValue("id\n"),
      applyRetentionPolicy: vi.fn().mockResolvedValue(0),
    },
  };
});

vi.mock("../../src/services/auditIntegrity.service.js", () => {
  return {
    auditIntegrityService: {
      verifyChain: vi.fn().mockResolvedValue({
        checked: 2,
        intact: true,
        failures: [],
        firstCheckedAt: new Date(0).toISOString(),
        lastCheckedAt: new Date(0).toISOString(),
      }),
    },
  };
});

vi.mock("../../src/services/apiKey.service.js", () => {
  class MockApiKeyService {
    validateKey = vi.fn().mockResolvedValue({
      ok: true,
      result: {
        id: "key-1",
        name: "admin",
        scopes: ["admin:audit"],
        rateLimitPerMinute: 120,
        source: "api-key",
      },
    });
    listKeys = vi.fn().mockResolvedValue([]);
  }
  return { ApiKeyService: MockApiKeyService };
});

vi.mock("../../src/services/oauth2.service.js", () => {
  class MockOAuth2Service {
    verifyToken = vi.fn().mockReturnValue({ valid: false });
    extractScopesFromToken = vi.fn().mockReturnValue([]);
  }
  return { OAuth2Service: MockOAuth2Service };
});

import { auditRoutes } from "../../src/api/routes/audit.js";

describe("Audit integrity routes (#1181)", () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = Fastify();
    await server.register(auditRoutes, { prefix: "/api/v1/admin/audit" });
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  it("GET /integrity returns chain verification result", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/v1/admin/audit/integrity?limit=10",
      headers: { "x-api-key": "bootstrap-secret" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty("checked", 2);
    expect(body).toHaveProperty("intact", true);
    expect(Array.isArray(body.failures)).toBe(true);
  });

  it("GET /integrity returns 400 for out-of-range limit", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/v1/admin/audit/integrity?limit=99999",
      headers: { "x-api-key": "bootstrap-secret" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("GET /integrity returns 401 without auth", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/v1/admin/audit/integrity",
    });
    expect(res.statusCode).toBe(401);
  });
});
