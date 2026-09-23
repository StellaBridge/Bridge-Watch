import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

vi.hoisted(() => {
  process.env.NODE_ENV = "test";
  process.env.API_KEY_BOOTSTRAP_TOKEN = "bootstrap-secret";
  process.env.REQUIRE_APPROVAL_FOR_ROLLBACK = "false";
});

const mockComparison = {
  configKey: "alert-thresholds",
  fromVersion: 1,
  toVersion: 2,
  diff: [
    {
      field: "priceDeviation",
      currentValue: 0.02,
      targetValue: 0.05,
      changeType: "modified",
    },
  ],
  impactSummary: "Comparing 'alert-thresholds' v1 to v2: 1 field(s) modified.",
};

vi.mock("../../src/services/configVersion.service.js", () => {
  class MockConfigVersionService {
    private static _instance: MockConfigVersionService;
    static getInstance() {
      if (!this._instance) this._instance = new MockConfigVersionService();
      return this._instance;
    }
    getVersionHistory = vi.fn().mockResolvedValue([]);
    getCurrentVersion = vi.fn().mockResolvedValue(null);
    getVersion = vi.fn().mockResolvedValue(null);
    previewRollback = vi.fn().mockRejectedValue(new Error("not used"));
    applyRollback = vi.fn().mockRejectedValue(new Error("not used"));
    createVersion = vi.fn().mockRejectedValue(new Error("not used"));
    computeDiff = vi.fn().mockReturnValue([]);
    compareVersions = vi.fn().mockResolvedValue(mockComparison);
  }
  return { ConfigVersionService: MockConfigVersionService };
});

vi.mock("../../src/services/apiKey.service.js", () => {
  class MockApiKeyService {
    validateKey = vi.fn().mockResolvedValue({
      ok: true,
      result: {
        id: "key-1",
        name: "admin",
        scopes: ["admin:config-versions"],
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

import { configVersionsRoutes } from "../../src/api/routes/configVersions.js";

describe("Config diff routes (#1189)", () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = Fastify();
    await server.register(configVersionsRoutes, {
      prefix: "/api/v1/admin/config-versions",
    });
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  it("GET diff returns comparison for two versions", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/v1/admin/config-versions/alert-thresholds/diff/1/2",
      headers: { "x-api-key": "bootstrap-secret" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty("fromVersion", 1);
    expect(body).toHaveProperty("toVersion", 2);
    expect(Array.isArray(body.diff)).toBe(true);
    expect(body).toHaveProperty("impactSummary");
  });

  it("GET diff returns 400 for identical versions", async () => {
    const { ConfigVersionService } = vi.mocked(
      await import("../../src/services/configVersion.service.js")
    );
    const instance = (ConfigVersionService as unknown as {
      _instance: { compareVersions: ReturnType<typeof vi.fn> };
    })._instance;
    instance.compareVersions.mockRejectedValueOnce(
      new Error("Versions are identical (v1). Select two different versions to compare.")
    );

    const res = await server.inject({
      method: "GET",
      url: "/api/v1/admin/config-versions/alert-thresholds/diff/1/1",
      headers: { "x-api-key": "bootstrap-secret" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("GET diff returns 400 for non-numeric versions", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/v1/admin/config-versions/alert-thresholds/diff/abc/def",
      headers: { "x-api-key": "bootstrap-secret" },
    });
    expect(res.statusCode).toBe(400);
  });
});
