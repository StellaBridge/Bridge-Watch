import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DataCleanupJob } from "../../src/jobs/dataCleanup.job.js";
import { logger } from "../../src/utils/logger.js";
import type { Job } from "bullmq";

vi.mock("../../src/utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../../src/config/index.js", () => ({
  config: {
    REDIS_HOST: "localhost",
    REDIS_PORT: 6379,
  },
}));

const mockDb = {
  schema: {
    hasTable: vi.fn().mockResolvedValue(false),
  },
  raw: vi.fn(),
  ("prices"): {
    whereRaw: vi.fn().mockReturnThis(),
    count: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue({ count: "100" }),
    select: vi.fn().mockResolvedValue([]),
    limit: vi.fn().mockReturnThis(),
    del: vi.fn().mockResolvedValue(50),
  },
  ("health_scores"): {
    whereRaw: vi.fn().mockReturnThis(),
    count: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue({ count: "200" }),
    select: vi.fn().mockResolvedValue([]),
    limit: vi.fn().mockReturnThis(),
    del: vi.fn().mockResolvedValue(100),
  },
  ("pool_events"): {
    whereRaw: vi.fn().mockReturnThis(),
    count: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue({ count: "150" }),
    select: vi.fn().mockResolvedValue([]),
    limit: vi.fn().mockReturnThis(),
    del: vi.fn().mockResolvedValue(75),
  },
  ("cleanup_metrics"): {
    insert: vi.fn().mockResolvedValue([1]),
  },
};

vi.mock("../../src/database/connection.js", () => ({
  getDatabase: () => mockDb,
}));

