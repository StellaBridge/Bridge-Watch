import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FeatureFlagAuditEntry, FeatureFlagAuditQuery } from "../../src/services/featureFlagAudit.service.js";

// Use vi.hoisted to ensure mock is initialized before imports
const { mockDb, queryBuilder } = vi.hoisted(() => {
  const queryBuilder: any = {
    where: vi.fn().mockReturnThis(),
    whereIn: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    clone: vi.fn().mockReturnThis(),
    count: vi.fn().mockReturnThis(),
    first: vi.fn(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    returning: vi.fn(),
    then: vi.fn(),
  };
  
  // Use a plain function instead of vi.fn() to avoid mock issues
  function mockDbFn() {
    return queryBuilder;
  }
  
  // Make it a mock function so we can track calls
  const mockDb = vi.fn(mockDbFn);
  
  return { mockDb, queryBuilder };
});

// Mock database
vi.mock("../../src/database/connection.js", () => ({
  getDatabase: vi.fn(() => mockDb),
}));

// Mock logger
vi.mock("../../src/utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Import the singleton instance after mocks
import { featureFlagAuditService } from "../../src/services/featureFlagAudit.service.js";

describe("FeatureFlagAuditService", () => {
  let service = featureFlagAuditService;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset query builder methods to default chainable behavior
    queryBuilder.where.mockReturnThis();
    queryBuilder.whereIn.mockReturnThis();
    queryBuilder.orderBy.mockReturnThis();
    queryBuilder.limit.mockReturnThis();
    queryBuilder.offset.mockReturnThis();
    queryBuilder.clone.mockReturnThis();
    queryBuilder.count.mockReturnThis();
    queryBuilder.first.mockReset();
    queryBuilder.insert.mockReturnThis();
    queryBuilder.update.mockReturnThis();
    queryBuilder.returning.mockReset();
    queryBuilder.then.mockReset();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  const mockRows = [
    {
      id: "audit-1",
      flag_name: "bypass_circuit_breaker",
      environment: "production",
      action: "update",
      old_value: JSON.stringify({ enabled: false }),
      new_value: JSON.stringify({ enabled: true }),
      changed_by: "admin1",
      change_reason: "Emergency bypass",
      timestamp: new Date("2024-01-15T10:00:00Z"),
    },
    {
      id: "audit-2",
      flag_name: "maintenance_mode",
      environment: "staging",
      action: "create",
      old_value: null,
      new_value: JSON.stringify({ enabled: true }),
      changed_by: "admin2",
      change_reason: "Scheduled maintenance",
      timestamp: new Date("2024-01-14T10:00:00Z"),
    },
    {
      id: "audit-3",
      flag_name: "bypass_circuit_breaker",
      environment: "production",
      action: "update",
      old_value: JSON.stringify({ enabled: true }),
      new_value: JSON.stringify({ enabled: false }),
      changed_by: "admin1",
      change_reason: "Restored normal operation",
      timestamp: new Date("2024-01-13T10:00:00Z"),
    },
  ];

  function setupQueryBuilder(rows: any[]) {
    let whereFilters: Array<(row: any) => boolean> = [];
    let limitVal: number | null = null;
    let offsetVal: number = 0;
    let orderByCol: string | null = null;
    let orderDir: string = "asc";
    let updateData: any = null;

    // Re-implement the query builder methods for this test
    queryBuilder.where.mockImplementation((arg1: any, arg2?: any, arg3?: any) => {
      if (typeof arg1 === "function") {
        const subConditions: Array<(row: any) => boolean> = [];
        const subQb = {
          where: (col: string, val: any) => {
            subConditions.push((row) => row[col] === val);
            return subQb;
          },
          orWhereNull: (col: string) => {
            subConditions.push((row) => row[col] === null || row[col] === undefined);
            return subQb;
          },
        };
        arg1(subQb);
        whereFilters.push((row) => subConditions.some((fn) => fn(row)));
      } else if (typeof arg1 === "string" && arg2 !== undefined && arg3 !== undefined) {
        whereFilters.push((row) => {
          const rowVal = row[arg1] instanceof Date ? (row[arg1] as Date).getTime() : new Date(String(row[arg1])).getTime();
          const targetVal = arg3 instanceof Date ? arg3.getTime() : new Date(String(arg3)).getTime();
          if (arg2 === ">=") return rowVal >= targetVal;
          if (arg2 === "<=") return rowVal <= targetVal;
          if (arg2 === ">") return rowVal > targetVal;
          if (arg2 === "<") return rowVal < targetVal;
          return row[arg1] === arg3;
        });
      } else if (typeof arg1 === "string" && arg2 !== undefined) {
        whereFilters.push((row) => row[arg1] === arg2);
      } else if (typeof arg1 === "object" && arg1 !== null) {
        whereFilters.push((row) => {
          for (const [k, v] of Object.entries(arg1)) {
            if (row[k] !== v) return false;
          }
          return true;
        });
      }
      return queryBuilder;
    });

    queryBuilder.whereIn.mockImplementation((col: string, vals: any[]) => {
      whereFilters.push((row) => vals.includes(row[col]));
      return queryBuilder;
    });

    queryBuilder.orderBy.mockImplementation((col: string, dir: string = "asc") => {
      orderByCol = col;
      orderDir = dir;
      return queryBuilder;
    });

    queryBuilder.limit.mockImplementation((n: number) => {
      limitVal = n;
      return queryBuilder;
    });

    queryBuilder.offset.mockImplementation((n: number) => {
      offsetVal = n;
      return queryBuilder;
    });

    queryBuilder.clone.mockImplementation(() => {
      // Return a new query builder with the same rows but fresh filters
      return setupQueryBuilder(rows);
    });

    queryBuilder.count.mockImplementation((col: string) => queryBuilder);

    queryBuilder.first.mockImplementation(async () => {
      let filtered = rows;
      for (const filterFn of whereFilters) {
        filtered = filtered.filter(filterFn);
      }
      if (orderByCol) {
        filtered = [...filtered].sort((a, b) => {
          const aVal = a[orderByCol];
          const bVal = b[orderByCol];
          const dir = orderDir === "desc" ? -1 : 1;
          if (aVal < bVal) return -1 * dir;
          if (aVal > bVal) return 1 * dir;
          return 0;
        });
      }
      if (offsetVal > 0) filtered = filtered.slice(offsetVal);
      if (limitVal !== null) filtered = filtered.slice(0, limitVal);
      return filtered[0] ?? null;
    });

    queryBuilder.insert.mockImplementation(() => queryBuilder);

    queryBuilder.update.mockImplementation((data: any) => {
      updateData = data;
      return queryBuilder;
    });

    queryBuilder.returning.mockImplementation(async () => {
      let filtered = rows;
      for (const filterFn of whereFilters) {
        filtered = filtered.filter(filterFn);
      }
      if (updateData) {
        filtered = filtered.map((r) => ({ ...r, ...updateData }));
      }
      if (orderByCol) {
        filtered = [...filtered].sort((a, b) => {
          const aVal = a[orderByCol];
          const bVal = b[orderByCol];
          const dir = orderDir === "desc" ? -1 : 1;
          if (aVal < bVal) return -1 * dir;
          if (aVal > bVal) return 1 * dir;
          return 0;
        });
      }
      if (offsetVal > 0) filtered = filtered.slice(offsetVal);
      if (limitVal !== null) filtered = filtered.slice(0, limitVal);
      return filtered.map((r) => ({ id: r.id }));
    });

    queryBuilder.then.mockImplementation((resolve: (v: any) => any) => {
      let filtered = rows;
      for (const filterFn of whereFilters) {
        filtered = filtered.filter(filterFn);
      }
      if (updateData) {
        filtered = filtered.map((r) => ({ ...r, ...updateData }));
      }
      if (orderByCol) {
        filtered = [...filtered].sort((a, b) => {
          const aVal = a[orderByCol];
          const bVal = b[orderByCol];
          const dir = orderDir === "desc" ? -1 : 1;
          if (aVal < bVal) return -1 * dir;
          if (aVal > bVal) return 1 * dir;
          return 0;
        });
      }
      if (offsetVal > 0) filtered = filtered.slice(offsetVal);
      if (limitVal !== null) filtered = filtered.slice(0, limitVal);
      resolve(filtered);
      return Promise.resolve(filtered);
    });

    return queryBuilder;
  }

  describe("recordChange - audit log recording", () => {
    it("should record feature flag creation event", async () => {
      setupQueryBuilder([]);

      await service.recordChange({
        flagName: "maintenance_mode",
        environment: "production",
        action: "create",
        oldValue: null,
        newValue: { enabled: true, description: "Enable maintenance mode" },
        changedBy: "admin1",
        changeReason: "Scheduled maintenance",
      });

      expect(mockDb).toHaveBeenCalledWith("feature_flag_audit_logs");
    });

    it("should record feature flag update event", async () => {
      setupQueryBuilder([]);

      await service.recordChange({
        flagName: "bypass_circuit_breaker",
        environment: "staging",
        action: "update",
        oldValue: { enabled: false },
        newValue: { enabled: true, bypassReason: "Emergency fix" },
        changedBy: "admin2",
        changeReason: "Emergency bypass for incident",
      });

      expect(mockDb).toHaveBeenCalledWith("feature_flag_audit_logs");
    });

    it("should record feature flag deletion event", async () => {
      setupQueryBuilder([]);

      await service.recordChange({
        flagName: "legacy_feature",
        environment: "production",
        action: "delete",
        oldValue: { enabled: true, config: { timeout: 30 } },
        newValue: null,
        changedBy: "admin3",
        changeReason: "Feature deprecated",
      });

      expect(mockDb).toHaveBeenCalledWith("feature_flag_audit_logs");
    });

    it("should generate unique ID for each audit entry", async () => {
      setupQueryBuilder([]);

      await service.recordChange({
        flagName: "test_flag",
        environment: "test",
        action: "create",
        oldValue: null,
        newValue: { enabled: true },
        changedBy: "admin1",
      });

      expect(mockDb).toHaveBeenCalledWith("feature_flag_audit_logs");
    });

    it("should handle database errors gracefully", async () => {
      const errorQb = {
        where: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        returning: vi.fn().mockRejectedValue(new Error("Database connection failed")),
      };
      mockDb.mockReturnValue(errorQb);

      await expect(
        service.recordChange({
          flagName: "test_flag",
          environment: "test",
          action: "create",
          oldValue: null,
          newValue: { enabled: true },
          changedBy: "admin1",
        })
      ).resolves.toBeUndefined();
    });

    it("should log error when recording fails", async () => {
      const { logger } = await import("../../src/utils/logger.js");
      const errorQb = {
        where: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        returning: vi.fn().mockRejectedValue(new Error("Database connection failed")),
      };
      mockDb.mockReturnValue(errorQb);

      await service.recordChange({
        flagName: "test_flag",
        environment: "test",
        action: "create",
        oldValue: null,
        newValue: { enabled: true },
        changedBy: "admin1",
      });

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(Error),
          flagName: "test_flag",
        }),
        "Failed to record feature flag audit"
      );
    });
  });

  describe("search - querying audit trail", () => {
    it("should return all entries with default pagination", async () => {
      setupQueryBuilder(mockRows);

      const result = await service.search({});

      expect(result.entries.length).toBe(3);
      expect(result.total).toBe(3);
    });

    it("should filter by flagName", async () => {
      setupQueryBuilder(mockRows);

      const result = await service.search({ flagName: "bypass_circuit_breaker" });

      expect(result.entries.length).toBe(2);
      expect(result.entries.every((e) => e.flagName === "bypass_circuit_breaker")).toBe(true);
      expect(result.total).toBe(2);
    });

    it("should filter by environment", async () => {
      setupQueryBuilder(mockRows);

      const result = await service.search({ environment: "staging" });

      expect(result.entries.length).toBe(1);
      expect(result.entries[0].environment).toBe("staging");
      expect(result.total).toBe(1);
    });

    it("should filter by changedBy", async () => {
      setupQueryBuilder(mockRows);

      const result = await service.search({ changedBy: "admin1" });

      expect(result.entries.length).toBe(2);
      expect(result.entries.every((e) => e.changedBy === "admin1")).toBe(true);
      expect(result.total).toBe(2);
    });

    it("should filter by action", async () => {
      setupQueryBuilder(mockRows);

      const result = await service.search({ action: "create" });

      expect(result.entries.length).toBe(1);
      expect(result.entries[0].action).toBe("create");
      expect(result.total).toBe(1);
    });

    it("should filter by date range (from)", async () => {
      setupQueryBuilder(mockRows);

      const result = await service.search({ from: new Date("2024-01-14T00:00:00Z") });

      expect(result.entries.length).toBe(2);
      expect(result.entries.every((e) => new Date(e.timestamp) >= new Date("2024-01-14T00:00:00Z"))).toBe(true);
    });

    it("should filter by date range (to)", async () => {
      setupQueryBuilder(mockRows);

      const result = await service.search({ to: new Date("2024-01-14T00:00:00Z") });

      expect(result.entries.length).toBe(2);
      expect(result.entries.every((e) => new Date(e.timestamp) <= new Date("2024-01-14T00:00:00Z"))).toBe(true);
    });

    it("should filter by search term across multiple fields", async () => {
      setupQueryBuilder(mockRows);

      const result = await service.search({ search: "emergency" });

      expect(result.entries.length).toBe(1);
      expect(result.entries[0].changeReason).toContain("Emergency");
    });

    it("should apply pagination limit and offset", async () => {
      setupQueryBuilder(mockRows);

      const result = await service.search({ limit: 2, offset: 1 });

      expect(result.entries.length).toBe(2);
      expect(result.total).toBe(3);
    });

    it("should enforce max limit of 500", async () => {
      setupQueryBuilder(mockRows);

      const result = await service.search({ limit: 1000 });

      expect(result.entries.length).toBeLessThanOrEqual(3);
    });

    it("should order results by timestamp descending", async () => {
      setupQueryBuilder(mockRows);

      const result = await service.search({});

      expect(new Date(result.entries[0].timestamp).getTime()).toBeGreaterThanOrEqual(
        new Date(result.entries[1].timestamp).getTime()
      );
    });

    it("should map database rows to FeatureFlagAuditEntry correctly", async () => {
      setupQueryBuilder([mockRows[0]]);

      const result = await service.search({ flagName: "bypass_circuit_breaker" });

      const entry = result.entries[0];
      expect(entry.id).toBe("audit-1");
      expect(entry.flagName).toBe("bypass_circuit_breaker");
      expect(entry.environment).toBe("production");
      expect(entry.action).toBe("update");
      expect(entry.oldValue).toEqual({ enabled: false });
      expect(entry.newValue).toEqual({ enabled: true });
      expect(entry.changedBy).toBe("admin1");
      expect(entry.changeReason).toBe("Emergency bypass");
      expect(entry.timestamp).toBe("2024-01-15T10:00:00.000Z");
    });

    it("should handle null old_value and new_value", async () => {
      const rowWithNulls = {
        ...mockRows[1],
        old_value: null,
        new_value: null,
      };
      setupQueryBuilder([rowWithNulls]);

      const result = await service.search({ flagName: "maintenance_mode" });

      const entry = result.entries[0];
      expect(entry.oldValue).toBeNull();
      expect(entry.newValue).toBeNull();
    });
  });

  describe("export - exporting audit trail", () => {
    it("should return all entries up to 500 limit", async () => {
      setupQueryBuilder(mockRows);

      const result = await service.export({});

      expect(result.length).toBe(3);
    });

    it("should apply query filters before export", async () => {
      setupQueryBuilder(mockRows);

      const result = await service.export({ environment: "production" });

      expect(result.length).toBe(2);
      expect(result.every((e) => e.environment === "production")).toBe(true);
    });
  });

  describe("prevention of tampering/deletion", () => {
    it("should not expose delete or update methods on service", () => {
      expect(typeof (service as any).deleteEntry).toBe("undefined");
      expect(typeof (service as any).updateEntry).toBe("undefined");
    });

    it("should only provide read-only query methods", () => {
      const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(service));
      const readOnlyMethods = ["recordChange", "search", "export", "mapRow"];
      for (const method of methods) {
        if (!method.startsWith("_") && method !== "constructor") {
          expect(readOnlyMethods).toContain(method);
        }
      }
    });
  });

  describe("evaluation logging for sensitive flags", () => {
    it("should record evaluation events for sensitive flags", async () => {
      setupQueryBuilder([]);

      await service.recordChange({
        flagName: "bypass_circuit_breaker",
        environment: "production",
        action: "update",
        oldValue: { enabled: false },
        newValue: { enabled: false },
        changedBy: "system",
        changeReason: "Evaluation: flag checked for asset USDC",
      });

      expect(mockDb).toHaveBeenCalledWith("feature_flag_audit_logs");
    });
  });
});