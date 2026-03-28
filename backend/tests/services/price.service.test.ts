import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PriceService, PriceFetchError } from "../../src/services/price.service.js";
import { CacheService } from "../../src/utils/cache.js";
import { getOrderBook, getLiquidityPools, HorizonTimeoutError, HorizonClientError } from "../../src/utils/stellar.js";
import { CircleSource } from "../../src/services/sources/circle.source.js";

// Mock CacheService
vi.mock("../../src/utils/cache.js", () => ({
  CacheService: {
    getOrSet: vi.fn(),
    generateKey: vi.fn((ns, key) => `cache:${ns}:${key}`),
  },
  CacheTTL: {
    PRICES: 60,
  }
}));

// Mock CircleSource to avoid real HTTP requests
vi.mock("../../src/services/sources/circle.source.js", () => {
  return {
    CircleSource: class {
      static supports(symbol: string) {
        return symbol === "USDC" || symbol === "EURC";
      }
      async getPriceSourceData(symbol: string) {
        if (symbol === "USDC") return { price: 1.0, volume: 1000000, name: "Circle API" };
        if (symbol === "EURC") return { price: 1.05, volume: 500000, name: "Circle API" };
        throw new Error("Unsupported symbol in mocked Circle API");
      }
    }
  }
});

vi.mock("../../src/utils/stellar.js", () => ({
    getOrderBook: vi.fn(),
    getLiquidityPools: vi.fn(),
    HorizonTimeoutError: class HorizonTimeoutError extends Error {
        constructor(m = "Horizon API request timed out") {
            super(m);
            this.name = "HorizonTimeoutError";
        }
    },
    HorizonClientError: class HorizonClientError extends Error {
        constructor(m: string, public e: any) {
            super(m);
            this.name = "HorizonClientError";
        }
    }
}));

