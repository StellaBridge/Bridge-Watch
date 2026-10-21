import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Job } from "bullmq";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSyncAll = vi.fn();

vi.mock("../../services/assetMetadataSync.service.js", () => ({
  assetMetadataSyncService: {
    syncAll: mockSyncAll,
  },
}));

vi.mock("../../utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { processMetadataSync } from "../metadataSync.job.js";

describe("metadataSync.job", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call syncAll with default parameters when job data is empty", async () => {
    mockSyncAll.mockResolvedValue({ total: 42 });

    const job = {
      id: "job-123",
      data: {},
    } as any as Job;

    await processMetadataSync(job);

    expect(mockSyncAll).toHaveBeenCalledOnce();
    expect(mockSyncAll).toHaveBeenCalledWith({
      symbols: undefined,
      fields: undefined,
      force: false,
      triggeredBy: "scheduler",
    });
  });

  it("should pass symbols array to syncAll", async () => {
    mockSyncAll.mockResolvedValue({ total: 10 });

    const symbols = ["USDC", "USDT", "EUR"];
    const job = {
      id: "job-456",
      data: { symbols },
    } as any as Job;

    await processMetadataSync(job);

    expect(mockSyncAll).toHaveBeenCalledWith({
      symbols,
      fields: undefined,
      force: false,
      triggeredBy: "scheduler",
    });
  });

  it("should pass fields array to syncAll", async () => {
    mockSyncAll.mockResolvedValue({ total: 5 });

    const fields = ["logo_url", "description"];
    const job = {
      id: "job-789",
      data: { fields },
    } as any as Job;

    await processMetadataSync(job);

    expect(mockSyncAll).toHaveBeenCalledWith({
      symbols: undefined,
      fields,
      force: false,
      triggeredBy: "scheduler",
    });
  });

  it("should respect force flag from job data", async () => {
    mockSyncAll.mockResolvedValue({ total: 15 });

    const job = {
      id: "job-force",
      data: { force: true },
    } as any as Job;

    await processMetadataSync(job);

    expect(mockSyncAll).toHaveBeenCalledWith({
      symbols: undefined,
      fields: undefined,
      force: true,
      triggeredBy: "scheduler",
    });
  });

  it("should pass both symbols and fields together", async () => {
    mockSyncAll.mockResolvedValue({ total: 8 });

    const symbols = ["USDC", "XLM"];
    const fields = ["logo_url", "website_url"];
    const job = {
      id: "job-combined",
      data: { symbols, fields },
    } as any as Job;

    await processMetadataSync(job);

    expect(mockSyncAll).toHaveBeenCalledWith({
      symbols,
      fields,
      force: false,
      triggeredBy: "scheduler",
    });
  });

  it("should handle non-array symbols gracefully", async () => {
    mockSyncAll.mockResolvedValue({ total: 0 });

    const job = {
      id: "job-invalid",
      data: { symbols: "USDC" }, // Invalid: not an array
    } as any as Job;

    await processMetadataSync(job);

    expect(mockSyncAll).toHaveBeenCalledWith({
      symbols: undefined,
      fields: undefined,
      force: false,
      triggeredBy: "scheduler",
    });
  });

  it("should handle non-array fields gracefully", async () => {
    mockSyncAll.mockResolvedValue({ total: 0 });

    const job = {
      id: "job-invalid-fields",
      data: { fields: { logo_url: true } }, // Invalid: not an array
    } as any as Job;

    await processMetadataSync(job);

    expect(mockSyncAll).toHaveBeenCalledWith({
      symbols: undefined,
      fields: undefined,
      force: false,
      triggeredBy: "scheduler",
    });
  });

  it("should convert truthy force values to boolean", async () => {
    mockSyncAll.mockResolvedValue({ total: 20 });

    const job = {
      id: "job-truthy",
      data: { force: 1 }, // Truthy but not boolean
    } as any as Job;

    await processMetadataSync(job);

    expect(mockSyncAll).toHaveBeenCalledWith({
      symbols: undefined,
      fields: undefined,
      force: true,
      triggeredBy: "scheduler",
    });
  });

  it("should convert falsy force values to false", async () => {
    mockSyncAll.mockResolvedValue({ total: 20 });

    const job = {
      id: "job-falsy",
      data: { force: 0 }, // Falsy
    } as any as Job;

    await processMetadataSync(job);

    expect(mockSyncAll).toHaveBeenCalledWith({
      symbols: undefined,
      fields: undefined,
      force: false,
      triggeredBy: "scheduler",
    });
  });

  it("should complete successfully when syncAll resolves", async () => {
    const result = { total: 42, synced: 40, conflicts: 2 };
    mockSyncAll.mockResolvedValue(result);

    const job = {
      id: "job-success",
      data: {},
    } as any as Job;

    await expect(processMetadataSync(job)).resolves.toBeUndefined();
  });

  it("should propagate errors from syncAll", async () => {
    const error = new Error("Failed to fetch metadata from source");
    mockSyncAll.mockRejectedValue(error);

    const job = {
      id: "job-error",
      data: {},
    } as any as Job;

    await expect(processMetadataSync(job)).rejects.toThrow(error);
  });

  it("should handle empty symbols array", async () => {
    mockSyncAll.mockResolvedValue({ total: 0 });

    const job = {
      id: "job-empty",
      data: { symbols: [] },
    } as any as Job;

    await processMetadataSync(job);

    expect(mockSyncAll).toHaveBeenCalledWith({
      symbols: [],
      fields: undefined,
      force: false,
      triggeredBy: "scheduler",
    });
  });

  it("should handle large symbols array", async () => {
    mockSyncAll.mockResolvedValue({ total: 1000 });

    const symbols = Array.from({ length: 500 }, (_, i) => `ASSET_${i}`);
    const job = {
      id: "job-large",
      data: { symbols },
    } as any as Job;

    await processMetadataSync(job);

    expect(mockSyncAll).toHaveBeenCalledWith({
      symbols,
      fields: undefined,
      force: false,
      triggeredBy: "scheduler",
    });
  });
});
