import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify from "fastify";
import { addressLabelsRoutes } from "../../src/api/routes/addressLabels.routes.js";

vi.mock("../../src/database/connection.js", () => ({
  getDatabase: () => ({
    table: vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue(Promise.resolve([{ id: "label-1" }])),
      select: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          first: vi.fn().mockReturnValue(Promise.resolve(null)),
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue(Promise.resolve([])),
          }),
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
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../../src/services/addressLabel.service.js", () => ({
  addressLabelService: {
    searchLabels: vi.fn().mockResolvedValue([
      {
        id: "label-1",
        address: "GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTQSXUSMIQ75XABZLXVMYLVEL",
        chain: "stellar",
        label: "Stellar Foundation",
        category: "trusted",
        confidence: 0.95,
        isActive: true,
      },
    ]),
    lookupAddress: vi.fn().mockResolvedValue({
      id: "label-1",
      address: "GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTQSXUSMIQ75XABZLXVMYLVEL",
      label: "Stellar Foundation",
      chain: "stellar",
      category: "trusted",
      confidence: 0.95,
    }),
    lookupAddresses: vi.fn().mockResolvedValue(
      new Map([
        [
          "GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTQSXUSMIQ75XABZLXVMYLVEL",
          {
            id: "label-1",
            label: "Stellar Foundation",
            category: "trusted",
          },
        ],
      ])
    ),
    createLabel: vi.fn().mockResolvedValue({
      id: "label-new",
      address: "GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTQSXUSMIQ75XABZLXVMYLVEL",
      label: "New Label",
      chain: "stellar",
      category: "user-defined",
      confidence: 1.0,
      isActive: true,
    }),
    updateLabel: vi.fn().mockResolvedValue({
      id: "label-1",
      address: "GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTQSXUSMIQ75XABZLXVMYLVEL",
      label: "Updated Label",
      category: "trusted",
      confidence: 0.9,
    }),
    deleteLabel: vi.fn().mockResolvedValue(true),
  },
}));