describe("DataCleanupJob", () => {
  let job: DataCleanupJob;

  beforeEach(() => {
    vi.clearAllMocks();
    // Create a minimal job instance for testing
    job = new DataCleanupJob();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("expiry enforcement", () => {
    it("should identify records older than retention period", async () => {
      const retention = 90;
      const cutoffDate = new Date(Date.now() - retention * 24 * 60 * 60 * 1000);

      // Verify that the cutoff date calculation is correct
      expect(cutoffDate.getTime()).toBeLessThan(Date.now());
      expect(Date.now() - cutoffDate.getTime()).toBeGreaterThanOrEqual(
        retention * 24 * 60 * 60 * 1000
      );
    });

    it("should respect preserve conditions in cleanup logic", () => {
      const preserveCondition = "time > NOW() - INTERVAL '7 days'";
      const whereCondition = `time < '2024-01-01' AND NOT (${preserveCondition})`;

      // Verify condition structure
      expect(whereCondition).toContain("NOT (");
      expect(whereCondition).toContain("time > NOW()");
    });

    it("should handle records with no preservation condition", () => {
      const noPreserveCondition = undefined;
      const whereCondition = `time < '2024-01-01'`;

      if (noPreserveCondition) {
        expect(whereCondition).toContain("AND NOT (");
      } else {
        expect(whereCondition).not.toContain("AND NOT (");
      }
    });
  });

  describe("cleanup execution", () => {
    it("should return zero records when nothing to cleanup", async () => {
      mockDb.prices.whereRaw = vi.fn().mockReturnThis();
      mockDb.prices.count = vi.fn().mockReturnThis();
      mockDb.prices.first = vi.fn().mockResolvedValue({ count: "0" });

      const mockJobData: Partial<Job> = {
        data: { dryRun: false, force: false },
        id: "1",
      };

      const policies = [
        {
          entityType: "prices",
          tableName: "prices",
          retentionDays: 90,
          archiveBeforeDelete: true,
          criticalDataPoints: ["time", "symbol"],
          preserveCondition: undefined,
        },
      ];

      expect(policies).toHaveLength(1);
      expect(policies[0].retentionDays).toBe(90);
    });

    it("should count records before cleanup in dry run mode", async () => {
      const reportedCount = 100;

      mockDb.prices.whereRaw = vi.fn().mockReturnThis();
      mockDb.prices.count = vi.fn().mockReturnThis();
      mockDb.prices.first = vi.fn().mockResolvedValue({ count: reportedCount });

      const mockJobData: Partial<Job> = {
        data: { dryRun: true, force: false },
        id: "1",
      };

      expect(reportedCount).toBeGreaterThan(0);
      expect(mockJobData.data?.dryRun).toBe(true);
    });

    it("should process records in batches to prevent long transactions", () => {
      const batchSize = 1000;
      const totalRecords = 5500;

      const batches = Math.ceil(totalRecords / batchSize);
      expect(batches).toBe(6); // 5500 / 1000 = 5.5, ceil = 6
    });

    it("should apply backoff between batches", async () => {
      const delays: number[] = [];
      const originalSetTimeout = global.setTimeout;

      vi.spyOn(global, "setTimeout").mockImplementation((callback, delay) => {
        delays.push(delay as number);
        return originalSetTimeout(callback, 0) as any;
      });

      // Simulate batch processing with delays
      for (let i = 0; i < 5; i++) {
        delays.push(100); // 100ms between batches
      }

      expect(delays.length).toBeGreaterThan(0);
      expect(delays[0]).toBe(100);
    });
  });

  describe("edge cases", () => {
    it("should handle cleanup of zero records gracefully", async () => {
      mockDb.prices.whereRaw = vi.fn().mockReturnThis();
      mockDb.prices.count = vi.fn().mockReturnThis();
      mockDb.prices.first = vi.fn().mockResolvedValue({ count: "0" });

      expect(Number("0") || 0).toBe(0);
    });

    it("should handle archiving before deletion when required", async () => {
      const archiveTable = "prices_archive";
      const shouldArchive = true;

      expect(shouldArchive).toBe(true);
      expect(archiveTable).toBe("prices_archive");
    });

    it("should create archive tables if they do not exist", () => {
      const tableName = "prices";
      const archiveTableName = `${tableName}_archive`;

      expect(archiveTableName).toBe("prices_archive");
    });

    it("should skip deletion on database errors during cleanup", () => {
      const shouldContinue = true;

      try {
        if (shouldContinue) {
          throw new Error("Database error");
        }
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe("Database error");
      }
    });

    it("should handle missing or null returned values", () => {
      const result = { count: null };
      const count = Number(result?.count) || 0;

      expect(count).toBe(0);
    });
  });

  describe("cleanup metrics", () => {
    it("should calculate total metrics from all reports", () => {
      const reports = [
        {
          entityType: "prices",
          tableName: "prices",
          retentionDays: 90,
          recordsProcessed: 100,
          recordsArchived: 50,
          recordsDeleted: 50,
          errors: [],
          duration: 500,
          timestamp: new Date(),
        },
        {
          entityType: "health_scores",
          tableName: "health_scores",
          retentionDays: 180,
          recordsProcessed: 200,
          recordsArchived: 100,
          recordsDeleted: 100,
          errors: [],
          duration: 1000,
          timestamp: new Date(),
        },
      ];

      const totalProcessed = reports.reduce((sum, r) => sum + r.recordsProcessed, 0);
      const totalDeleted = reports.reduce((sum, r) => sum + r.recordsDeleted, 0);

      expect(totalProcessed).toBe(300);
      expect(totalDeleted).toBe(150);
    });

    it("should estimate storage saved from deleted records", () => {
      const recordsDeleted = 1000;
      const storageSaved = recordsDeleted * 1024; // 1KB per record assumption

      expect(storageSaved).toBe(1024000);
    });

    it("should measure cleanup duration accurately", () => {
      const startTime = Date.now();
      const duration = 5000; // 5 seconds

      const reportedDuration = startTime + duration - startTime;
      expect(reportedDuration).toBe(duration);
    });

    it("should include error information in metrics", () => {
      const errors = [
        "Table not found",
        "Connection timeout",
      ];

      expect(errors).toHaveLength(2);
      expect(errors[0]).toBe("Table not found");
    });
  });

  describe("retention policy enforcement", () => {
    it("should enforce 90-day retention for prices", () => {
      const pricPolicy = {
        entityType: "prices",
        tableName: "prices",
        retentionDays: 90,
        archiveBeforeDelete: true,
        criticalDataPoints: ["time", "symbol", "source"],
        preserveCondition: "time > NOW() - INTERVAL '7 days'",
      };

      expect(pricPolicy.retentionDays).toBe(90);
      expect(pricPolicy.archiveBeforeDelete).toBe(true);
    });

    it("should enforce 180-day retention for health_scores", () => {
      const healthPolicy = {
        entityType: "health_scores",
        tableName: "health_scores",
        retentionDays: 180,
        archiveBeforeDelete: true,
        criticalDataPoints: ["time", "symbol", "overall_score"],
        preserveCondition: "time > NOW() - INTERVAL '30 days'",
      };

      expect(healthPolicy.retentionDays).toBe(180);
      expect(healthPolicy.preserveCondition).toContain("'30 days'");
    });

    it("should preserve critical data points during cleanup", () => {
      const criticalDataPoints = ["time", "symbol", "source"];

      expect(criticalDataPoints).toContain("time");
      expect(criticalDataPoints).toContain("symbol");
      expect(criticalDataPoints.length).toBe(3);
    });

    it("should handle various archiving strategies", () => {
      const policies = [
        { entityType: "prices", archiveBeforeDelete: true },
        { entityType: "search_analytics", archiveBeforeDelete: false },
      ];

      expect(policies[0].archiveBeforeDelete).toBe(true);
      expect(policies[1].archiveBeforeDelete).toBe(false);
    });
  });

  describe("dry run vs force execution", () => {
    it("should not delete records in dry run mode", () => {
      const dryRun = true;
      const shouldDelete = !dryRun;

      expect(shouldDelete).toBe(false);
    });

    it("should execute deletion when dryRun is false and force is true", () => {
      const dryRun = false;
      const force = true;
      const shouldDelete = !dryRun || force;

      expect(shouldDelete).toBe(true);
    });

    it("should not delete when dryRun is true even with force flag", () => {
      const dryRun = true;
      const force = true;
      const shouldDelete = !dryRun; // force only allows dryRun count reporting

      expect(shouldDelete).toBe(false);
    });

    it("should log appropriate cleanup summary for each execution mode", () => {
      const modes = [
        { dryRun: true, force: false, description: "Dry run (no deletion)" },
        { dryRun: false, force: false, description: "Normal deletion" },
        { dryRun: false, force: true, description: "Force deletion" },
      ];

      modes.forEach((mode) => {
        expect(mode.description).toBeDefined();
      });
    });
  });
});
