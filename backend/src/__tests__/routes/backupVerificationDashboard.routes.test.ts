import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

const serviceMocks = vi.hoisted(() => ({
  initiateVerification: vi.fn(),
  recordVerificationResult: vi.fn(),
  getBackupStatus: vi.fn(),
  getDashboardOverview: vi.fn(),
  getFailedVerifications: vi.fn(),
  getPendingVerifications: vi.fn(),
  scheduleVerification: vi.fn(),
}));

vi.mock("../../services/backupVerificationDashboard.service.js", () => ({
  BackupVerificationDashboardService: vi.fn().mockImplementation(() => serviceMocks),
}));

vi.mock("../../api/middleware/auth.js", () => ({
  authMiddleware:
    (options: { requiredScopes?: string[] } = {}) =>
    async (request: any, reply: any) => {
      const header = request.headers["x-test-scopes"];
      if (typeof header !== "string") {
        return reply.status(401).send({ error: "Unauthorized" });
      }
      const granted = header.split(",").map((s: string) => s.trim()).filter(Boolean);
      const required = options.requiredScopes ?? [];
      if (!granted.includes("*") && !required.every((scope) => granted.includes(scope))) {
        return reply.status(403).send({ error: "Forbidden" });
      }
      request.tenantContext = { tenantId: "t-1", actorId: "u-1", actorType: "user", bypass: false };
    },
}));

import { backupVerificationDashboardRoutes } from "../../api/routes/backupVerificationDashboard.routes.js";

const AUTH = { "x-test-scopes": "*" };
const BACKUP_ID = "bkp-abc-123";
const VERIFICATION_ID = "vrf-def-456";

function makeVerificationRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: VERIFICATION_ID,
    backupId: BACKUP_ID,
    backupName: "nightly-2026-01-01",
    verificationType: "checksum",
    status: "pending",
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: null,
    passed: null,
    ...overrides,
  };
}

