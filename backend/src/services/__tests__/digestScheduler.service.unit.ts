import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockDb = vi.fn();
const mockInsert = vi.fn();
const mockWhere = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockFirst = vi.fn();
const mockReturning = vi.fn();
const mockOrderBy = vi.fn();
const mockLimit = vi.fn();
const mockWhereIn = vi.fn();
const mockWhereBetween = vi.fn();
const mockWhereNotNull = vi.fn();
const mockCount = vi.fn();
const mockRaw = vi.fn();

const mockQueryBuilder = {
  insert: mockInsert,
  where: mockWhere,
  update: mockUpdate,
  delete: mockDelete,
  first: mockFirst,
  returning: mockReturning,
  orderBy: mockOrderBy,
  limit: mockLimit,
  whereIn: mockWhereIn,
  whereBetween: mockWhereBetween,
  whereNotNull: mockWhereNotNull,
  count: mockCount,
  raw: mockRaw,
  andWhere: vi.fn(),
  orWhere: vi.fn(),
};

vi.mock("../../database/connection.js", () => ({
  getDatabase: vi.fn(() => {
    const fn = vi.fn(() => mockQueryBuilder);
    (fn as unknown as { raw: typeof mockRaw }).raw = mockRaw;
    return fn;
  }),
}));

vi.mock("../../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../email.service.js", () => ({
  EmailNotificationService: vi.fn().mockImplementation(() => ({
    sendDigestEmail: vi.fn().mockResolvedValue(undefined),
  })),
}));

import { DigestSchedulerService } from "../digestScheduler.service.js";

