import { beforeEach, describe, expect, it, vi } from "vitest";
import { BackfillService } from "../../src/services/backfill.service.js";

var mockSet;
var mockGet;
var mockSadd;
var mockSmembers;
var mockRpush;
var mockLrange;
var mockAddJob;
var mockBackfillAssetTransactions;
var mockAuditLog;

vi.mock("../../src/utils/redis.js", () => {
  mockSet = vi.fn().mockResolvedValue("OK");
  mockGet = vi.fn();
  mockSadd = vi.fn().mockResolvedValue(1);
  mockSmembers = vi.fn().mockResolvedValue([]);
  mockRpush = vi.fn().mockResolvedValue(1);
  mockLrange = vi.fn().mockResolvedValue([]);

  return {
    redis: {
      set: mockSet,
      get: mockGet,
      sadd: mockSadd,
      smembers: mockSmembers,
      rpush: mockRpush,
      lrange: mockLrange,
    },
  };
});

vi.mock("../../src/jobs/backfill.queue.js", () => {
  mockAddJob = vi.fn().mockResolvedValue({ id: "job-1" });
  return {
    getBackfillQueue: vi.fn(() => ({
      addJob: mockAddJob,
    })),
  };
});

vi.mock("../../src/services/transaction.service.js", () => {
  mockBackfillAssetTransactions = vi.fn();
  return {
    TransactionService: vi.fn().mockImplementation(() => ({
      backfillAssetTransactions: mockBackfillAssetTransactions,
    })),
  };
});

vi.mock("../../src/services/audit.service.js", () => {
  mockAuditLog = vi.fn().mockResolvedValue({});
  return {
    AuditService: {
      getInstance: vi.fn(() => ({ log: mockAuditLog })),
    },
  };
});

vi.mock("../../src/utils/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

describe("BackfillService", () => {
  let service: BackfillService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new BackfillService();
    mockGet.mockResolvedValue(null);
    mockSmembers.mockResolvedValue([]);
  });

  it("creates a backfill job and enqueues the first chunk", async () => {
    const result = await service.createTransactionBackfill({
      assetCode: "USDC",
      assetIssuer: "GDUKMGUGDZQK6YH73JJDZP4445L3MDUX44SQGDRB3QXKOS4TKYAAAAAAA",
      pages: 10,
      pageSize: 50,
      chunkPages: 5,
      priority: "high",
    });

    expect(result.jobId).toBeDefined();
    expect(result.status).toBe("pending");
    expect(mockSet).toHaveBeenCalled();
    expect(mockSadd).toHaveBeenCalledWith("backfill:jobs", expect.any(String));
    expect(mockAddJob).toHaveBeenCalledWith(
      "backfill-chunk",
      expect.objectContaining({
        assetCode: "USDC",
        assetIssuer: expect.any(String),
        pages: 5,
        pageSize: 50,
      }),
      { priority: 1 },
    );
    expect(mockAuditLog).toHaveBeenCalled();
  });

  it("returns null for missing jobs", async () => {
    mockGet.mockResolvedValue(null);
    const result = await service.getJobStatus("missing-job");
    expect(result).toBeNull();
  });

  it("resumes a paused backfill job and re-enqueues a chunk", async () => {
    const jobId = "resume-job";
    const savedState = {
      id: jobId,
      type: "transactions",
      status: "failed",
      assetCode: "USDC",
      assetIssuer: "GDUKMGUGDZQK6YH73JJDZP4445L3MDUX44SQGDRB3QXKOS4TKYAAAAAAA",
      bridgeName: "circle",
      operationTypes: ["payment"],
      cursor: "abc",
      pageSize: 100,
      chunkPages: 5,
      requestedPages: 20,
      pagesCompleted: 5,
      pagesRemaining: 15,
      recordsFetched: 100,
      recordsStored: 90,
      errorCount: 1,
      priority: "normal",
      providerDelayMs: 500,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    mockGet.mockResolvedValue(JSON.stringify(savedState));

    const result = await service.resumeBackfillJob(jobId);

    expect(result).not.toBeNull();
    expect(result?.status).toBe("pending");
    expect(mockSet).toHaveBeenCalledWith(expect.stringContaining(jobId), expect.any(String));
    expect(mockAddJob).toHaveBeenCalledWith(
      "backfill-chunk",
      expect.objectContaining({
        jobId,
        cursor: "abc",
        pages: 5,
      }),
      { priority: 10 },
    );
    expect(mockAuditLog).toHaveBeenCalled();
  });

  it("marks a job complete when no further pages are available", async () => {
    const jobId = "complete-job";
    const savedState = {
      id: jobId,
      type: "transactions",
      status: "running",
      assetCode: "USDC",
      assetIssuer: "GDUKMGUGDZQK6YH73JJDZP4445L3MDUX44SQGDRB3QXKOS4TKYAAAAAAA",
      bridgeName: "circle",
      operationTypes: ["payment"],
      cursor: "abc",
      pageSize: 100,
      chunkPages: 5,
      requestedPages: 5,
      pagesCompleted: 0,
      pagesRemaining: 5,
      recordsFetched: 0,
      recordsStored: 0,
      errorCount: 0,
      priority: "normal",
      providerDelayMs: 500,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    mockGet.mockResolvedValue(JSON.stringify(savedState));
    mockBackfillAssetTransactions.mockResolvedValue({ fetched: 0, stored: 0, lastCursor: null });

    await service.processBackfillChunk({
      jobId,
      assetCode: savedState.assetCode,
      assetIssuer: savedState.assetIssuer,
      bridgeName: savedState.bridgeName,
      operationTypes: savedState.operationTypes,
      cursor: savedState.cursor,
      pages: 5,
      pageSize: 100,
    });

    expect(mockSet).toHaveBeenCalledWith(expect.stringContaining(jobId), expect.stringContaining("\"status\":\"completed\""));
    expect(mockAddJob).not.toHaveBeenCalledWith(
      "backfill-chunk",
      expect.anything(),
      expect.anything(),
    );
  });
});
