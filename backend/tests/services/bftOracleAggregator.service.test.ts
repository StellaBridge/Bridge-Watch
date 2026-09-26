import { describe, it, expect, vi } from "vitest";
import { BftOracleAggregatorService } from "../../src/services/bftOracleAggregator.service.js";
import { providerHealthRegistryService } from "../../src/services/providerHealthRegistry.service.js";

vi.mock("../../src/utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../src/database/connection.js", () => {
  const mockDb: any = vi.fn().mockImplementation(() => {
    const builder: any = {
      where: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue(undefined),
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    return builder;
  });
  return { getDatabase: () => mockDb };
});

vi.mock("../../src/services/providerHealthRegistry.service.js", () => ({
  providerHealthRegistryService: {
    flagAndSlashProvider: vi.fn().mockResolvedValue(undefined),
  },
}));

function makeReports(prices: number[]) {
  return prices.map((price, index) => ({
    providerKey: `provider-${index}`,
    price,
    timestamp: new Date("2026-01-01T00:00:00Z").toISOString(),
  }));
}

describe("BftOracleAggregatorService trimmed mean and outlier rejection", () => {
  it("rejects a colluding extreme submission more than 3 sigma from the median", async () => {
    const service = new BftOracleAggregatorService();
    const result = await service.aggregateBftState("USDC", makeReports([1, 2, 3, 4, 5, 10_000]));

    // 10_000 is far beyond 3 sigma from the median -> rejected and slashed
    expect(result.slashedProviders).toContain("provider-5");

    // Consensus is computed from the surviving reports only
    expect(result.consensusPrice).toBeCloseTo(3, 6);
    expect(result.validProviders).toBe(5);
    expect(result.quorumReached).toBe(true);
  });

  it("reports a 20% trimmed mean that excludes both tails", async () => {
    const service = new BftOracleAggregatorService();
    // 10 reports [1..10]: trim 20% (2 from each side) -> mean of [3..8] = 5.5
    const result = await service.aggregateBftState("USDC", makeReports([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));

    expect(result.trimmedMeanPrice).toBeCloseTo(5.5, 6);
    // The plain arithmetic mean is still reported for observability
    expect(result.meanPrice).toBeCloseTo(5.5, 6);
  });

  it("does not flag any provider when all reports sit within 3 sigma", async () => {
    const service = new BftOracleAggregatorService();
    const result = await service.aggregateBftState("USDC", makeReports([100, 101, 100, 102, 100]));

    expect(result.slashedProviders).toEqual([]);
    expect(result.validProviders).toBe(5);
    // Trim 20% of 5 reports (1 from each tail) -> mean of [100, 100, 101]
    expect(result.trimmedMeanPrice).toBeCloseTo(100.3333, 3);
  });
});