vi.mock("../../src/config/index.js", () => ({
    config: { REDIS_CACHE_TTL_SEC: 30, LOG_LEVEL: "info" },
    SUPPORTED_ASSETS: [
        { code: "USDC", issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN" },
        { code: "PYUSD", issuer: "GBHZAE5IQTOPQZ66TFWZYIYCHQ6T3GMWHDKFEXAKYWJ2BHLZQ227KRYE" },
        { code: "EURC", issuer: "GDQOE23CFSUMSVZZ4YRVXGW7PCFNIAHLMRAHDE4Z32DIBQGH4KZZK2KZ" },
        { code: "XLM", issuer: "native" },
        { code: "FOBXX", issuer: "GBX7VUT2UTUKO2H76J26D7QYWNFW6C2NYN6K74Y3K43HGBXYZ" }
    ]
}));

describe("PriceService", () => {
    let priceService: PriceService;

    beforeEach(() => {
        priceService = new PriceService();
        vi.resetAllMocks();

        // Default mock implementation to run fetcher
        vi.mocked(CacheService.getOrSet).mockImplementation(async (key, fetcher, options) => {
          return fetcher();
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe("fetchSDEXPrice", () => {
        it("returns mock price 1 for USDC", async () => {
            const result = await priceService.fetchSDEXPrice("USDC");
            expect(result).toEqual({ price: 1, volume: 1000000 });
            expect(getOrderBook).not.toHaveBeenCalled();
        });

        it("calculates VWAP from orderbook for other assets", async () => {
            vi.mocked(getOrderBook).mockResolvedValue({
                bids: [{ price: "0.1", amount: "100" }, { price: "0.09", amount: "200" }],
                asks: [{ price: "0.11", amount: "150" }, { price: "0.12", amount: "50" }],
                base: {} as any, counter: {} as any
            } as any);

            const result = await priceService.fetchSDEXPrice("XLM");

            // Expected:
            // bids: 0.1*100 = 10, 0.09*200 = 18
            // asks: 0.11*150 = 16.5, 0.12*50 = 6
            // Total Vol = 100+200+150+50 = 500
            // Weighted Sum = 10 + 18 + 16.5 + 6 = 50.5
            // VWAP = 50.5 / 500 = 0.101

            expect(result.price).toBeCloseTo(0.101);
            expect(result.volume).toBe(500);
            expect(getOrderBook).toHaveBeenCalledWith("XLM", "native", "USDC", "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN");
        });

        it("handles timeout correctly by rethrowing HorizonTimeoutError", async () => {
            vi.mocked(getOrderBook).mockRejectedValue(new HorizonTimeoutError());
            await expect(priceService.fetchSDEXPrice("XLM")).rejects.toThrow(HorizonTimeoutError);
        });

        it("handles generic errors by wrapping in PriceFetchError", async () => {
            vi.mocked(getOrderBook).mockRejectedValue(new Error("Network failed"));
            await expect(priceService.fetchSDEXPrice("XLM")).rejects.toThrow(PriceFetchError);
        });
    });

    describe("fetchAMMPrice", () => {
        it("returns pure 1 for USDC", async () => {
            const result = await priceService.fetchAMMPrice("USDC");
            expect(result).toEqual({ price: 1, volume: 1000000 });
        });

        it("calculates price from AMM reserves", async () => {
            vi.mocked(getLiquidityPools).mockResolvedValue({
                records: [
                    {
                        reserves: [
                            { asset: "native", amount: "1000" },
                            { asset: "USDC:USDC_ISSUER", amount: "100" }
                        ]
                    }
                ]
            } as any);

            const result = await priceService.fetchAMMPrice("XLM");
            // price = USDC config (100) / XLM config (1000) = 0.1
            // vol = 100 * 2 = 200
            expect(result.price).toBeCloseTo(0.1);
            expect(result.volume).toBe(200);
        });
    });

    describe("calculateVWAP", () => {
        it("computes VWAP from multiple sources", () => {
            const sources = [
                { price: 0.1, volume: 100, name: "SDEX" },
                { price: 0.12, volume: 200, name: "AMM" }
            ];
            const result = priceService.calculateVWAP(sources);
            // (10 + 24) / 300 = 34 / 300 = 0.11333
            expect(result.vwap).toBeCloseTo(0.113333);
            expect(result.validSources).toHaveLength(2);
        });

        it("computes VWAP from a single source if one is missing volume", () => {
            const sources = [
                { price: 0.1, volume: 100, name: "SDEX" },
                { price: 0.12, volume: 0, name: "AMM" } // 0 volume should be ignored
            ];
            const result = priceService.calculateVWAP(sources);
            expect(result.vwap).toBeCloseTo(0.1);
            expect(result.validSources).toHaveLength(1);
        });

        it("throws if all sources lack volume", () => {
            const sources = [
                { price: 0.1, volume: 0, name: "SDEX" },
                { price: NaN, volume: 100, name: "AMM" }
            ];
            expect(() => priceService.calculateVWAP(sources)).toThrow("No valid sources");
        });
    });

    describe("getAggregatedPrice", () => {
        beforeEach(() => {
            vi.spyOn(priceService, "fetchSDEXPrice").mockResolvedValue({ price: 0.1, volume: 100 });
            vi.spyOn(priceService, "fetchAMMPrice").mockResolvedValue({ price: 0.12, volume: 200 });
        });

        it("returns cached result if available", async () => {
            vi.mocked(CacheService.getOrSet).mockResolvedValue({ vwap: 999 });
            const result = await priceService.getAggregatedPrice("XLM");
            expect(result?.vwap).toBe(999);
            expect(priceService.fetchSDEXPrice).not.toHaveBeenCalled();
        });

        it("fetches from sources on cache miss", async () => {
            const result = await priceService.getAggregatedPrice("XLM");
            expect(result?.vwap).toBeCloseTo(0.113333);
            expect(priceService.fetchSDEXPrice).toHaveBeenCalledWith("XLM");
            expect(priceService.fetchAMMPrice).toHaveBeenCalledWith("XLM");
        });

        it("gracefully calculates from SDEX if AMM fails", async () => {
            vi.spyOn(priceService, "fetchAMMPrice").mockRejectedValue(new Error("AMM Down"));
            const result = await priceService.getAggregatedPrice("XLM");
            expect(result?.vwap).toBeCloseTo(0.1);
            expect(result?.sources).toHaveLength(1);
        });

        it("gracefully calculates from AMM if SDEX fails", async () => {
            vi.spyOn(priceService, "fetchSDEXPrice").mockRejectedValue(new Error("SDEX Down"));
            const result = await priceService.getAggregatedPrice("XLM");
            expect(result?.vwap).toBeCloseTo(0.12);
            expect(result?.sources).toHaveLength(1);
        });

        it("throws if both sources fail", async () => {
            vi.spyOn(priceService, "fetchSDEXPrice").mockRejectedValue(new HorizonTimeoutError("First error"));
            vi.spyOn(priceService, "fetchAMMPrice").mockRejectedValue(new Error("Second error"));
            await expect(priceService.getAggregatedPrice("XLM")).rejects.toThrow("First error");
        });

        it("works for each of the 5 assets", async () => {
            const assets = ["USDC", "PYUSD", "EURC", "XLM", "FOBXX"];
            for (const asset of assets) {
                const result = await priceService.getAggregatedPrice(asset);
                expect(result?.symbol).toBe(asset);
            }
        });
    });
});
