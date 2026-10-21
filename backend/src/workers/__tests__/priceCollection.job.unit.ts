import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Job } from "bullmq";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetAggregatedPrice = vi.fn();

vi.mock("../../services/price.service.js", () => ({
  PriceService: vi.fn().mockImplementation(() => ({
    getAggregatedPrice: mockGetAggregatedPrice,
  })),
}));

vi.mock("../../config/index.js", () => ({
  SUPPORTED_ASSETS: [
    { code: "USDC", issuer: "GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTQGOMPF7ECOJU7GZVA325C5V" },
    { code: "USDT", issuer: "GBBD47UZQ2BNSE7E4GBRCKUTQ7RQ74IEXNPJCX5JBXU4EBNDXDKTV3E" },
    { code: "XLM", issuer: "GDZST3XVCDTUJ76ZAV2HA72KYQM4YQQ4EQABNF47QWMGMQ5HYNMIPGS" },
  ],
}));

vi.mock("../../utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { processPriceCollection } from "../priceCollection.job.js";

describe("priceCollection.job", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAggregatedPrice.mockResolvedValue(undefined);
  });

  it("should fetch prices for all supported assets", async () => {
    const job = {
      id: "job-price-1",
      data: {},
    } as any as Job;

    await processPriceCollection(job);

    expect(mockGetAggregatedPrice).toHaveBeenCalledTimes(3);
    expect(mockGetAggregatedPrice).toHaveBeenCalledWith("USDC");
    expect(mockGetAggregatedPrice).toHaveBeenCalledWith("USDT");
    expect(mockGetAggregatedPrice).toHaveBeenCalledWith("XLM");
  });

  it("should continue fetching prices even if one asset fails", async () => {
    const error = new Error("Price feed unavailable");
    mockGetAggregatedPrice.mockRejectedValueOnce(error).mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined);

    const job = {
      id: "job-price-2",
      data: {},
    } as any as Job;

    await expect(processPriceCollection(job)).resolves.toBeUndefined();

    expect(mockGetAggregatedPrice).toHaveBeenCalledTimes(3);
  });

  it("should handle all assets failing gracefully", async () => {
    const error = new Error("All price feeds down");
    mockGetAggregatedPrice.mockRejectedValue(error);

    const job = {
      id: "job-price-3",
      data: {},
    } as any as Job;

    await expect(processPriceCollection(job)).resolves.toBeUndefined();

    expect(mockGetAggregatedPrice).toHaveBeenCalledTimes(3);
  });

  it("should fetch prices sequentially in order", async () => {
    const callOrder: string[] = [];
    mockGetAggregatedPrice.mockImplementation(async (assetCode: string) => {
      callOrder.push(assetCode);
      return undefined;
    });

    const job = {
      id: "job-price-4",
      data: {},
    } as any as Job;

    await processPriceCollection(job);

    expect(callOrder).toEqual(["USDC", "USDT", "XLM"]);
  });

  it("should handle network timeout for a single asset", async () => {
    const timeoutError = new Error("Request timeout");
    mockGetAggregatedPrice.mockResolvedValueOnce(undefined).mockRejectedValueOnce(timeoutError).mockResolvedValueOnce(undefined);

    const job = {
      id: "job-price-5",
      data: {},
    } as any as Job;

    await expect(processPriceCollection(job)).resolves.toBeUndefined();
    expect(mockGetAggregatedPrice).toHaveBeenCalledTimes(3);
  });

  it("should handle partial price data successfully", async () => {
    mockGetAggregatedPrice.mockResolvedValue(undefined);

    const job = {
      id: "job-price-6",
      data: {},
    } as any as Job;

    await expect(processPriceCollection(job)).resolves.toBeUndefined();
  });

  it("should complete successfully with job metadata", async () => {
    const job = {
      id: "job-price-complete",
      data: {
        priority: "high",
        timestamp: Date.now(),
      },
    } as any as Job;

    await expect(processPriceCollection(job)).resolves.toBeUndefined();
    expect(mockGetAggregatedPrice).toHaveBeenCalledTimes(3);
  });

  it("should handle very fast price fetching", async () => {
    mockGetAggregatedPrice.mockImplementation(async () => {
      return undefined;
    });

    const job = {
      id: "job-price-fast",
      data: {},
    } as any as Job;

    const startTime = Date.now();
    await processPriceCollection(job);
    const endTime = Date.now();

    expect(endTime - startTime).toBeGreaterThanOrEqual(0);
    expect(mockGetAggregatedPrice).toHaveBeenCalledTimes(3);
  });

  it("should handle price service returning data", async () => {
    const priceData = {
      price: 1.0,
      timestamp: Date.now(),
      sources: ["source1", "source2"],
    };
    mockGetAggregatedPrice.mockResolvedValue(priceData);

    const job = {
      id: "job-price-data",
      data: {},
    } as any as Job;

    await expect(processPriceCollection(job)).resolves.toBeUndefined();
    expect(mockGetAggregatedPrice).toHaveBeenCalledTimes(3);
  });

  it("should handle stale price data gracefully", async () => {
    mockGetAggregatedPrice.mockRejectedValueOnce(new Error("Stale data")).mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined);

    const job = {
      id: "job-price-stale",
      data: {},
    } as any as Job;

    await expect(processPriceCollection(job)).resolves.toBeUndefined();
    expect(mockGetAggregatedPrice).toHaveBeenCalledTimes(3);
  });

  it("should not throw if one asset connection fails", async () => {
    mockGetAggregatedPrice.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("Connection refused")).mockResolvedValueOnce(undefined);

    const job = {
      id: "job-price-conn-fail",
      data: {},
    } as any as Job;

    await expect(processPriceCollection(job)).resolves.toBeUndefined();
  });

  it("should handle unexpected error from service gracefully", async () => {
    const unexpectedError = new Error("Unexpected error in price service");
    mockGetAggregatedPrice.mockRejectedValue(unexpectedError);

    const job = {
      id: "job-price-unexpected",
      data: {},
    } as any as Job;

    // Job should complete even with errors
    await expect(processPriceCollection(job)).resolves.toBeUndefined();
    expect(mockGetAggregatedPrice).toHaveBeenCalledTimes(3);
  });
});
