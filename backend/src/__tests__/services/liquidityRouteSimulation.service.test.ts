import { beforeEach, describe, expect, it, vi } from "vitest";

const databaseMocks = vi.hoisted(() => ({ fn: vi.fn() }));

vi.mock("../../database/connection.js", () => ({
  getDatabase: () => databaseMocks.fn,
}));

import { LiquidityRouteSimulationService } from "../../services/liquidityRouteSimulation.service.js";

function pool(overrides: Record<string, unknown> = {}) {
  return {
    pool_id: "pool-1",
    dex_name: "Soroswap",
    asset_code: "USDC",
    counter_asset: "XLM",
    reserve_a: 1_000_000,
    reserve_b: 2_000_000,
    time: new Date("2026-11-21T10:00:00Z"),
    ...overrides,
  };
}

describe("LiquidityRouteSimulationService", () => {
  let service: LiquidityRouteSimulationService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new LiquidityRouteSimulationService();
  });

  it("applies a 0.3% fee using constant-product route economics", async () => {
    databaseMocks.fn.mockReturnValue({
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([pool({ asset_code: "XLM", counter_asset: "USDC" })]),
    });

    const result = await (service as any).findBestRoute("XLM", "USDC", 10_000);

    expect(result.outputAmount).toBe(9_970);
    expect(result.totalFee).toBe(30);
  });

  it("uses the same fee accounting for a stableswap corridor", async () => {
    databaseMocks.fn.mockReturnValue({
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([pool({ asset_code: "USDC", counter_asset: "USDT" })]),
    });

    const result = await (service as any).findBestRoute("USDC", "USDT", 100_000);

    expect(result.steps).toHaveLength(1);
    expect(result.outputAmount).toBe(99_700);
  });

  it("deducts the fee across intermediary hops", async () => {
    databaseMocks.fn.mockReturnValue({
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([
        pool({ pool_id: "pool-a", asset_code: "XLM", counter_asset: "USDC" }),
      ]),
    });

    const result = await (service as any).findBestRoute("XLM", "USDC", 100_000, { maxHops: 2 });

    expect(result.steps).toHaveLength(1);
    expect(result.totalFee).toBe(300);
    expect(result.outputAmount).toBe(99_700);
  });

  it("selects a matching pool for the lowest-cost direct route", async () => {
    databaseMocks.fn.mockReturnValue({
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([
        pool({ pool_id: "expensive", asset_code: "XLM", counter_asset: "USDC" }),
        pool({ pool_id: "excluded", asset_code: "XLM", counter_asset: "USDC" }),
      ]),
    });

    const result = await (service as any).findBestRoute("XLM", "USDC", 10_000, {
      excludedPools: ["excluded"],
    });

    expect(result.steps[0].poolId).toBe("expensive");
  });

  it("rejects routes when no pool has sufficient matching liquidity", async () => {
    databaseMocks.fn.mockReturnValue({
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    });

    await expect((service as any).findBestRoute("XLM", "USDC", 10_000))
      .rejects.toThrow("No route found");
  });
});
