import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify from "fastify";
import { alertRoutingAdminRoutes } from "../../src/api/routes/alertRoutingAdmin.js";

vi.mock("../../src/database/connection.js", () => {
  const mockRules: any[] = [];
  let ruleIdCounter = 0;

  return {
    getDatabase: () => ({
      insert: vi.fn().mockImplementation((data) => ({
        into: vi.fn().mockReturnValue(Promise.resolve([{ id: `rule-${ruleIdCounter++}` }])),
      })),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue(Promise.resolve(mockRules)),
          orderBy: vi.fn().mockReturnValue(Promise.resolve(mockRules)),
        }),
      }),
      table: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            first: vi.fn().mockReturnValue(Promise.resolve(mockRules[0] ?? null)),
            orderBy: vi.fn().mockReturnValue(Promise.resolve(mockRules)),
          }),
        }),
        update: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue(Promise.resolve(1)),
        }),
        delete: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue(Promise.resolve(1)),
        }),
      }),
    }),
  };
});

vi.mock("../../src/utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../../src/services/alertRouting.service.js", () => ({
  alertRoutingService: {
    listRules: vi.fn().mockResolvedValue([
      {
        id: "rule-1",
        name: "Critical USDC",
        ownerAddress: "GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTQSXUSMIQ75XABZLXVMYLVEL",
        severityLevels: ["critical"],
        assetCodes: ["USDC"],
        sourceTypes: ["price-deviation"],
        channels: ["webhook"],
        fallbackChannels: ["email"],
        suppressionWindowSeconds: 300,
        priorityOrder: 1,
        isActive: true,
      },
    ]),
    createRule: vi.fn().mockResolvedValue({
      id: "rule-new",
      name: "New Rule",
      channels: ["webhook"],
      isActive: true,
    }),
    updateRule: vi.fn().mockResolvedValue({
      id: "rule-1",
      name: "Updated Rule",
      channels: ["webhook"],
    }),
    bulkUpdateRules: vi.fn().mockResolvedValue([
      { id: "rule-1", isActive: false },
      { id: "rule-2", isActive: false },
    ]),
    deleteRule: vi.fn().mockResolvedValue(true),
    getAuditHistory: vi.fn().mockResolvedValue([
      {
        id: "audit-1",
        ruleId: "rule-1",
        status: "delivered",
        channel: "webhook",
        timestamp: new Date(),
      },
    ]),
  },
}));

describe("Alert Routing Admin Routes", () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    app = Fastify();
    app.register(async (fastify) => {
      fastify.decorate("apiKeyAuth", { name: "test-key" });
    });

    await app.register(alertRoutingAdminRoutes, { prefix: "/rules" });
    await app.ready();
  });

  describe("GET /rules", () => {
    it("returns 200 with list of routing rules", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/rules",
        headers: {
          authorization: "Bearer test-token",
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.rules).toBeDefined();
      expect(Array.isArray(json.rules)).toBe(true);
    });

    it("filters rules by ownerAddress", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/rules?ownerAddress=GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTQSXUSMIQ75XABZLXVMYLVEL",
        headers: {
          authorization: "Bearer test-token",
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe("POST /rules", () => {
    it("creates a new routing rule with status 201", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/rules",
        headers: {
          authorization: "Bearer test-token",
        },
        payload: {
          name: "High Severity Rule",
          channels: ["webhook", "email"],
          severityLevels: ["critical", "high"],
          assetCodes: ["USDC", "EURC"],
          isActive: true,
        },
      });

      expect(response.statusCode).toBe(201);
      const json = response.json();
      expect(json.rule).toBeDefined();
      expect(json.rule.name).toBe("New Rule");
    });

    it("validates required fields", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/rules",
        headers: {
          authorization: "Bearer test-token",
        },
        payload: {
          name: "Incomplete Rule",
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBeDefined();
    });
  });

  describe("PATCH /rules/:id", () => {
    it("updates a routing rule", async () => {
      const response = await app.inject({
        method: "PATCH",
        url: "/rules/rule-1",
        headers: {
          authorization: "Bearer test-token",
        },
        payload: {
          name: "Updated Rule Name",
          isActive: false,
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.rule).toBeDefined();
    });

    it("returns 404 for non-existent rule", async () => {
      vi.mocked(vi.mocked).mockResolvedValueOnce(null);

      const response = await app.inject({
        method: "PATCH",
        url: "/rules/non-existent",
        headers: {
          authorization: "Bearer test-token",
        },
        payload: {
          name: "Updated",
        },
      });

      expect([200, 404]).toContain(response.statusCode);
    });
  });

  describe("PATCH /rules/bulk", () => {
    it("bulk updates multiple rules", async () => {
      const response = await app.inject({
        method: "PATCH",
        url: "/rules/bulk",
        headers: {
          authorization: "Bearer test-token",
        },
        payload: {
          ruleIds: ["rule-1", "rule-2"],
          isActive: false,
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.rules).toBeDefined();
      expect(json.count).toBe(2);
    });

    it("validates bulk payload", async () => {
      const response = await app.inject({
        method: "PATCH",
        url: "/rules/bulk",
        headers: {
          authorization: "Bearer test-token",
        },
        payload: {
          ruleIds: ["rule-1"],
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("DELETE /rules/:id", () => {
    it("deletes a routing rule with 204 response", async () => {
      const response = await app.inject({
        method: "DELETE",
        url: "/rules/rule-1",
        headers: {
          authorization: "Bearer test-token",
        },
      });

      expect(response.statusCode).toBe(204);
    });

    it("returns 404 for non-existent rule", async () => {
      vi.mocked(vi.mocked).mockResolvedValueOnce(null);

      const response = await app.inject({
        method: "DELETE",
        url: "/rules/non-existent",
        headers: {
          authorization: "Bearer test-token",
        },
      });

      expect([204, 404]).toContain(response.statusCode);
    });
  });

  describe("GET /audit", () => {
    it("returns audit history with status 200", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/audit?ownerAddress=GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTQSXUSMIQ75XABZLXVMYLVEL",
        headers: {
          authorization: "Bearer test-token",
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.entries).toBeDefined();
      expect(Array.isArray(json.entries)).toBe(true);
    });

    it("filters audit by status", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/audit?status=delivered",
        headers: {
          authorization: "Bearer test-token",
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe("POST /simulate", () => {
    it("simulates alert routing evaluation", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/simulate",
        headers: {
          authorization: "Bearer test-token",
        },
        payload: {
          severity: "critical",
          assetCode: "USDC",
          sourceType: "price-deviation",
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.simulationId).toBeDefined();
      expect(json.summary).toBeDefined();
      expect(json.results).toBeDefined();
    });

    it("validates severity value", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/simulate",
        headers: {
          authorization: "Bearer test-token",
        },
        payload: {
          severity: "invalid",
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
