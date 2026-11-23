import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

const serviceMocks = vi.hoisted(() => ({
  initializeCursor: vi.fn(),
  advanceCursor: vi.fn(),
  createRollback: vi.fn(),
  completeRollback: vi.fn(),
  reconcileCursorPosition: vi.fn(),
  getAuditLog: vi.fn(),
  getRollbackHistory: vi.fn(),
  getReconciliationHistory: vi.fn(),
  getDiscrepancies: vi.fn(),
  pauseCursor: vi.fn(),
  resumeCursor: vi.fn(),
}));

// The route module imports a service singleton, so the singleton itself is mocked.
vi.mock("../../services/horizonCursorAudit.service.js", () => ({
  horizonCursorAuditService: serviceMocks,
}));

// Grants the scopes listed in `x-test-scopes`; no header means unauthenticated.
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
      request.tenantContext = { tenantId: "key-1", actorId: "actor-1", actorType: "user", bypass: false };
    },
}));

import { horizonCursorAuditRoutes } from "../../api/routes/horizonCursorAudit.routes.js";

const PREFIX = "/api/v1/horizon-cursor-audit";
const ADMIN_SCOPE = { "x-test-scopes": "admin" };
const NON_ADMIN_SCOPE = { "x-test-scopes": "reports:read" };
const CURSOR_UUID = "00000000-0000-4000-8000-000000000001";
const ROLLBACK_UUID = "00000000-0000-4000-8000-000000000002";

const CURSOR = {
  id: CURSOR_UUID,
  cursorKey: "horizon-ledger",
  cursorType: "ledger",
  sourceName: "stellar-horizon",
  currentPosition: "1000",
};

const AUDIT_LOG = [
  {
    cursorId: CURSOR_UUID,
    action: "advance",
    previousPosition: "990",
    newPosition: "1000",
    eventsInBatch: 10,
    reasonCode: "normal_sync",
  },
];

