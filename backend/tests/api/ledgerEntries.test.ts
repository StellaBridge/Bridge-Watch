import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

vi.hoisted(() => {
  process.env.NODE_ENV = "test";
  process.env.API_KEY_BOOTSTRAP_TOKEN = "bootstrap-secret";
});

vi.mock("../../src/services/ledgerEntry.service.js", () => {
  const mockInspectResult = {
    entries: [
      {
        key: "a2V5MQ==",
        entryType: "contractData",
        liveUntilLedgerSeq: 12345,
        lastModifiedLedgerSeq: 12300,
        entryXdrPreview: "eGRyLXByZXZpZXc=",
      },
    ],
    notFoundKeys: [],
  };
  const LedgerEntryValidationError = class extends Error {
    constructor(message: string) {
      super(message);
      this.name = "LedgerEntryValidationError";
    }
  };
  const LedgerEntryUpstreamError = class extends Error {
    constructor(message: string) {
      super(message);
      this.name = "LedgerEntryUpstreamError";
    }
  };
  return {
    LedgerEntryValidationError,
    LedgerEntryUpstreamError,
    ledgerEntryService: {
      inspect: vi.fn().mockResolvedValue(mockInspectResult),
      getLatestLedger: vi.fn().mockResolvedValue({ sequence: 12345 }),
    },
  };
});

vi.mock("../../src/services/apiKey.service.js", () => {
  class MockApiKeyService {
    validateKey = vi.fn().mockResolvedValue({
      ok: true,
      result: {
        id: "key-1",
        name: "tester",
        scopes: [],
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

import { ledgerEntriesRoutes } from "../../src/api/routes/ledgerEntries.routes.js";

describe("Ledger entries routes (#1200)", () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = Fastify();
    await server.register(ledgerEntriesRoutes, { prefix: "/api/v1/ledger-entries" });
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  it("POST /inspect returns entries for valid keys", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/v1/ledger-entries/inspect",
      headers: { "x-api-key": "bootstrap-secret", "content-type": "application/json" },
      payload: JSON.stringify({ keys: ["a2V5MQ=="] }),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.entries)).toBe(true);
    expect(body.entries[0]).toHaveProperty("entryType", "contractData");
  });

  it("POST /inspect returns 400 for empty keys", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/v1/ledger-entries/inspect",
      headers: { "x-api-key": "bootstrap-secret", "content-type": "application/json" },
      payload: JSON.stringify({ keys: [] }),
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /inspect returns 401 without auth", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/v1/ledger-entries/inspect",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ keys: ["a2V5MQ=="] }),
    });
    expect(res.statusCode).toBe(401);
  });

  it("GET /latest returns latest ledger", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/v1/ledger-entries/latest",
      headers: { "x-api-key": "bootstrap-secret" },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toHaveProperty("sequence", 12345);
  });
});
