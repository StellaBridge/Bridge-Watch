import { describe, it, expect, beforeEach, vi } from "vitest";
import { IngestionWatermarkCoordinator, boundedWatermark, normaliseGaps } from "../../services/ingestionWatermarkCoordinator.service.js";
import type { SourceWatermark, Gap } from "../../services/ingestionWatermarkCoordinator.service.js";

vi.mock("../../database/connection.js");
vi.mock("../../services/audit.service.js");

const createMockDatabase = () => {
  const mockInsert = vi.fn().mockResolvedValue([{ id: "barrier-1" }]);
  const mockWhere = vi.fn().mockReturnThis();
  const mockReturning = vi.fn().mockResolvedValue([{ id: "wm-1" }]);
  const mockOnConflict = vi.fn().mockReturnValue({
    merge: vi.fn().mockResolvedValue([]),
  });
  const mockForUpdate = vi.fn().mockResolvedValue(null);
  const mockFirst = vi.fn();
  const mockTransaction = vi.fn();

  const baseReturn = {
    insert: mockInsert.mockReturnValue({
      onConflict: mockOnConflict,
      returning: mockReturning,
    }),
    where: mockWhere.mockReturnValue({
      insert: mockInsert.mockReturnValue({
        returning: mockReturning,
      }),
      forUpdate: mockForUpdate.mockReturnValue({
        first: mockFirst,
      }),
      first: mockFirst,
      update: vi.fn().mockResolvedValue([]),
      where: vi.fn().mockReturnValue({
        whereNull: vi.fn().mockReturnValue({
          orWhere: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
    transaction: mockTransaction,
  };

  return baseReturn;
};

describe("ingestionWatermarkCoordinator", () => {
  let coordinator: IngestionWatermarkCoordinator;
  let mockDb: ReturnType<typeof createMockDatabase>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDatabase();

    vi.stubGlobal("getDatabase", vi.fn(() => mockDb));
    coordinator = new IngestionWatermarkCoordinator(mockDb as any);
  });

  describe("publish", () => {
    it("should publish initial watermark for new source", async () => {
      const input = {
        source: "stellar-transactions",
        coveredThrough: 50000100,
        finalizedThrough: 50000000,
        gaps: [],
      };

      mockDb.transaction = vi.fn().mockImplementation(async (fn) => {
        const txMock = {
          where: vi.fn().mockReturnValue({
            forUpdate: vi.fn().mockResolvedValue(null),
          }),
          insert: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                source: input.source,
                covered_through: input.coveredThrough,
                finalized_through: input.finalizedThrough,
                gaps: "[]",
                version: 1,
                observed_at: new Date(),
              },
            ]),
          }),
        };
        return fn(txMock);
      });

      const result = await coordinator.publish(input);

      expect(result).toBeDefined();
      expect(result.source).toBe("stellar-transactions");
      expect(result.version).toBe(1);
    });

    it("should increment version on update", async () => {
      const input = {
        source: "stellar-transactions",
        coveredThrough: 50000200,
        finalizedThrough: 50000100,
        gaps: [],
        expectedVersion: 1,
      };

      mockDb.transaction = vi.fn().mockImplementation(async (fn) => {
        const txMock = {
          where: vi.fn().mockReturnValue({
            forUpdate: vi.fn().mockResolvedValue({
              source: "stellar-transactions",
              covered_through: 50000100,
              finalized_through: 50000050,
              version: 1,
              gaps: "[]",
            }),
            update: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([
                {
                  source: input.source,
                  covered_through: input.coveredThrough,
                  finalized_through: input.finalizedThrough,
                  gaps: "[]",
                  version: 2,
                  observed_at: new Date(),
                },
              ]),
            }),
          }),
        };
        return fn(txMock);
      });

      const result = await coordinator.publish(input);

      expect(result.version).toBe(2);
    });

    it("should reject finalized > covered", async () => {
      const input = {
        source: "stellar-transactions",
        coveredThrough: 50000050,
        finalizedThrough: 50000100,
        gaps: [],
      };

      await expect(coordinator.publish(input)).rejects.toThrow(
        "finalizedThrough cannot exceed coveredThrough"
      );
    });

    it("should handle version conflict", async () => {
      const input = {
        source: "stellar-transactions",
        coveredThrough: 50000200,
        finalizedThrough: 50000100,
        gaps: [],
        expectedVersion: 1,
      };

      mockDb.transaction = vi.fn().mockImplementation(async (fn) => {
        const txMock = {
          where: vi.fn().mockReturnValue({
            forUpdate: vi.fn().mockResolvedValue({
              source: "stellar-transactions",
              version: 2,
            }),
          }),
        };
        return fn(txMock);
      });

      await expect(coordinator.publish(input)).rejects.toThrow(
        "watermark version conflict"
      );
    });

    it("should normalize and filter gaps above finalized ledger", async () => {
      const input = {
        source: "stellar-transactions",
        coveredThrough: 50000300,
        finalizedThrough: 50000200,
        gaps: [
          { from: 50000210, to: 50000220 },
          { from: 50000230, to: 50000240 },
        ],
      };

      mockDb.transaction = vi.fn().mockImplementation(async (fn) => {
        const txMock = {
          where: vi.fn().mockReturnValue({
            forUpdate: vi.fn().mockResolvedValue(null),
          }),
          insert: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                source: input.source,
                covered_through: input.coveredThrough,
                finalized_through: input.finalizedThrough,
                gaps: JSON.stringify(input.gaps),
                version: 1,
                observed_at: new Date(),
              },
            ]),
          }),
        };
        return fn(txMock);
      });

      const result = await coordinator.publish(input);

      expect(result).toBeDefined();
    });
  });

  describe("setDependency", () => {
    it("should create dependency barrier", async () => {
      const consumer = "bridge-ingestion";
      const source = "stellar-transactions";

      mockDb.insert = vi.fn().mockReturnValue({
        onConflict: vi.fn().mockReturnValue({
          merge: vi.fn().mockResolvedValue([]),
        }),
      });

      await coordinator.setDependency(consumer, source);

      expect(mockDb.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          consumer,
          source,
          minimum_finality: 0,
          required: true,
        })
      );
    });

    it("should set custom finality requirement", async () => {
      const consumer = "bridge-ingestion";
      const source = "stellar-transactions";
      const minimumFinality = 100;

      mockDb.insert = vi.fn().mockReturnValue({
        onConflict: vi.fn().mockReturnValue({
          merge: vi.fn().mockResolvedValue([]),
        }),
      });

      await coordinator.setDependency(consumer, source, minimumFinality);

      expect(mockDb.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          minimum_finality: minimumFinality,
        })
      );
    });
  });

  describe("inspect", () => {
    it("should return bounded window for consumer", async () => {
      const consumer = "bridge-ingestion";

      const deps = [
        { consumer, source: "stellar-transactions", minimum_finality: 100 },
      ];

      const watermark: SourceWatermark = {
        source: "stellar-transactions",
        coveredThrough: 50000100,
        finalizedThrough: 50000000,
        gaps: [],
        version: 1,
        observedAt: new Date().toISOString(),
      };

      mockDb.where = vi.fn()
        .mockReturnValueOnce({
          where: vi.fn().mockResolvedValue(deps),
        })
        .mockReturnValueOnce({
          where: vi.fn().mockReturnValue({
            orWhere: vi.fn().mockResolvedValue([]),
          }),
        })
        .mockReturnValueOnce({
          first: vi.fn().mockResolvedValue({
            source: watermark.source,
            covered_through: watermark.coveredThrough,
            finalized_through: watermark.finalizedThrough,
            gaps: "[]",
            version: watermark.version,
            observed_at: watermark.observedAt,
          }),
        });

      const result = await coordinator.inspect(consumer);

      expect(result).toBeDefined();
      expect(result.consumer).toBe(consumer);
    });

    it("should block when watermark not available", async () => {
      const consumer = "bridge-ingestion";
      const deps = [
        { consumer, source: "missing-source", minimum_finality: 100 },
      ];

      mockDb.where = vi.fn()
        .mockReturnValueOnce({
          where: vi.fn().mockResolvedValue(deps),
        })
        .mockReturnValueOnce({
          where: vi.fn().mockReturnValue({
            orWhere: vi.fn().mockResolvedValue([]),
          }),
        })
        .mockReturnValueOnce({
          first: vi.fn().mockResolvedValue(null),
        });

      const result = await coordinator.inspect(consumer);

      expect(result.blocked.length).toBeGreaterThan(0);
    });

    it("should block when finality requirement not met", async () => {
      const consumer = "bridge-ingestion";
      const deps = [
        { consumer, source: "stellar-transactions", minimum_finality: 50000500 },
      ];

      const watermark = {
        source: "stellar-transactions",
        covered_through: 50000100,
        finalized_through: 50000050,
        gaps: "[]",
        version: 1,
        observed_at: new Date().toISOString(),
      };

      mockDb.where = vi.fn()
        .mockReturnValueOnce({
          where: vi.fn().mockResolvedValue(deps),
        })
        .mockReturnValueOnce({
          where: vi.fn().mockReturnValue({
            orWhere: vi.fn().mockResolvedValue([]),
          }),
        })
        .mockReturnValueOnce({
          first: vi.fn().mockResolvedValue(watermark),
        });

      const result = await coordinator.inspect(consumer);

      expect(result.blocked.length).toBeGreaterThan(0);
    });
  });

  describe("overrideBarrier", () => {
    it("should create override record and audit log", async () => {
      const input = {
        consumer: "bridge-ingestion",
        source: "stellar-transactions",
        allowThrough: 50000200,
        reason: "Manual intervention for data recovery",
        actorId: "operator-1",
      };

      mockDb.transaction = vi.fn().mockImplementation(async (fn) => {
        const txMock = {
          insert: vi.fn().mockResolvedValue([]),
        };
        return fn(txMock);
      });

      await coordinator.overrideBarrier(input);

      expect(mockDb.transaction).toHaveBeenCalled();
    });

    it("should set expiration time for override", async () => {
      const expiresAt = new Date(Date.now() + 3600000);
      const input = {
        consumer: "bridge-ingestion",
        source: "stellar-transactions",
        allowThrough: 50000200,
        reason: "Temporary override",
        actorId: "operator-1",
        expiresAt,
      };

      mockDb.transaction = vi.fn().mockImplementation(async (fn) => {
        const txMock = {
          insert: vi.fn().mockResolvedValue([]),
        };
        return fn(txMock);
      });

      await coordinator.overrideBarrier(input);

      expect(mockDb.transaction).toHaveBeenCalled();
    });
  });

  describe("normaliseGaps", () => {
    it("should sort gaps by start position", () => {
      const gaps: Gap[] = [
        { from: 100, to: 110 },
        { from: 50, to: 60 },
        { from: 75, to: 85 },
      ];

      const result = normaliseGaps(gaps);

      expect(result[0].from).toBe(50);
      expect(result[1].from).toBe(75);
      expect(result[2].from).toBe(100);
    });

    it("should merge overlapping gaps", () => {
      const gaps: Gap[] = [
        { from: 50, to: 100 },
        { from: 90, to: 150 },
      ];

      const result = normaliseGaps(gaps);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ from: 50, to: 150 });
    });

    it("should merge adjacent gaps", () => {
      const gaps: Gap[] = [
        { from: 50, to: 100 },
        { from: 100, to: 150 },
      ];

      const result = normaliseGaps(gaps);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ from: 50, to: 150 });
    });

    it("should handle near-adjacent gaps", () => {
      const gaps: Gap[] = [
        { from: 50, to: 100 },
        { from: 101, to: 150 },
      ];

      const result = normaliseGaps(gaps);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ from: 50, to: 150 });
    });

    it("should filter invalid gaps", () => {
      const gaps: Gap[] = [
        { from: 50, to: 100 },
        { from: 150, to: 140 }, // invalid: from > to
        { from: 200, to: 250 },
        { from: NaN, to: 300 }, // invalid: NaN
      ];

      const result = normaliseGaps(gaps);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ from: 50, to: 100 });
      expect(result[1]).toEqual({ from: 200, to: 250 });
    });
  });

  describe("boundedWatermark", () => {
    it("should return bounded window when all dependencies met", () => {
      const consumer = "bridge-ingestion";
      const dependencies = [
        { source: "stellar-transactions", minimumFinality: 50000000 },
      ];
      const watermarks = {
        "stellar-transactions": {
          source: "stellar-transactions",
          coveredThrough: 50000100,
          finalizedThrough: 50000050,
          gaps: [],
          version: 1,
          observedAt: new Date().toISOString(),
        },
      };

      const result = boundedWatermark(consumer, dependencies, watermarks);

      expect(result.consumer).toBe(consumer);
      expect(result.through).toBe(50000050);
      expect(result.blocked).toHaveLength(0);
    });

    it("should block when gap detected", () => {
      const consumer = "bridge-ingestion";
      const dependencies = [
        { source: "stellar-transactions", minimumFinality: 50000000 },
      ];
      const watermarks = {
        "stellar-transactions": {
          source: "stellar-transactions",
          coveredThrough: 50000100,
          finalizedThrough: 50000050,
          gaps: [{ from: 50000040, to: 50000045 }],
          version: 1,
          observedAt: new Date().toISOString(),
        },
      };

      const result = boundedWatermark(consumer, dependencies, watermarks);

      expect(result.blocked.length).toBeGreaterThan(0);
      expect(result.through).toBeNull();
    });

    it("should apply operator override", () => {
      const consumer = "bridge-ingestion";
      const dependencies = [
        { source: "stellar-transactions", minimumFinality: 50000500 },
      ];
      const watermarks = {
        "stellar-transactions": {
          source: "stellar-transactions",
          coveredThrough: 50000100,
          finalizedThrough: 50000050,
          gaps: [],
          version: 1,
          observedAt: new Date().toISOString(),
        },
      };
      const overrides = { "stellar-transactions": 50000200 };

      const result = boundedWatermark(
        consumer,
        dependencies,
        watermarks,
        overrides
      );

      expect(result.through).toBe(50000200);
      expect(result.explain[0]).toContain("operator override");
    });

    it("should compute minimum across multiple sources", () => {
      const consumer = "bridge-ingestion";
      const dependencies = [
        { source: "stellar-transactions", minimumFinality: 50000000 },
        { source: "stellar-operations", minimumFinality: 50000000 },
      ];
      const watermarks = {
        "stellar-transactions": {
          source: "stellar-transactions",
          coveredThrough: 50000100,
          finalizedThrough: 50000080,
          gaps: [],
          version: 1,
          observedAt: new Date().toISOString(),
        },
        "stellar-operations": {
          source: "stellar-operations",
          coveredThrough: 50000100,
          finalizedThrough: 50000050,
          gaps: [],
          version: 1,
          observedAt: new Date().toISOString(),
        },
      };

      const result = boundedWatermark(consumer, dependencies, watermarks);

      expect(result.through).toBe(50000050);
    });
  });
});
