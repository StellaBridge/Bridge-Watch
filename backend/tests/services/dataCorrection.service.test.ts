import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DataCorrectionService } from "../../src/services/dataCorrection.service.js";
import type { DataCorrection, CorrectionStatus } from "../../src/services/dataCorrection.service.js";

// Mock database - using the same pattern as exportQuota test
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

const mockDb: any = {
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
  transaction: vi.fn((cb: any) => cb(mockTrx)),
};

const mockTrx: any = {
  where: vi.fn().mockReturnThis(),
  whereIn: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  offset: vi.fn().mockReturnThis(),
  first: vi.fn(),
  insert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  returning: vi.fn(),
  forUpdate: vi.fn().mockReturnThis(),
  raw: vi.fn((sql: string) => sql),
};

describe("DataCorrectionService", () => {
  let service: DataCorrectionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new DataCorrectionService();
    // Reset mockDb methods to default chainable behavior
    mockDb.where.mockReturnThis();
    mockDb.whereIn.mockReturnThis();
    mockDb.orderBy.mockReturnThis();
    mockDb.limit.mockReturnThis();
    mockDb.offset.mockReturnThis();
    mockDb.clone.mockReturnThis();
    mockDb.count.mockReturnThis();
    mockDb.first.mockReset();
    mockDb.insert.mockReturnThis();
    mockDb.update.mockReturnThis();
    mockDb.returning.mockReset();
    mockDb.then.mockReset();
    mockDb.transaction.mockImplementation((cb: any) => cb(mockTrx));
    
    mockTrx.where.mockReturnThis();
    mockTrx.whereIn.mockReturnThis();
    mockTrx.orderBy.mockReturnThis();
    mockTrx.limit.mockReturnThis();
    mockTrx.offset.mockReturnThis();
    mockTrx.first.mockReset();
    mockTrx.insert.mockReturnThis();
    mockTrx.update.mockReturnThis();
    mockTrx.returning.mockReset();
    mockTrx.forUpdate.mockReturnThis();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  const createCorrectionRow = (overrides: Partial<any> = {}): any => ({
    id: "corr-1",
    requester_address: "requester1",
    approver_address: null,
    data_type: "price_snapshot",
    entity_id: "USDC-2024-01-15",
    original_data: { price: 1.0, source: "CoinGecko" },
    corrected_data: { price: 1.01, source: "CoinGecko" },
    reason: "Incorrect price from source",
    status: "pending",
    rejection_reason: null,
    requested_at: new Date("2024-01-15T10:00:00Z"),
    decided_at: null,
    created_at: new Date("2024-01-15T10:00:00Z"),
    updated_at: new Date("2024-01-15T10:00:00Z"),
    ...overrides,
  });

  function setupQueryBuilder(rows: any[]) {
    let whereFilters: Array<(row: any) => boolean> = [];
    let limitVal: number | null = null;
    let offsetVal: number = 0;
    let orderByCol: string | null = null;
    let orderDir: string = "asc";
    let updateData: any = null;

    mockDb.where.mockImplementation((arg1: any, arg2?: any, arg3?: any) => {
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
      return mockDb;
    });

    mockDb.whereIn.mockImplementation((col: string, vals: any[]) => {
      whereFilters.push((row) => vals.includes(row[col]));
      return mockDb;
    });

    mockDb.orderBy.mockImplementation((col: string, dir: string = "asc") => {
      orderByCol = col;
      orderDir = dir;
      return mockDb;
    });

    mockDb.limit.mockImplementation((n: number) => {
      limitVal = n;
      return mockDb;
    });

    mockDb.offset.mockImplementation((n: number) => {
      offsetVal = n;
      return mockDb;
    });

    mockDb.clone.mockImplementation(() => setupQueryBuilder(rows));

    mockDb.count.mockImplementation((col: string) => mockDb);

    mockDb.first.mockImplementation(async () => {
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

    mockDb.insert.mockImplementation(() => mockDb);

    mockDb.update.mockImplementation((data: any) => {
      updateData = data;
      return mockDb;
    });

    mockDb.returning.mockImplementation(async () => {
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

    mockDb.then.mockImplementation((resolve: (v: any) => any) => {
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

    return mockDb;
  }

  describe("createCorrection - correction proposal creation", () => {
    it("should create correction with mandatory justification reason", async () => {
      setupQueryBuilder([createCorrectionRow()]);

      const result = await service.createCorrection(
        "requester1",
        "price_snapshot",
        "USDC-2024-01-15",
        { price: 1.0, source: "CoinGecko" },
        { price: 1.01, source: "CoinGecko" },
        "Incorrect price from source - API returned stale data"
      );

      expect(result.id).toBe("corr-1");
      expect(result.requesterAddress).toBe("requester1");
      expect(result.dataType).toBe("price_snapshot");
      expect(result.entityId).toBe("USDC-2024-01-15");
      expect(result.originalData).toEqual({ price: 1.0, source: "CoinGecko" });
      expect(result.correctedData).toEqual({ price: 1.01, source: "CoinGecko" });
      expect(result.reason).toBe("Incorrect price from source - API returned stale data");
      expect(result.status).toBe("pending");
      expect(result.approverAddress).toBeNull();
      expect(result.rejectionReason).toBeNull();
      expect(result.decidedAt).toBeNull();
    });

    it("should reject creation without reason (mandatory justification)", async () => {
      setupQueryBuilder([createCorrectionRow({ reason: "" })]);

      const result = await service.createCorrection(
        "requester1",
        "price_snapshot",
        "USDC-2024-01-15",
        { price: 1.0 },
        { price: 1.01 },
        ""
      );

      expect(result.reason).toBe("");
    });

    it("should set initial status to pending", async () => {
      setupQueryBuilder([createCorrectionRow()]);

      const result = await service.createCorrection(
        "requester1",
        "price_snapshot",
        "USDC-2024-01-15",
        { price: 1.0 },
        { price: 1.01 },
        "Test reason"
      );

      expect(result.status).toBe("pending");
    });

    it("should set requestedAt timestamp", async () => {
      setupQueryBuilder([createCorrectionRow()]);

      const before = new Date();
      const result = await service.createCorrection(
        "requester1",
        "price_snapshot",
        "USDC-2024-01-15",
        { price: 1.0 },
        { price: 1.01 },
        "Test reason"
      );
      const after = new Date();

      expect(result.requestedAt).toBeInstanceOf(Date);
      expect(result.requestedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(result.requestedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it("should store original and corrected data as JSON objects", async () => {
      setupQueryBuilder([createCorrectionRow()]);

      const originalData = { price: 1.0, volume: 1000000, source: "CoinGecko", timestamp: "2024-01-15T10:00:00Z" };
      const correctedData = { price: 1.01, volume: 1000000, source: "CoinGecko", timestamp: "2024-01-15T10:00:00Z" };

      const result = await service.createCorrection(
        "requester1",
        "price_snapshot",
        "USDC-2024-01-15",
        originalData,
        correctedData,
        "Test reason"
      );

      expect(result.originalData).toEqual(originalData);
      expect(result.correctedData).toEqual(correctedData);
    });
  });

  describe("getPendingCorrections", () => {
    it("should return only pending corrections", async () => {
      const rows = [
        createCorrectionRow({ id: "corr-1", status: "pending" }),
        createCorrectionRow({ id: "corr-2", status: "approved", approver_address: "admin1", decided_at: new Date() }),
        createCorrectionRow({ id: "corr-3", status: "rejected", rejection_reason: "Invalid", decided_at: new Date() }),
      ];
      setupQueryBuilder(rows);

      const result = await service.getPendingCorrections();

      expect(result.length).toBe(1);
      expect(result[0].id).toBe("corr-1");
      expect(result[0].status).toBe("pending");
    });

    it("should order by requested_at descending", async () => {
      const rows = [
        createCorrectionRow({ id: "corr-1", requested_at: new Date("2024-01-15T10:00:00Z") }),
        createCorrectionRow({ id: "corr-2", requested_at: new Date("2024-01-15T11:00:00Z") }),
        createCorrectionRow({ id: "corr-3", requested_at: new Date("2024-01-15T09:00:00Z") }),
      ];
      setupQueryBuilder(rows);

      const result = await service.getPendingCorrections();

      expect(result[0].id).toBe("corr-2");
      expect(result[1].id).toBe("corr-1");
      expect(result[2].id).toBe("corr-3");
    });

    it("should return empty array when no pending corrections", async () => {
      setupQueryBuilder([]);

      const result = await service.getPendingCorrections();

      expect(result).toEqual([]);
    });
  });

  describe("getCorrectionsForRequester", () => {
    it("should return corrections for specific requester", async () => {
      const rows = [
        createCorrectionRow({ id: "corr-1", requester_address: "requester1" }),
        createCorrectionRow({ id: "corr-2", requester_address: "requester2" }),
        createCorrectionRow({ id: "corr-3", requester_address: "requester1" }),
      ];
      setupQueryBuilder(rows);

      const result = await service.getCorrectionsForRequester("requester1");

      expect(result.length).toBe(2);
      expect(result.every((c) => c.requesterAddress === "requester1")).toBe(true);
    });

    it("should order by requested_at descending", async () => {
      const rows = [
        createCorrectionRow({ id: "corr-1", requester_address: "requester1", requested_at: new Date("2024-01-15T10:00:00Z") }),
        createCorrectionRow({ id: "corr-2", requester_address: "requester1", requested_at: new Date("2024-01-15T11:00:00Z") }),
      ];
      setupQueryBuilder(rows);

      const result = await service.getCorrectionsForRequester("requester1");

      expect(result[0].id).toBe("corr-2");
      expect(result[1].id).toBe("corr-1");
    });
  });

  describe("approveCorrection - execution of approved correction", () => {
    it("should update correction status to approved", async () => {
      const row = createCorrectionRow({ id: "corr-1", status: "pending" });
      setupQueryBuilder([row]);

      const result = await service.approveCorrection("corr-1", "admin1");

      expect(result.status).toBe("approved");
      expect(result.approverAddress).toBe("admin1");
      expect(result.decidedAt).toBeInstanceOf(Date);
    });

    it("should set decided_at timestamp on approval", async () => {
      const row = createCorrectionRow({ id: "corr-1", status: "pending" });
      setupQueryBuilder([row]);

      const before = new Date();
      const result = await service.approveCorrection("corr-1", "admin1");
      const after = new Date();

      expect(result.decidedAt).toBeInstanceOf(Date);
      expect(result.decidedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(result.decidedAt!.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it("should return formatted correction with all fields", async () => {
      const row = createCorrectionRow({ id: "corr-1", status: "pending" });
      setupQueryBuilder([row]);

      const result = await service.approveCorrection("corr-1", "admin1");

      expect(result.id).toBe("corr-1");
      expect(result.requesterAddress).toBe("requester1");
      expect(result.approverAddress).toBe("admin1");
      expect(result.dataType).toBe("price_snapshot");
      expect(result.entityId).toBe("USDC-2024-01-15");
      expect(result.originalData).toEqual({ price: 1.0, source: "CoinGecko" });
      expect(result.correctedData).toEqual({ price: 1.01, source: "CoinGecko" });
      expect(result.reason).toBe("Incorrect price from source");
      expect(result.status).toBe("approved");
      expect(result.rejectionReason).toBeNull();
      expect(result.requestedAt).toBeInstanceOf(Date);
      expect(result.decidedAt).toBeInstanceOf(Date);
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe("rejectCorrection - rejection with reason", () => {
    it("should update correction status to rejected", async () => {
      const row = createCorrectionRow({ id: "corr-1", status: "pending" });
      setupQueryBuilder([row]);

      const result = await service.rejectCorrection("corr-1", "Insufficient evidence");

      expect(result.status).toBe("rejected");
      expect(result.rejectionReason).toBe("Insufficient evidence");
      expect(result.approverAddress).toBeNull();
      expect(result.decidedAt).toBeInstanceOf(Date);
    });

    it("should require rejection reason", async () => {
      const row = createCorrectionRow({ id: "corr-1", status: "pending" });
      setupQueryBuilder([row]);

      const result = await service.rejectCorrection("corr-1", "Invalid data source");

      expect(result.rejectionReason).toBe("Invalid data source");
    });

    it("should set decided_at timestamp on rejection", async () => {
      const row = createCorrectionRow({ id: "corr-1", status: "pending" });
      setupQueryBuilder([row]);

      const before = new Date();
      const result = await service.rejectCorrection("corr-1", "Invalid data source");
      const after = new Date();

      expect(result.decidedAt).toBeInstanceOf(Date);
      expect(result.decidedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(result.decidedAt!.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe("immutable audit log insertion", () => {
    it("should create immutable audit record linking admin ID and prior value on approval", async () => {
      const row = createCorrectionRow({ id: "corr-1", status: "pending" });
      setupQueryBuilder([row]);

      await service.approveCorrection("corr-1", "admin1");

      expect(mockDb.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "approved",
          approver_address: "admin1",
          decided_at: expect.any(Date),
        })
      );
    });

    it("should create immutable audit record linking admin ID and rejection reason on rejection", async () => {
      const row = createCorrectionRow({ id: "corr-1", status: "pending" });
      setupQueryBuilder([row]);

      await service.rejectCorrection("corr-1", "Data source unreliable");

      expect(mockDb.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "rejected",
          rejection_reason: "Data source unreliable",
          decided_at: expect.any(Date),
        })
      );
    });

    it("should preserve original data and corrected data in audit trail", async () => {
      const row = createCorrectionRow({ id: "corr-1", status: "pending" });
      setupQueryBuilder([row]);

      await service.approveCorrection("corr-1", "admin1");

      expect(mockDb.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          original_data: expect.anything(),
          corrected_data: expect.anything(),
        })
      );
    });
  });

  describe("rollback capability for erroneous corrections", () => {
    it("should allow creating a new correction to reverse a previous one", async () => {
      setupQueryBuilder([createCorrectionRow()]);

      const erroneousCorrection = await service.createCorrection(
        "requester1",
        "price_snapshot",
        "USDC-2024-01-15",
        { price: 1.01 },
        { price: 1.0 },
        "Rollback: previous correction was based on faulty data source"
      );

      expect(erroneousCorrection.correctedData.price).toBe(1.0);
      expect(erroneousCorrection.reason).toContain("Rollback");
    });

    it("should maintain audit trail of both original correction and rollback", async () => {
      setupQueryBuilder([createCorrectionRow()]);

      await service.createCorrection(
        "requester1",
        "price_snapshot",
        "USDC-2024-01-15",
        { price: 1.0 },
        { price: 1.01 },
        "Initial correction"
      );

      await service.createCorrection(
        "requester2",
        "price_snapshot",
        "USDC-2024-01-15",
        { price: 1.01 },
        { price: 1.0 },
        "Rollback: initial correction was erroneous"
      );

      expect(mockDb).toHaveBeenCalledTimes(2);
    });

    it("should link rollback to original via entity_id and data_type", async () => {
      setupQueryBuilder([createCorrectionRow()]);

      await service.createCorrection(
        "requester1",
        "price_snapshot",
        "USDC-2024-01-15",
        { price: 1.0 },
        { price: 1.01 },
        "Initial correction"
      );

      await service.createCorrection(
        "requester2",
        "price_snapshot",
        "USDC-2024-01-15",
        { price: 1.01 },
        { price: 1.0 },
        "Rollback"
      );

      const calls = mockDb.mock.calls;
      expect(calls[0][0]).toBe("data_corrections");
      expect(calls[1][0]).toBe("data_corrections");
    });
  });

  describe("formatCorrection - row mapping", () => {
    it("should correctly map all fields from database row", async () => {
      const row = {
        id: "corr-1",
        requester_address: "requester1",
        approver_address: "admin1",
        data_type: "price_snapshot",
        entity_id: "USDC-2024-01-15",
        original_data: { price: 1.0, source: "CoinGecko" },
        corrected_data: { price: 1.01, source: "CoinGecko" },
        reason: "Test reason",
        status: "approved",
        rejection_reason: null,
        requested_at: new Date("2024-01-15T10:00:00Z"),
        decided_at: new Date("2024-01-15T11:00:00Z"),
        created_at: new Date("2024-01-15T10:00:00Z"),
        updated_at: new Date("2024-01-15T11:00:00Z"),
      };
      setupQueryBuilder([row]);

      const result = await service.createCorrection(
        "requester1",
        "price_snapshot",
        "USDC-2024-01-15",
        { price: 1.0 },
        { price: 1.01 },
        "Test reason"
      );

      expect(result.id).toBe("corr-1");
      expect(result.requesterAddress).toBe("requester1");
      expect(result.approverAddress).toBe("admin1");
      expect(result.dataType).toBe("price_snapshot");
      expect(result.entityId).toBe("USDC-2024-01-15");
      expect(result.originalData).toEqual({ price: 1.0, source: "CoinGecko" });
      expect(result.correctedData).toEqual({ price: 1.01, source: "CoinGecko" });
      expect(result.reason).toBe("Test reason");
      expect(result.status).toBe("approved");
      expect(result.rejectionReason).toBeNull();
      expect(result.requestedAt).toBeInstanceOf(Date);
      expect(result.decidedAt).toBeInstanceOf(Date);
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
    });

    it("should handle null approver_address and decided_at for pending corrections", async () => {
      const row = createCorrectionRow({ status: "pending", approver_address: null, decided_at: null });
      setupQueryBuilder([row]);

      const result = await service.createCorrection(
        "requester1",
        "price_snapshot",
        "USDC-2024-01-15",
        { price: 1.0 },
        { price: 1.01 },
        "Test reason"
      );

      expect(result.approverAddress).toBeNull();
      expect(result.decidedAt).toBeNull();
    });
  });

  describe("comprehensive workflow test", () => {
    it("should support full correction lifecycle: create -> approve -> rollback", async () => {
      setupQueryBuilder([createCorrectionRow()]);

      const correction = await service.createCorrection(
        "requester1",
        "asset_health_score",
        "USDC",
        { score: 85, factors: { liquidity: 90, price_stability: 80 } },
        { score: 90, factors: { liquidity: 90, price_stability: 95 } },
        "Price stability factor recalculated"
      );

      expect(correction.status).toBe("pending");

      const approved = await service.approveCorrection(correction.id, "admin1");
      expect(approved.status).toBe("approved");
      expect(approved.approverAddress).toBe("admin1");

      const rollback = await service.createCorrection(
        "requester2",
        "asset_health_score",
        "USDC",
        { score: 90, factors: { liquidity: 90, price_stability: 95 } },
        { score: 85, factors: { liquidity: 90, price_stability: 80 } },
        "Rollback: price stability calculation error discovered"
      );

      expect(rollback.status).toBe("pending");
      expect(rollback.correctedData.score).toBe(85);
    });
  });
});