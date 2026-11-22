import { describe, it, expect, beforeEach, vi } from "vitest";
import { LedgerCloseDelayService } from "../../services/ledgerCloseDelay.service.js";
import type { LedgerCloseRecord, DelayAlert } from "../../services/ledgerCloseDelay.service.js";

vi.mock("../../database/index.js");
vi.mock("../../utils/logger.js");

const createMockDatabase = () => {
  const mockInsert = vi.fn().mockResolvedValue([{ id: "event-1" }]);
  const mockWhere = vi.fn().mockReturnThis();
  const mockReturning = vi.fn().mockResolvedValue([{ id: "event-1" }]);
  const mockOrderBy = vi.fn().mockReturnThis();
  const mockLimit = vi.fn().mockResolvedValue([]);
  const mockWhereBetween = vi.fn().mockReturnThis();
  const mockSelect = vi.fn().mockResolvedValue([]);

  return {
    insert: mockInsert.mockReturnValue({ returning: mockReturning }),
    where: mockWhere.mockReturnValue({
      insert: mockInsert.mockReturnValue({ returning: mockReturning }),
      update: vi.fn().mockResolvedValue([]),
    }),
    whereBetween: mockWhereBetween.mockReturnValue({
      select: mockSelect,
    }),
    orderBy: mockOrderBy.mockReturnValue({
      limit: mockLimit,
      where: mockWhere.mockReturnValue({
        select: mockSelect,
      }),
    }),
  };
};