describe("horizonCursorAuditRoutes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.resetAllMocks();
    serviceMocks.initializeCursor.mockResolvedValue(CURSOR);
    serviceMocks.advanceCursor.mockResolvedValue({
      success: true,
      previousPosition: "1000",
      newPosition: "1010",
    });
    serviceMocks.createRollback.mockResolvedValue({
      id: ROLLBACK_UUID,
      status: "initiated",
    });
    serviceMocks.completeRollback.mockResolvedValue(undefined);
    serviceMocks.reconcileCursorPosition.mockResolvedValue({
      id: "recon-1",
      positionsMatch: false,
      actionTaken: "corrected_local",
    });
    serviceMocks.getAuditLog.mockResolvedValue({
      logs: AUDIT_LOG,
      pagination: { total: 1 },
      cursor: "page-cursor-1",
    });
    serviceMocks.getRollbackHistory.mockResolvedValue([{ id: ROLLBACK_UUID }]);
    serviceMocks.getReconciliationHistory.mockResolvedValue([{ id: "recon-1" }]);
    serviceMocks.getDiscrepancies.mockResolvedValue([
      { cursorKey: "horizon-ledger", gap: 12 },
    ]);
    serviceMocks.pauseCursor.mockResolvedValue(undefined);
    serviceMocks.resumeCursor.mockResolvedValue(undefined);

    app = Fastify();
    await app.register(horizonCursorAuditRoutes, { prefix: PREFIX });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe("POST /cursors", () => {
    it("initializes a cursor", async () => {
      const payload = {
        cursorKey: "horizon-ledger",
        cursorType: "ledger",
        sourceName: "stellar-horizon",
        currentPosition: "1000",
      };
      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/cursors`,
        headers: ADMIN_SCOPE,
        payload,
      });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toEqual(CURSOR);
      expect(serviceMocks.initializeCursor).toHaveBeenCalledWith(payload);
    });

    it("rejects a payload that is missing required fields", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/cursors`,
        headers: ADMIN_SCOPE,
        payload: { cursorKey: "horizon-ledger" },
      });

      expect(res.statusCode).toBe(400);
      expect(serviceMocks.initializeCursor).not.toHaveBeenCalled();
    });
  });

  describe("PUT /cursors/:cursorKey", () => {
    it("advances a cursor and forwards the reason code", async () => {
      const res = await app.inject({
        method: "PUT",
        url: `${PREFIX}/cursors/horizon-ledger`,
        headers: ADMIN_SCOPE,
        payload: { newPosition: "1010", eventsInBatch: 10, reasonCode: "normal_sync" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        success: true,
        previousPosition: "1000",
        newPosition: "1010",
      });
      expect(serviceMocks.advanceCursor).toHaveBeenCalledWith(
        "horizon-ledger",
        "1010",
        10,
        "normal_sync",
      );
    });

    it("rejects an advance without eventsInBatch", async () => {
      const res = await app.inject({
        method: "PUT",
        url: `${PREFIX}/cursors/horizon-ledger`,
        headers: ADMIN_SCOPE,
        payload: { newPosition: "1010" },
      });

      expect(res.statusCode).toBe(400);
      expect(serviceMocks.advanceCursor).not.toHaveBeenCalled();
    });
  });

  describe("POST /rollbacks", () => {
    const validRollback = {
      cursorId: CURSOR_UUID,
      fromPosition: "1000",
      toPosition: "990",
      eventsRolledBack: 10,
      rollbackReason: "data_corruption",
      description: "bad batch replayed",
      severity: "high",
    };

    it("creates a rollback", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/rollbacks`,
        headers: ADMIN_SCOPE,
        payload: validRollback,
      });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toEqual({ id: ROLLBACK_UUID, status: "initiated" });
      expect(serviceMocks.createRollback).toHaveBeenCalledWith(validRollback);
    });

    it("rejects invalid rollbackReason and severity values", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/rollbacks`,
        headers: ADMIN_SCOPE,
        payload: {
          ...validRollback,
          rollbackReason: "because",
          severity: "extreme",
        },
      });

      expect(res.statusCode).toBe(400);
      expect(serviceMocks.createRollback).not.toHaveBeenCalled();
    });

    it("rejects a cursorId that is not a UUID", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/rollbacks`,
        headers: ADMIN_SCOPE,
        payload: { ...validRollback, cursorId: "not-a-uuid" },
      });

      expect(res.statusCode).toBe(400);
      expect(serviceMocks.createRollback).not.toHaveBeenCalled();
    });
  });

  describe("POST /rollbacks/:rollbackId/complete", () => {
    it("completes a rollback", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/rollbacks/${ROLLBACK_UUID}/complete`,
        headers: ADMIN_SCOPE,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ success: true });
      expect(serviceMocks.completeRollback).toHaveBeenCalledWith(ROLLBACK_UUID);
    });
  });

  describe("POST /cursors/:cursorId/reconcile", () => {
    it("reconciles the local cursor with Horizon", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/cursors/${CURSOR_UUID}/reconcile`,
        headers: ADMIN_SCOPE,
        payload: { horizonPosition: "1010" },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toEqual({
        id: "recon-1",
        positionsMatch: false,
        actionTaken: "corrected_local",
      });
      expect(serviceMocks.reconcileCursorPosition).toHaveBeenCalledWith(CURSOR_UUID, "1010");
    });
  });

  describe("GET /cursors/:cursorKey/audit-log", () => {
    it("forwards pagination params and returns the log entries", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${PREFIX}/cursors/horizon-ledger/audit-log?limit=10&offset=5`,
        headers: ADMIN_SCOPE,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual(AUDIT_LOG);
      // getPaginationParams passes an explicit query.offset through as a string.
      expect(serviceMocks.getAuditLog).toHaveBeenCalledWith("horizon-ledger", 10, "5");
    });

    // formatPaginatedResponse is called with an options object where `total`
    // used to be, so the returned meta.total is that object rather than a number.
    it("documents the legacy pagination meta shape", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${PREFIX}/cursors/horizon-ledger/audit-log`,
        headers: ADMIN_SCOPE,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().meta.total).toMatchObject({
        total: 1,
        limit: 20,
        offset: 0,
        cursor: "page-cursor-1",
      });
      expect(serviceMocks.getAuditLog).toHaveBeenCalledWith("horizon-ledger", 20, 0);
    });
  });

  describe("history and discrepancy reads", () => {
    it("returns rollback history with the requested limit", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${PREFIX}/cursors/horizon-ledger/rollback-history?limit=7`,
        headers: ADMIN_SCOPE,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ rollbacks: [{ id: ROLLBACK_UUID }] });
      expect(serviceMocks.getRollbackHistory).toHaveBeenCalledWith("horizon-ledger", 7);
    });

    it("returns reconciliation history with the requested limit", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${PREFIX}/cursors/horizon-ledger/reconciliations?limit=8`,
        headers: ADMIN_SCOPE,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ reconciliations: [{ id: "recon-1" }] });
      expect(serviceMocks.getReconciliationHistory).toHaveBeenCalledWith("horizon-ledger", 8);
    });

    it("returns discrepancies with the requested limit", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${PREFIX}/discrepancies?limit=9`,
        headers: ADMIN_SCOPE,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        discrepancies: [{ cursorKey: "horizon-ledger", gap: 12 }],
      });
      expect(serviceMocks.getDiscrepancies).toHaveBeenCalledWith(9);
    });
  });

  describe("pause and resume", () => {
    it("pauses a cursor", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/cursors/horizon-ledger/pause`,
        headers: ADMIN_SCOPE,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ success: true });
      expect(serviceMocks.pauseCursor).toHaveBeenCalledWith("horizon-ledger");
    });

    it("resumes a cursor", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/cursors/horizon-ledger/resume`,
        headers: ADMIN_SCOPE,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ success: true });
      expect(serviceMocks.resumeCursor).toHaveBeenCalledWith("horizon-ledger");
    });
  });

  describe("authentication and gap documentation", () => {
    it("returns 401 when no credentials are supplied", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${PREFIX}/discrepancies`,
      });

      expect(res.statusCode).toBe(401);
      expect(serviceMocks.getDiscrepancies).not.toHaveBeenCalled();
    });

    // The issue expects non-admin callers to get 403. This module installs
    // authMiddleware() with no requiredScopes, so any authenticated scope passes.
    it("accepts a non-admin scope (no admin scope check yet)", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${PREFIX}/discrepancies`,
        headers: NON_ADMIN_SCOPE,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        discrepancies: [{ cursorKey: "horizon-ledger", gap: 12 }],
      });
    });

    // The issue's admin paths and rewind endpoint do not exist on this module.
    it("does not expose the /api/v1/admin/horizon-cursor endpoints", async () => {
      const getRes = await app.inject({
        method: "GET",
        url: "/api/v1/admin/horizon-cursor",
        headers: ADMIN_SCOPE,
      });
      const rewindRes = await app.inject({
        method: "POST",
        url: "/api/v1/admin/horizon-cursor/rewind",
        headers: ADMIN_SCOPE,
        payload: { targetLedger: 1000 },
      });

      expect(getRes.statusCode).toBe(404);
      expect(rewindRes.statusCode).toBe(404);
    });

    // Rollback creation is the closest existing equivalent to a rewind audit
    // event; there is no dedicated rewind route or audit log entry.
    it("has no rewind route under the registered cursor prefix", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/cursors/horizon-ledger/rewind`,
        headers: ADMIN_SCOPE,
        payload: { targetLedger: 990 },
      });

      expect(res.statusCode).toBe(404);
      expect(serviceMocks.createRollback).not.toHaveBeenCalled();
    });
  });
});