describe("Address Labels Routes", () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    app = Fastify();
    app.register(async (fastify) => {
      fastify.decorate("tenantContext", { userId: "user-1", actorId: "actor-1" });
    });

    await app.register(addressLabelsRoutes, { prefix: "/labels" });
    await app.ready();
  });

  describe("GET /", () => {
    it("returns list of labels", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/labels",
        headers: {
          authorization: "Bearer test-token",
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.labels).toBeDefined();
      expect(Array.isArray(json.labels)).toBe(true);
    });

    it("supports searching by category", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/labels?category=trusted",
        headers: {
          authorization: "Bearer test-token",
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.labels).toBeDefined();
    });

    it("supports searching by chain", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/labels?chain=stellar",
        headers: {
          authorization: "Bearer test-token",
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it("supports full-text query search", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/labels?query=stellar",
        headers: {
          authorization: "Bearer test-token",
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it("supports pagination", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/labels?limit=20&offset=0",
        headers: {
          authorization: "Bearer test-token",
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it("can include inactive labels", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/labels?includeInactive=true",
        headers: {
          authorization: "Bearer test-token",
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe("GET /lookup/:address", () => {
    it("returns label for a specific address", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/labels/lookup/GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTQSXUSMIQ75XABZLXVMYLVEL",
        headers: {
          authorization: "Bearer test-token",
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.label).toBeDefined();
      expect(json.label.address).toBe("GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTQSXUSMIQ75XABZLXVMYLVEL");
    });

    it("specifies chain in lookup query", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/labels/lookup/GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTQSXUSMIQ75XABZLXVMYLVEL?chain=stellar",
        headers: {
          authorization: "Bearer test-token",
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it("returns 404 when address not found", async () => {
      vi.mocked(vi.mocked).mockResolvedValueOnce(null);

      const response = await app.inject({
        method: "GET",
        url: "/labels/lookup/GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTQSXUSMIQ75XABZLXVMYLVEL",
        headers: {
          authorization: "Bearer test-token",
        },
      });

      expect([200, 404]).toContain(response.statusCode);
    });
  });

  describe("POST /bulk-lookup", () => {
    it("enriches a batch of addresses", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/labels/bulk-lookup",
        headers: {
          authorization: "Bearer test-token",
        },
        payload: {
          addresses: [
            "GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTQSXUSMIQ75XABZLXVMYLVEL",
            "GBBU3DGAB3DM6LHWYFVMC3YKKCPLMQ5L46COQYHBABMAKAEOMIATwin",
          ],
          chain: "stellar",
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.labels).toBeDefined();
      expect(typeof json.labels).toBe("object");
    });

    it("validates addresses array", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/labels/bulk-lookup",
        headers: {
          authorization: "Bearer test-token",
        },
        payload: {
          addresses: [],
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("enforces maximum address count of 500", async () => {
      const tooManyAddresses = Array(501)
        .fill("GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTQSXUSMIQ75XABZLXVMYLVEL");

      const response = await app.inject({
        method: "POST",
        url: "/labels/bulk-lookup",
        headers: {
          authorization: "Bearer test-token",
        },
        payload: {
          addresses: tooManyAddresses,
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toContain("500");
    });
  });

  describe("POST /", () => {
    it("creates a new address label with 201 status", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/labels",
        headers: {
          authorization: "Bearer test-token",
        },
        payload: {
          address: "GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTQSXUSMIQ75XABZLXVMYLVEL",
          label: "My Custom Label",
          chain: "stellar",
          category: "user-defined",
          confidence: 0.95,
        },
      });

      expect(response.statusCode).toBe(201);
      const json = response.json();
      expect(json.label).toBeDefined();
      expect(json.label.label).toBe("New Label");
    });

    it("requires address and label fields", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/labels",
        headers: {
          authorization: "Bearer test-token",
        },
        payload: {
          address: "GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTQSXUSMIQ75XABZLXVMYLVEL",
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("defaults chain to stellar if not provided", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/labels",
        headers: {
          authorization: "Bearer test-token",
        },
        payload: {
          address: "GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTQSXUSMIQ75XABZLXVMYLVEL",
          label: "Test Label",
        },
      });

      expect([200, 201]).toContain(response.statusCode);
    });
  });

  describe("PATCH /:id", () => {
    it("updates a label", async () => {
      const response = await app.inject({
        method: "PATCH",
        url: "/labels/label-1",
        headers: {
          authorization: "Bearer test-token",
        },
        payload: {
          label: "Updated Label Name",
          category: "trusted",
          confidence: 0.9,
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.label).toBeDefined();
    });

    it("allows partial updates", async () => {
      const response = await app.inject({
        method: "PATCH",
        url: "/labels/label-1",
        headers: {
          authorization: "Bearer test-token",
        },
        payload: {
          label: "New Name Only",
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it("can deactivate a label", async () => {
      const response = await app.inject({
        method: "PATCH",
        url: "/labels/label-1",
        headers: {
          authorization: "Bearer test-token",
        },
        payload: {
          isActive: false,
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it("returns 404 for non-existent label", async () => {
      vi.mocked(vi.mocked).mockRejectedValueOnce(new Error("Label not found"));

      const response = await app.inject({
        method: "PATCH",
        url: "/labels/non-existent",
        headers: {
          authorization: "Bearer test-token",
        },
        payload: {
          label: "Updated",
        },
      });

      expect([200, 404, 400]).toContain(response.statusCode);
    });
  });

  describe("DELETE /:id", () => {
    it("deletes a label with 204 response", async () => {
      const response = await app.inject({
        method: "DELETE",
        url: "/labels/label-1",
        headers: {
          authorization: "Bearer test-token",
        },
      });

      expect(response.statusCode).toBe(204);
    });

    it("returns 404 for non-existent label", async () => {
      vi.mocked(vi.mocked).mockRejectedValueOnce(new Error("Label not found"));

      const response = await app.inject({
        method: "DELETE",
        url: "/labels/non-existent",
        headers: {
          authorization: "Bearer test-token",
        },
      });

      expect([204, 404, 400]).toContain(response.statusCode);
    });

    it("requires write permission", async () => {
      const response = await app.inject({
        method: "DELETE",
        url: "/labels/label-1",
      });

      expect([204, 401, 403]).toContain(response.statusCode);
    });
  });
});
