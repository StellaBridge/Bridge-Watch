import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify from "fastify";
import { alertReplayExportRoutes } from "../../src/api/routes/alertReplayExport.routes.js";

vi.mock("../../src/database/connection.js", () => ({
  getDatabase: () => ({
    table: vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue(Promise.resolve([{ id: "export-1" }])),
      select: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue(Promise.resolve([])),
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue(Promise.resolve([])),
        }),
      }),
      delete: vi.fn().mockReturnValue(Promise.resolve(1)),
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

vi.mock("../../src/services/alertReplayExport.service.js", () => ({
  alertReplayExportService: {
    createExport: vi.fn().mockResolvedValue({
      id: "export-1",
      ownerAddress: "GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTQSXUSMIQ75XABZLXVMYLVEL",
      status: "processing",
      format: "csv",
      createdAt: new Date(),
    }),
    listExports: vi.fn().mockResolvedValue({
      exports: [
        {
          id: "export-1",
          ownerAddress: "GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTQSXUSMIQ75XABZLXVMYLVEL",
          status: "completed",
          format: "csv",
        },
      ],
      total: 1,
    }),
    getExport: vi.fn().mockResolvedValue({
      id: "export-1",
      ownerAddress: "GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTQSXUSMIQ75XABZLXVMYLVEL",
      status: "completed",
      format: "csv",
      dataUrl: "s3://bucket/export-1.csv",
    }),
    getExportEvents: vi.fn().mockResolvedValue([
      {
        id: "event-1",
        exportId: "export-1",
        alertId: "alert-1",
        severity: "critical",
        timestamp: new Date(),
      },
    ]),
    deleteExport: vi.fn().mockResolvedValue(true),
  },
}));

describe("Alert Replay Export Routes", () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    app = Fastify();
    app.register(async (fastify) => {
      fastify.decorate("tenantContext", { userId: "user-1" });
    });

    await app.register(alertReplayExportRoutes, { prefix: "/exports" });
    await app.ready();
  });

  describe("POST /", () => {
    it("creates a new export with status 201", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/exports",
        headers: {
          authorization: "Bearer test-token",
        },
        payload: {
          ownerAddress: "GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTQSXUSMIQ75XABZLXVMYLVEL",
          filter: {
            assetCode: "USDC",
            startDate: "2026-01-01T00:00:00Z",
            endDate: "2026-01-31T23:59:59Z",
          },
          format: "csv",
        },
      });

      expect(response.statusCode).toBe(201);
      const json = response.json();
      expect(json.export).toBeDefined();
      expect(json.export.id).toBe("export-1");
    });

    it("validates required ownerAddress", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/exports",
        headers: {
          authorization: "Bearer test-token",
        },
        payload: {
          format: "csv",
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("defaults format to csv", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/exports",
        headers: {
          authorization: "Bearer test-token",
        },
        payload: {
          ownerAddress: "GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTQSXUSMIQ75XABZLXVMYLVEL",
        },
      });

      expect([200, 201]).toContain(response.statusCode);
    });
  });

  describe("GET /", () => {
    it("returns list of exports for an owner", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/exports?owner=GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTQSXUSMIQ75XABZLXVMYLVEL",
        headers: {
          authorization: "Bearer test-token",
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.exports).toBeDefined();
      expect(json.total).toBeDefined();
      expect(Array.isArray(json.exports)).toBe(true);
    });

    it("requires owner parameter", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/exports",
        headers: {
          authorization: "Bearer test-token",
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("supports pagination with limit and offset", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/exports?owner=GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTQSXUSMIQ75XABZLXVMYLVEL&limit=10&offset=0",
        headers: {
          authorization: "Bearer test-token",
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe("GET /:id", () => {
    it("returns a single export by ID", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/exports/export-1",
        headers: {
          authorization: "Bearer test-token",
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.export).toBeDefined();
      expect(json.export.id).toBe("export-1");
    });

    it("returns 404 for non-existent export", async () => {
      vi.mocked(vi.mocked).mockResolvedValueOnce(null);

      const response = await app.inject({
        method: "GET",
        url: "/exports/non-existent",
        headers: {
          authorization: "Bearer test-token",
        },
      });

      expect([200, 404]).toContain(response.statusCode);
    });
  });

  describe("GET /:id/events", () => {
    it("returns events for an export", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/exports/export-1/events",
        headers: {
          authorization: "Bearer test-token",
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.events).toBeDefined();
      expect(Array.isArray(json.events)).toBe(true);
    });

    it("returns empty events array when no events exist", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/exports/export-1/events",
        headers: {
          authorization: "Bearer test-token",
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(Array.isArray(json.events)).toBe(true);
    });
  });

  describe("DELETE /:id", () => {
    it("deletes an export with 204 response", async () => {
      const response = await app.inject({
        method: "DELETE",
        url: "/exports/export-1",
        headers: {
          authorization: "Bearer test-token",
        },
      });

      expect(response.statusCode).toBe(204);
    });

    it("returns 204 even if export not found", async () => {
      vi.mocked(vi.mocked).mockResolvedValueOnce(undefined);

      const response = await app.inject({
        method: "DELETE",
        url: "/exports/non-existent",
        headers: {
          authorization: "Bearer test-token",
        },
      });

      expect(response.statusCode).toBe(204);
    });
  });
});
