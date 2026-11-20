import { describe, it, expect, beforeEach, vi } from "vitest";
import { HorizonCursorAuditService } from "../../services/horizonCursorAudit.service.js";
import type { CursorPosition, AuditLogEntry, RollbackInfo } from "../../services/horizonCursorAudit.service.js";

vi.mock("../../database/index.js");
vi.mock("../../utils/logger.js");
vi.mock("../../services/metrics.service.js");

const createMockDatabase = () => {
  const mockInsert = vi.fn().mockResolvedValue([{ id: "cursor-1" }]);
  const mockUpdate = vi.fn().mockResolvedValue([]);
  const mockWhere = vi.fn().mockReturnThis();
  const mockFirst = vi.fn();
  const mockReturning = vi.fn().mockResolvedValue([{ id: "cursor-1", current_position: "12345" }]);
  const mockOrderBy = vi.fn().mockReturnThis();
  const mockLimit = vi.fn().mockReturnThis();
  const mockOffset = vi.fn().mockResolvedValue([]);
  const mockCount = vi.fn().mockReturnThis();

  return {
    insert: mockInsert.mockReturnValue({ returning: mockReturning }),
    where: mockWhere.mockReturnValue({
      insert: mockInsert.mockReturnValue({ returning: mockReturning }),
      first: mockFirst,
      update: mockUpdate.mockReturnValue({ returning: mockReturning }),
    }),
    orderBy: mockOrderBy.mockReturnValue({
      limit: mockLimit.mockReturnValue({
        offset: mockOffset,
      }),
    }),
    count: mockCount.mockReturnValue({
      first: mockFirst,
    }),
  };
};