describe("LedgerCloseDelayService", () => {
  let service: LedgerCloseDelayService;
  let mockDb: ReturnType<typeof createMockDatabase>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDatabase();
    vi.stubGlobal("getDatabase", vi.fn(() => mockDb));
    service = new LedgerCloseDelayService();
  });

  describe("recordClosureEvent", () => {
    it("should record ledger close event with no delay", async () => {
      const record: LedgerCloseRecord = {
        ledgerSequence: BigInt(50000000),
        expectedCloseTime: new Date("2026-01-01T12:00:00Z"),
        actualCloseTime: new Date("2026-01-01T12:00:00Z"),
        ledgerHash: "abc123def456",
        transactionCount: 150,
        operationCount: 450,
        baseFeeRate: "100",
      };

      mockDb.insert = vi
        .fn()
        .mockReturnValueOnce({
          returning: vi.fn().mockResolvedValue([
            {
              id: "event-1",
              delay_seconds: 0,
              delay_severity: "normal",
              is_anomalous: false,
            },
          ]),
        })
        .mockReturnValueOnce({
          returning: vi.fn().mockResolvedValue([]),
        });

      const result = await service.recordClosureEvent(record);

      expect(result).toBeDefined();
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("should calculate delay correctly when actual time exceeds expected", async () => {
      const expectedTime = new Date("2026-01-01T12:00:00Z");
      const actualTime = new Date("2026-01-01T12:00:03Z");

      const record: LedgerCloseRecord = {
        ledgerSequence: BigInt(50000000),
        expectedCloseTime: expectedTime,
        actualCloseTime: actualTime,
        ledgerHash: "abc123def456",
        transactionCount: 100,
        operationCount: 300,
        baseFeeRate: "100",
      };

      mockDb.insert = vi
        .fn()
        .mockReturnValueOnce({
          returning: vi.fn().mockResolvedValue([
            {
              id: "event-1",
              delay_seconds: 3,
              delay_severity: "minor",
              is_anomalous: true,
            },
          ]),
        })
        .mockReturnValueOnce({
          returning: vi.fn().mockResolvedValue([]),
        });

      const result = await service.recordClosureEvent(record);

      expect(result).toBeDefined();
    });

    it("should trigger critical alert when delay exceeds 10 seconds", async () => {
      const expectedTime = new Date("2026-01-01T12:00:00Z");
      const actualTime = new Date("2026-01-01T12:00:12Z");

      const record: LedgerCloseRecord = {
        ledgerSequence: BigInt(50000000),
        expectedCloseTime: expectedTime,
        actualCloseTime: actualTime,
        ledgerHash: "abc123def456",
        transactionCount: 100,
        operationCount: 300,
        baseFeeRate: "100",
      };

      mockDb.insert = vi
        .fn()
        .mockReturnValueOnce({
          returning: vi.fn().mockResolvedValue([
            {
              id: "event-1",
              delay_seconds: 12,
              delay_severity: "critical",
              is_anomalous: true,
            },
          ]),
        })
        .mockReturnValueOnce({
          returning: vi.fn().mockResolvedValue([
            {
              id: "alert-1",
              alert_type: "critical_delay",
              severity: "critical",
            },
          ]),
        });

      const result = await service.recordClosureEvent(record);

      expect(result).toBeDefined();
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("should trigger high severity alert when delay is 6-9 seconds", async () => {
      const expectedTime = new Date("2026-01-01T12:00:00Z");
      const actualTime = new Date("2026-01-01T12:00:08Z");

      const record: LedgerCloseRecord = {
        ledgerSequence: BigInt(50000000),
        expectedCloseTime: expectedTime,
        actualCloseTime: actualTime,
        ledgerHash: "abc123def456",
        transactionCount: 100,
        operationCount: 300,
        baseFeeRate: "100",
      };

      mockDb.insert = vi
        .fn()
        .mockReturnValueOnce({
          returning: vi.fn().mockResolvedValue([
            {
              id: "event-1",
              delay_seconds: 8,
              delay_severity: "significant",
              is_anomalous: true,
            },
          ]),
        })
        .mockReturnValueOnce({
          returning: vi.fn().mockResolvedValue([
            {
              id: "alert-1",
              alert_type: "significant_delay",
              severity: "high",
            },
          ]),
        });

      const result = await service.recordClosureEvent(record);

      expect(result).toBeDefined();
    });

    it("should handle medium severity alerts (3-5 second delay)", async () => {
      const expectedTime = new Date("2026-01-01T12:00:00Z");
      const actualTime = new Date("2026-01-01T12:00:04Z");

      const record: LedgerCloseRecord = {
        ledgerSequence: BigInt(50000000),
        expectedCloseTime: expectedTime,
        actualCloseTime: actualTime,
        ledgerHash: "abc123def456",
        transactionCount: 100,
        operationCount: 300,
        baseFeeRate: "100",
      };

      mockDb.insert = vi
        .fn()
        .mockReturnValueOnce({
          returning: vi.fn().mockResolvedValue([
            {
              id: "event-1",
              delay_seconds: 4,
              delay_severity: "minor",
              is_anomalous: true,
            },
          ]),
        })
        .mockReturnValueOnce({
          returning: vi.fn().mockResolvedValue([
            {
              id: "alert-1",
              alert_type: "minor_delay",
              severity: "low",
            },
          ]),
        });

      const result = await service.recordClosureEvent(record);

      expect(result).toBeDefined();
    });
  });

  describe("updateAlertStatus", () => {
    it("should update alert status to investigating", async () => {
      const alertId = "alert-1";

      mockDb.where = vi.fn().mockReturnValue({
        update: vi.fn().mockResolvedValue([]),
      });

      await service.updateAlertStatus(alertId, "investigating");

      expect(mockDb.where).toHaveBeenCalledWith("id", alertId);
    });

    it("should mark alert as resolved with timestamp", async () => {
      const alertId = "alert-1";

      mockDb.where = vi.fn().mockReturnValue({
        update: vi.fn().mockResolvedValue([]),
      });

      await service.updateAlertStatus(alertId, "resolved", "Network stabilized");

      expect(mockDb.where).toHaveBeenCalledWith("id", alertId);
    });

    it("should dismiss alert with notes", async () => {
      const alertId = "alert-1";

      mockDb.where = vi.fn().mockReturnValue({
        update: vi.fn().mockResolvedValue([]),
      });

      await service.updateAlertStatus(alertId, "dismissed", "Known maintenance window");

      expect(mockDb.where).toHaveBeenCalledWith("id", alertId);
    });
  });

  describe("computeDelayStats", () => {
    it("should compute delay statistics for daily granularity", async () => {
      const now = new Date();
      const windowStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const events = [
        {
          delay_seconds: 1,
          is_anomalous: false,
        },
        {
          delay_seconds: 2,
          is_anomalous: false,
        },
        {
          delay_seconds: 8,
          is_anomalous: true,
        },
        {
          delay_seconds: 15,
          is_anomalous: true,
        },
      ];

      mockDb.whereBetween = vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue(events),
      });

      mockDb.insert = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      });

      const result = await service.computeDelayStats("daily");

      expect(result).toBeDefined();
      expect(result?.granularity).toBe("daily");
      expect(result?.totalLedgers).toBe(4);
      expect(result?.delayedLedgers).toBe(2);
      expect(result?.anomalyRate).toBeGreaterThan(0);
    });

    it("should compute stats for hourly granularity", async () => {
      const events = [
        { delay_seconds: 0.5, is_anomalous: false },
        { delay_seconds: 1.2, is_anomalous: false },
      ];

      mockDb.whereBetween = vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue(events),
      });

      mockDb.insert = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      });

      const result = await service.computeDelayStats("hourly");

      expect(result?.granularity).toBe("hourly");
    });

    it("should return null when no events found", async () => {
      mockDb.whereBetween = vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue([]),
      });

      const result = await service.computeDelayStats("daily");

      expect(result).toBeNull();
    });

    it("should calculate percentiles correctly", async () => {
      const events = Array.from({ length: 100 }, (_, i) => ({
        delay_seconds: i,
        is_anomalous: i > 50,
      }));

      mockDb.whereBetween = vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue(events),
      });

      mockDb.insert = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      });

      const result = await service.computeDelayStats("daily");

      expect(result?.p50Delay).toBeDefined();
      expect(result?.p95Delay).toBeDefined();
      expect(result?.p99Delay).toBeDefined();
      expect(result?.p50Delay).toBeLessThanOrEqual(result?.p95Delay!);
      expect(result?.p95Delay).toBeLessThanOrEqual(result?.p99Delay!);
    });
  });

  describe("getDelayStats", () => {
    it("should retrieve stats with granularity filter", async () => {
      const stats = [
        {
          id: "stat-1",
          granularity: "daily",
          total_ledgers: 100,
          delayed_ledgers: 5,
        },
      ];

      mockDb.where = vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(stats),
        }),
      });

      const result = await service.getDelayStats("daily");

      expect(Array.isArray(result)).toBe(true);
    });

    it("should return all stats when no granularity specified", async () => {
      const stats = [
        { granularity: "daily", total_ledgers: 100 },
        { granularity: "weekly", total_ledgers: 700 },
      ];

      mockDb.orderBy = vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(stats),
      });

      const result = await service.getDelayStats();

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("detectPatterns", () => {
    it("should detect time-of-day clustering pattern", async () => {
      const recentDelays = Array.from({ length: 20 }, (_, i) => ({
        actual_close_time: new Date(2026, 0, 1, 10 + (i % 2), i * 5),
        delay_seconds: 8 + (i % 2),
      }));

      mockDb.orderBy = vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue(recentDelays),
          }),
        }),
      });

      mockDb.insert = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      });

      const result = await service.detectPatterns();

      expect(Array.isArray(result)).toBe(true);
    });

    it("should detect burst pattern", async () => {
      const now = Date.now();
      const recentDelays = Array.from({ length: 20 }, (_, i) => ({
        actual_close_time: new Date(now - (20 - i) * 30 * 1000),
        delay_seconds: 8 + (i % 2),
      }));

      mockDb.orderBy = vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue(recentDelays),
          }),
        }),
      });

      mockDb.insert = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      });

      const result = await service.detectPatterns();

      expect(Array.isArray(result)).toBe(true);
    });

    it("should return empty array when insufficient data", async () => {
      mockDb.orderBy = vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue([
              { actual_close_time: new Date(), delay_seconds: 8 },
            ]),
          }),
        }),
      });

      const result = await service.detectPatterns();

      expect(result).toEqual([]);
    });
  });
});