describe("DigestSchedulerService", () => {
  let svc: DigestSchedulerService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockReturning.mockReturnThis();
    mockWhere.mockReturnThis();
    mockOrderBy.mockReturnThis();
    mockLimit.mockReturnThis();
    mockWhereIn.mockReturnThis();
    mockWhereBetween.mockReturnThis();
    mockWhereNotNull.mockReturnThis();
    mockCount.mockReturnThis();
    mockInsert.mockReturnThis();
    mockUpdate.mockReturnThis();
    svc = DigestSchedulerService.getInstance();
  });

  describe("createSubscription", () => {
    it("creates a new subscription with default values", async () => {
      mockFirst.mockResolvedValue(null);
      mockInsert.mockResolvedValue([{
        id: "sub-1",
        user_address: "GABC123",
        email: "test@example.com",
        daily_enabled: true,
        weekly_enabled: true,
        timezone: "UTC",
        preferred_hour: 9,
        preferred_day_of_week: 1,
        quiet_hours: JSON.stringify({ start: 22, end: 7 }),
        included_alert_types: JSON.stringify([]),
        included_severities: JSON.stringify(["high", "critical"]),
        include_trends: true,
        include_unresolved: true,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      }]);

      const result = await svc.createSubscription({
        userAddress: "GABC123",
        email: "test@example.com",
      });

      expect(result.userAddress).toBe("GABC123");
      expect(result.email).toBe("test@example.com");
      expect(result.dailyEnabled).toBe(true);
      expect(result.timezone).toBe("UTC");
      expect(result.preferredHour).toBe(9);
    });

    it("throws if subscription already exists", async () => {
      mockFirst.mockResolvedValue({ id: "existing" });

      await expect(
        svc.createSubscription({
          userAddress: "GABC123",
          email: "test@example.com",
        })
      ).rejects.toThrow("Digest subscription already exists");
    });
  });

  describe("getSubscription", () => {
    it("returns subscription when found", async () => {
      mockFirst.mockResolvedValue({
        id: "sub-1",
        user_address: "GABC123",
        email: "test@example.com",
        daily_enabled: true,
        weekly_enabled: false,
        timezone: "America/New_York",
        preferred_hour: 14,
        preferred_day_of_week: 0,
        quiet_hours: JSON.stringify({ start: 22, end: 7 }),
        included_alert_types: JSON.stringify(["price_deviation"]),
        included_severities: JSON.stringify(["critical"]),
        include_trends: false,
        include_unresolved: true,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const result = await svc.getSubscription("GABC123");

      expect(result).not.toBeNull();
      expect(result?.userAddress).toBe("GABC123");
      expect(result?.timezone).toBe("America/New_York");
      expect(result?.preferredHour).toBe(14);
      expect(result?.includedAlertTypes).toEqual(["price_deviation"]);
    });

    it("returns null when not found", async () => {
      mockFirst.mockResolvedValue(null);

      const result = await svc.getSubscription("GNOTEXIST");

      expect(result).toBeNull();
    });
  });

  describe("listActiveSubscriptions", () => {
    it("lists all active subscriptions when no digest type specified", async () => {
      mockWhere.mockResolvedValue([]);

      const result = await svc.listActiveSubscriptions();

      expect(result).toEqual([]);
    });

    it("filters by daily enabled when digestType is daily", async () => {
      mockWhere.mockResolvedValue([]);

      await svc.listActiveSubscriptions("daily");

      expect(mockWhere).toHaveBeenCalledWith({ daily_enabled: true });
    });

    it("filters by weekly enabled when digestType is weekly", async () => {
      mockWhere.mockResolvedValue([]);

      await svc.listActiveSubscriptions("weekly");

      expect(mockWhere).toHaveBeenCalledWith({ weekly_enabled: true });
    });
  });

  describe("deleteSubscription", () => {
    it("deletes subscription for user", async () => {
      mockDelete.mockResolvedValue(1);

      await expect(svc.deleteSubscription("GABC123")).resolves.toBeUndefined();
    });
  });

  describe("calculatePeriod", () => {
    it("returns 1 day period for daily digest", async () => {
      const privateSvc = svc as any;
      const now = new Date();
      const { periodStart, periodEnd } = privateSvc.calculatePeriod("daily");

      const diffMs = periodEnd.getTime() - periodStart.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);

      expect(diffDays).toBeCloseTo(1, 0);
    });

    it("returns 7 day period for weekly digest", async () => {
      const privateSvc = svc as any;
      const { periodStart, periodEnd } = privateSvc.calculatePeriod("weekly");

      const diffMs = periodEnd.getTime() - periodStart.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);

      expect(diffDays).toBeCloseTo(7, 0);
    });
  });

  describe("createSummaryData", () => {
    it("correctly aggregates alert counts", async () => {
      const privateSvc = svc as any;
      const items = [
        { itemType: "alert", severity: "critical", assetCode: "USDC", title: "Test", summary: "Test", metadata: {}, occurredAt: new Date() },
        { itemType: "alert", severity: "high", assetCode: "USDC", title: "Test", summary: "Test", metadata: {}, occurredAt: new Date() },
        { itemType: "alert", severity: "high", assetCode: "XLM", title: "Test", summary: "Test", metadata: {}, occurredAt: new Date() },
        { itemType: "unresolved", severity: "medium", assetCode: "USDC", title: "Test", summary: "Test", metadata: {}, occurredAt: new Date() },
        { itemType: "trend", severity: null, assetCode: null, title: "Trend: TVL", summary: "Test", metadata: { change: 5.2, direction: "up" }, occurredAt: new Date() },
      ];

      const summary = privateSvc.createSummaryData(items);

      expect(summary.totalAlerts).toBe(3);
      expect(summary.criticalAlerts).toBe(1);
      expect(summary.highAlerts).toBe(2);
      expect(summary.unresolvedCount).toBe(1);
      expect(summary.topAssets).toHaveLength(2);
      expect(summary.trends).toHaveLength(1);
    });
  });

  describe("isInQuietHours", () => {
    it("returns false when outside quiet hours (non-spanning midnight)", async () => {
      const privateSvc = svc as any;
      const subscription = {
        timezone: "UTC",
        quietHours: { start: 22, end: 7 },
      };

      vi.spyOn(privateSvc, "getUserHour").mockReturnValue(12);

      expect(privateSvc.isInQuietHours(subscription)).toBe(false);
    });

    it("returns true when inside quiet hours (non-spanning midnight)", async () => {
      const privateSvc = svc as any;
      const subscription = {
        timezone: "UTC",
        quietHours: { start: 22, end: 7 },
      };

      vi.spyOn(privateSvc, "getUserHour").mockReturnValue(23);

      expect(privateSvc.isInQuietHours(subscription)).toBe(true);
    });

    it("returns true when inside quiet hours spanning midnight", async () => {
      const privateSvc = svc as any;
      const subscription = {
        timezone: "UTC",
        quietHours: { start: 22, end: 7 },
      };

      vi.spyOn(privateSvc, "getUserHour").mockReturnValue(3);

      expect(privateSvc.isInQuietHours(subscription)).toBe(true);
    });
  });
});