describe("HorizonCursorAuditService", () => {
  let service: HorizonCursorAuditService;
  let mockDb: ReturnType<typeof createMockDatabase>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDatabase();

    vi.stubGlobal("getDatabase", vi.fn(() => mockDb));
    service = new HorizonCursorAuditService();
  });

  describe("initializeCursor", () => {
    it("should initialize a new cursor with correct position", async () => {
      const cursorPosition: CursorPosition = {
        cursorKey: "stellar-payments",
        cursorType: "horizon",
        sourceName: "horizon-api",
        currentPosition: "50000000",
      };

      mockDb.insert = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: "cursor-1", ...cursorPosition }]),
      });

      const result = await service.initializeCursor(cursorPosition);

      expect(result).toBeDefined();
      expect(mockDb.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor_key: cursorPosition.cursorKey,
          cursor_type: cursorPosition.cursorType,
          source_name: cursorPosition.sourceName,
          current_position: cursorPosition.currentPosition,
          status: "active",
        })
      );
    });

    it("should create audit log entry when initializing cursor", async () => {
      const cursorPosition: CursorPosition = {
        cursorKey: "test-cursor",
        cursorType: "horizon",
        sourceName: "test-source",
        currentPosition: "12345",
      };

      mockDb.insert = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: "cursor-1" }]),
      });

      await service.initializeCursor(cursorPosition);

      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe("advanceCursor", () => {
    it("should advance cursor to new position with event count", async () => {
      const cursorKey = "stellar-payments";
      const newPosition = "50000100";
      const eventsInBatch = 100;

      mockDb.where = vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: "cursor-1",
          current_position: "50000000",
          total_events_processed: 50000,
        }),
        update: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            { id: "cursor-1", current_position: newPosition },
          ]),
        }),
      });

      mockDb.insert = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      });

      const result = await service.advanceCursor(cursorKey, newPosition, eventsInBatch);

      expect(result.success).toBe(true);
      expect(result.previousPosition).toBe("50000000");
      expect(result.newPosition).toBe(newPosition);
    });

    it("should throw error if cursor not found", async () => {
      mockDb.where = vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      });

      await expect(
        service.advanceCursor("non-existent", "50000100", 100)
      ).rejects.toThrow("Cursor not found");
    });

    it("should increment total events processed", async () => {
      const previousEvents = 50000;
      const eventsInBatch = 100;

      mockDb.where = vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: "cursor-1",
          current_position: "50000000",
          total_events_processed: previousEvents,
        }),
        update: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      });

      mockDb.insert = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      });

      await service.advanceCursor("test", "50000100", eventsInBatch);

      const updateCall = (mockDb.where as any).mock.results[0].value.update.mock.calls[0][0];
      expect(updateCall.total_events_processed).toBe(previousEvents + eventsInBatch);
    });
  });

  describe("createRollback", () => {
    it("should create rollback record with reason and severity", async () => {
      const rollbackInfo: RollbackInfo = {
        cursorId: "cursor-1",
        fromPosition: "50000100",
        toPosition: "50000050",
        eventsRolledBack: 50,
        rollbackReason: "data_corruption",
        description: "Detected duplicate events",
        severity: "high",
      };

      mockDb.insert = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: "rollback-1" }]),
      });

      const result = await service.createRollback(rollbackInfo);

      expect(result).toBeDefined();
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("should handle different rollback reasons", async () => {
      const reasons: RollbackInfo["rollbackReason"][] = [
        "data_corruption",
        "network_failure",
        "duplicate_events",
        "ordering_violation",
        "manual_override",
      ];

      for (const reason of reasons) {
        mockDb.insert = vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "rollback-1" }]),
        });

        const rollbackInfo: RollbackInfo = {
          cursorId: "cursor-1",
          fromPosition: "50000100",
          toPosition: "50000000",
          eventsRolledBack: 100,
          rollbackReason: reason,
          description: `Rollback due to ${reason}`,
          severity: "high",
        };

        const result = await service.createRollback(rollbackInfo);
        expect(result).toBeDefined();
      }
    });
  });

  describe("completeRollback", () => {
    it("should mark rollback as completed", async () => {
      const rollbackId = "rollback-1";

      mockDb.where = vi.fn().mockReturnValue({
        update: vi.fn().mockResolvedValue([]),
      });

      await service.completeRollback(rollbackId);

      expect(mockDb.where).toHaveBeenCalledWith("id", rollbackId);
      expect((mockDb.where as any).mock.results[0].value.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "completed",
        })
      );
    });
  });

  describe("reconcileCursorPosition", () => {
    it("should detect when positions match", async () => {
      const cursorId = "cursor-1";
      const horizonPosition = "50000100";

      mockDb.where = vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: cursorId,
          current_position: horizonPosition,
          cursor_type: "horizon",
        }),
      });

      mockDb.insert = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          {
            cursor_id: cursorId,
            positions_match: true,
            action_taken: "none",
          },
        ]),
      });

      const result = await service.reconcileCursorPosition(cursorId, horizonPosition);

      expect(result.positions_match).toBe(true);
    });

    it("should auto-correct small gaps (< 100 ledgers)", async () => {
      const cursorId = "cursor-1";
      const horizonPosition = "50000100";
      const localPosition = "50000050";

      mockDb.where = vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: cursorId,
          current_position: localPosition,
          cursor_type: "horizon",
        }),
        update: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      });

      mockDb.insert = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          {
            cursor_id: cursorId,
            positions_match: false,
            position_gap: 50,
            action_taken: "corrected_local",
            auto_corrected: true,
          },
        ]),
      });

      const result = await service.reconcileCursorPosition(cursorId, horizonPosition);

      expect(result.action_taken).toBe("corrected_local");
      expect(result.auto_corrected).toBe(true);
    });

    it("should escalate large gaps (>= 100 ledgers)", async () => {
      const cursorId = "cursor-1";
      const horizonPosition = "50000100";
      const localPosition = "49999900";

      mockDb.where = vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: cursorId,
          current_position: localPosition,
          cursor_type: "horizon",
        }),
      });

      mockDb.insert = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          {
            cursor_id: cursorId,
            positions_match: false,
            position_gap: 200,
            action_taken: "escalated",
            auto_corrected: false,
          },
        ]),
      });

      const result = await service.reconcileCursorPosition(cursorId, horizonPosition);

      expect(result.action_taken).toBe("escalated");
      expect(result.auto_corrected).toBe(false);
    });
  });

  describe("getAuditLog", () => {
    it("should retrieve audit logs with pagination", async () => {
      const cursorKey = "stellar-payments";

      mockDb.where = vi.fn()
        .mockReturnValueOnce({
          first: vi.fn().mockResolvedValue({ id: "cursor-1" }),
        })
        .mockReturnValueOnce({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue([
                { id: "log-1", action: "initialize" },
                { id: "log-2", action: "advance" },
              ]),
            }),
          }),
        })
        .mockReturnValueOnce({
          count: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue({ count: 2 }),
          }),
        });

      const result = await service.getAuditLog(cursorKey, 10, 0);

      expect(result.cursor).toBeDefined();
      expect(result.logs).toBeDefined();
      expect(result.pagination.limit).toBe(10);
      expect(result.pagination.offset).toBe(0);
    });

    it("should use default limit and offset", async () => {
      mockDb.where = vi.fn()
        .mockReturnValueOnce({
          first: vi.fn().mockResolvedValue({ id: "cursor-1" }),
        })
        .mockReturnValueOnce({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue([]),
            }),
          }),
        })
        .mockReturnValueOnce({
          count: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue({ count: 0 }),
          }),
        });

      const result = await service.getAuditLog("test");

      expect(result.pagination.limit).toBe(100);
      expect(result.pagination.offset).toBe(0);
    });
  });

  describe("getRollbackHistory", () => {
    it("should retrieve rollback history ordered by creation time", async () => {
      const cursorKey = "stellar-payments";

      mockDb.where = vi.fn()
        .mockReturnValueOnce({
          first: vi.fn().mockResolvedValue({ id: "cursor-1" }),
        })
        .mockReturnValueOnce({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              { id: "rollback-1", rollback_reason: "data_corruption" },
            ]),
          }),
        });

      const result = await service.getRollbackHistory(cursorKey);

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("pauseCursor", () => {
    it("should pause cursor and log action", async () => {
      const cursorKey = "stellar-payments";

      mockDb.where = vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: "cursor-1",
          current_position: "50000100",
        }),
        update: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      });

      mockDb.insert = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      });

      await service.pauseCursor(cursorKey);

      const updateCall = (mockDb.where as any).mock.results[0].value.update.mock.calls[0][0];
      expect(updateCall.status).toBe("paused");
    });

    it("should throw error if cursor not found", async () => {
      mockDb.where = vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      });

      await expect(service.pauseCursor("non-existent")).rejects.toThrow(
        "Cursor not found"
      );
    });
  });

  describe("resumeCursor", () => {
    it("should resume cursor and log action", async () => {
      const cursorKey = "stellar-payments";

      mockDb.where = vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: "cursor-1",
          current_position: "50000100",
        }),
        update: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      });

      mockDb.insert = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      });

      await service.resumeCursor(cursorKey);

      const updateCall = (mockDb.where as any).mock.results[0].value.update.mock.calls[0][0];
      expect(updateCall.status).toBe("active");
    });

    it("should throw error if cursor not found", async () => {
      mockDb.where = vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      });

      await expect(service.resumeCursor("non-existent")).rejects.toThrow(
        "Cursor not found"
      );
    });
  });
});
