import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify from "fastify";
import { complianceRetentionExceptionRoutes } from "../../src/api/routes/complianceRetentionExceptions.routes.js";

const service = vi.hoisted(() => ({
  createException: vi.fn(),
  listExceptions: vi.fn(),
  getException: vi.fn(),
  releaseException: vi.fn(),
}));

vi.mock("../../src/services/complianceRetentionException.service.js", () => ({
  ComplianceRetentionExceptionService: vi.fn(() => service),
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const validCreate = {
  exceptionCode: "EXC-001",
  title: "Legal hold",
  reason: "Pending litigation",
  requestedBy: "compliance-officer",
  targetType: "all",
};

describe("Compliance retention exception routes", () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify();
    await app.register(complianceRetentionExceptionRoutes);
    await app.ready();
  });

  describe("POST /compliance/retention-exceptions", () => {
    it("creates an exception and returns 201", async () => {
      service.createException.mockResolvedValue({ id: "exc-1", ...validCreate });

      const res = await app.inject({
        method: "POST",
        url: "/compliance/retention-exceptions",
        payload: validCreate,
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().exception).toMatchObject({ id: "exc-1" });
    });

    it("converts startDate and endDate strings into Date objects", async () => {
      service.createException.mockResolvedValue({ id: "exc-2" });

      await app.inject({
        method: "POST",
        url: "/compliance/retention-exceptions",
        payload: {
          ...validCreate,
          startDate: "2026-01-01T00:00:00.000Z",
          endDate: "2026-02-01T00:00:00.000Z",
        },
      });

      const arg = service.createException.mock.calls[0][0];
      expect(arg.startDate).toBeInstanceOf(Date);
      expect(arg.endDate).toBeInstanceOf(Date);
      expect(arg.startDate.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    });

    it("returns 400 when required fields are missing", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/compliance/retention-exceptions",
        payload: { exceptionCode: "EXC-001" },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("Invalid retention exception payload");
      expect(service.createException).not.toHaveBeenCalled();
    });

    it("returns 400 when targetType is not in the allowed enum", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/compliance/retention-exceptions",
        payload: { ...validCreate, targetType: "bogus" },
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 400 with the service error message when creation fails", async () => {
      service.createException.mockRejectedValue(new Error("Overlapping exception"));

      const res = await app.inject({
        method: "POST",
        url: "/compliance/retention-exceptions",
        payload: validCreate,
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("Overlapping exception");
    });
  });

  describe("GET /compliance/retention-exceptions", () => {
    it("lists exceptions with the default limit of 50", async () => {
      service.listExceptions.mockResolvedValue([{ id: "exc-1" }]);

      const res = await app.inject({
        method: "GET",
        url: "/compliance/retention-exceptions",
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ exceptions: [{ id: "exc-1" }] });
      expect(service.listExceptions).toHaveBeenCalledWith({
        status: undefined,
        targetType: undefined,
        limit: 50,
      });
    });

    it("forwards status, targetType and a parsed limit", async () => {
      service.listExceptions.mockResolvedValue([]);

      await app.inject({
        method: "GET",
        url: "/compliance/retention-exceptions?status=active&targetType=alert&limit=10",
      });

      expect(service.listExceptions).toHaveBeenCalledWith({
        status: "active",
        targetType: "alert",
        limit: 10,
      });
    });

    it("returns 500 when the service throws", async () => {
      service.listExceptions.mockRejectedValue(new Error("db down"));

      const res = await app.inject({
        method: "GET",
        url: "/compliance/retention-exceptions",
      });

      expect(res.statusCode).toBe(500);
      expect(res.json().error).toBe("Failed to list retention exceptions");
    });
  });

  describe("GET /compliance/retention-exceptions/:id", () => {
    it("returns the exception when found", async () => {
      service.getException.mockResolvedValue({ id: "exc-1", title: "Legal hold" });

      const res = await app.inject({
        method: "GET",
        url: "/compliance/retention-exceptions/exc-1",
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ id: "exc-1" });
      expect(service.getException).toHaveBeenCalledWith("exc-1");
    });

    it("returns 404 when the exception does not exist", async () => {
      service.getException.mockResolvedValue(null);

      const res = await app.inject({
        method: "GET",
        url: "/compliance/retention-exceptions/missing",
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe("Retention exception not found");
    });

    it("returns 500 when the lookup throws", async () => {
      service.getException.mockRejectedValue(new Error("boom"));

      const res = await app.inject({
        method: "GET",
        url: "/compliance/retention-exceptions/exc-1",
      });

      expect(res.statusCode).toBe(500);
      expect(res.json().error).toBe("Failed to fetch retention exception");
    });
  });

  describe("POST /compliance/retention-exceptions/:id/release", () => {
    it("releases the exception and returns it", async () => {
      service.releaseException.mockResolvedValue({ id: "exc-1", status: "released" });

      const res = await app.inject({
        method: "POST",
        url: "/compliance/retention-exceptions/exc-1/release",
        payload: { releasedBy: "admin", releaseReason: "Hold lifted" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().exception).toMatchObject({ status: "released" });
      expect(service.releaseException).toHaveBeenCalledWith("exc-1", "admin", "Hold lifted");
    });

    it("returns 400 when releasedBy is missing", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/compliance/retention-exceptions/exc-1/release",
        payload: {},
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("Invalid release payload");
      expect(service.releaseException).not.toHaveBeenCalled();
    });

    it("returns 400 with the service error message when release fails", async () => {
      service.releaseException.mockRejectedValue(new Error("Already released"));

      const res = await app.inject({
        method: "POST",
        url: "/compliance/retention-exceptions/exc-1/release",
        payload: { releasedBy: "admin" },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("Already released");
    });
  });
});