describe("backupVerificationDashboardRoutes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.resetAllMocks();

    serviceMocks.initiateVerification.mockResolvedValue(makeVerificationRecord());
    serviceMocks.recordVerificationResult.mockResolvedValue(undefined);
    serviceMocks.getBackupStatus.mockResolvedValue({
      backupId: BACKUP_ID,
      lastVerified: "2026-01-01T00:00:00.000Z",
      status: "verified",
    });
    serviceMocks.getDashboardOverview.mockResolvedValue({
      total: 10,
      passed: 8,
      failed: 1,
      pending: 1,
    });
    serviceMocks.getFailedVerifications.mockResolvedValue([
      makeVerificationRecord({ status: "failed", passed: false }),
    ]);
    serviceMocks.getPendingVerifications.mockResolvedValue([makeVerificationRecord()]);
    serviceMocks.scheduleVerification.mockResolvedValue(undefined);

    app = Fastify();
    await app.register(backupVerificationDashboardRoutes);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it.each([
    { method: "POST", url: "/api/v1/admin/backups/verify/initiate", payload: { backup_id: BACKUP_ID, backup_name: "n", verification_type: "checksum" } },
    { method: "POST", url: `/api/v1/admin/backups/verify/${VERIFICATION_ID}/result`, payload: { backup_id: BACKUP_ID, verification_type: "checksum", passed: true, duration_ms: 100 } },
    { method: "GET", url: `/api/v1/backups/${BACKUP_ID}/verification-status` },
    { method: "GET", url: "/api/v1/admin/backups/verify/dashboard/overview" },
    { method: "GET", url: "/api/v1/admin/backups/verify/failed" },
    { method: "GET", url: "/api/v1/admin/backups/verify/pending" },
    { method: "POST", url: `/api/v1/admin/backups/${BACKUP_ID}/schedule-verification` },
  ] as const)("$method $url returns 401 without credentials", async (endpoint) => {
    const res = await app.inject({ ...endpoint });

    expect(res.statusCode).toBe(401);
    for (const fn of Object.values(serviceMocks)) expect(fn).not.toHaveBeenCalled();
  });

  describe("POST /api/v1/admin/backups/verify/initiate", () => {
    it("initiates a checksum verification", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/admin/backups/verify/initiate",
        headers: AUTH,
        payload: {
          backup_id: BACKUP_ID,
          backup_name: "nightly-2026-01-01",
          verification_type: "checksum",
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.headers["content-type"]).toContain("application/json");
      expect(res.json()).toHaveProperty("data");
      expect(serviceMocks.initiateVerification).toHaveBeenCalledWith(
        BACKUP_ID,
        "nightly-2026-01-01",
        "checksum"
      );
    });

    it.each([
      ["restore_test", "restore_test"],
      ["integrity", "integrity"],
    ])("accepts verification_type '%s'", async (_, vtype) => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/admin/backups/verify/initiate",
        headers: AUTH,
        payload: { backup_id: BACKUP_ID, backup_name: "bkp", verification_type: vtype },
      });

      expect(res.statusCode).toBe(201);
    });

    it("returns 400 when backup_id is missing", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/admin/backups/verify/initiate",
        headers: AUTH,
        payload: { backup_name: "bkp", verification_type: "checksum" },
      });

      expect(res.statusCode).toBe(400);
      expect(serviceMocks.initiateVerification).not.toHaveBeenCalled();
    });

    it("returns 400 for invalid verification_type", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/admin/backups/verify/initiate",
        headers: AUTH,
        payload: { backup_id: BACKUP_ID, backup_name: "bkp", verification_type: "unknown" },
      });

      expect(res.statusCode).toBe(400);
      expect(serviceMocks.initiateVerification).not.toHaveBeenCalled();
    });

    it("returns 400 when service throws", async () => {
      serviceMocks.initiateVerification.mockRejectedValue(new Error("Duplicate verification"));

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/admin/backups/verify/initiate",
        headers: AUTH,
        payload: { backup_id: BACKUP_ID, backup_name: "bkp", verification_type: "checksum" },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toHaveProperty("error");
    });
  });

  describe("POST /api/v1/admin/backups/verify/:id/result", () => {
    const validResult = {
      backup_id: BACKUP_ID,
      verification_type: "checksum",
      passed: true,
      duration_ms: 1200,
      verified_file_count: 100,
      total_file_count: 100,
    };

    it("records a successful verification result", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/admin/backups/verify/${VERIFICATION_ID}/result`,
        headers: AUTH,
        payload: validResult,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ success: true });
      expect(serviceMocks.recordVerificationResult).toHaveBeenCalledWith(
        VERIFICATION_ID,
        expect.objectContaining({ passed: true, duration_ms: 1200 })
      );
    });

    it("records a failed verification result with error field", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/admin/backups/verify/${VERIFICATION_ID}/result`,
        headers: AUTH,
        payload: { ...validResult, passed: false, error: "Checksum mismatch" },
      });

      expect(res.statusCode).toBe(200);
      expect(serviceMocks.recordVerificationResult).toHaveBeenCalledWith(
        VERIFICATION_ID,
        expect.objectContaining({ passed: false, error: "Checksum mismatch" })
      );
    });

    it("returns 400 when required fields are missing", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/admin/backups/verify/${VERIFICATION_ID}/result`,
        headers: AUTH,
        payload: { backup_id: BACKUP_ID },
      });

      expect(res.statusCode).toBe(400);
      expect(serviceMocks.recordVerificationResult).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/v1/backups/:backup_id/verification-status", () => {
    it("returns the latest verification status for a backup", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/backups/${BACKUP_ID}/verification-status`,
        headers: AUTH,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toHaveProperty("data");
      expect(serviceMocks.getBackupStatus).toHaveBeenCalledWith(BACKUP_ID);
    });

    it("returns 400 when service throws", async () => {
      serviceMocks.getBackupStatus.mockRejectedValue(new Error("Not found"));

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/backups/${BACKUP_ID}/verification-status`,
        headers: AUTH,
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe("GET /api/v1/admin/backups/verify/dashboard/overview", () => {
    it("returns the dashboard overview with default 7-day window", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/admin/backups/verify/dashboard/overview",
        headers: AUTH,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty("data");
      expect(serviceMocks.getDashboardOverview).toHaveBeenCalledWith(7);
    });

    it("accepts a custom days query param", async () => {
      await app.inject({
        method: "GET",
        url: "/api/v1/admin/backups/verify/dashboard/overview?days=30",
        headers: AUTH,
      });

      expect(serviceMocks.getDashboardOverview).toHaveBeenCalledWith(30);
    });
  });

  describe("GET /api/v1/admin/backups/verify/failed", () => {
    it("returns all failed verifications", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/admin/backups/verify/failed",
        headers: AUTH,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data).toHaveLength(1);
      expect(serviceMocks.getFailedVerifications).toHaveBeenCalled();
    });

    it("returns empty list when no failures", async () => {
      serviceMocks.getFailedVerifications.mockResolvedValue([]);

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/admin/backups/verify/failed",
        headers: AUTH,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data).toHaveLength(0);
    });
  });

  describe("GET /api/v1/admin/backups/verify/pending", () => {
    it("returns all pending verifications", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/admin/backups/verify/pending",
        headers: AUTH,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data).toHaveLength(1);
      expect(serviceMocks.getPendingVerifications).toHaveBeenCalled();
    });
  });

  describe("POST /api/v1/admin/backups/:backup_id/schedule-verification", () => {
    it("schedules a verification for a backup", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/admin/backups/${BACKUP_ID}/schedule-verification`,
        headers: AUTH,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ success: true });
      expect(serviceMocks.scheduleVerification).toHaveBeenCalledWith(BACKUP_ID);
    });

    it("returns 400 when service throws", async () => {
      serviceMocks.scheduleVerification.mockRejectedValue(new Error("Already scheduled"));

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/admin/backups/${BACKUP_ID}/schedule-verification`,
        headers: AUTH,
      });

      expect(res.statusCode).toBe(400);
    });
  });
});
