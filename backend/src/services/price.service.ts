import { logger } from "../utils/logger.js";
import { CacheService, CacheTTL } from "../utils/cache.js";
import { config, SUPPORTED_ASSETS } from "../config/index.js";
import { getOrderBook, getLiquidityPools, HorizonTimeoutError, HorizonClientError } from "../utils/stellar.js";
import * as StellarSdk from "@stellar/stellar-sdk";
import { CircleSource } from "./sources/circle.source.js";

export class PriceFetchError extends Error {
  constructor(message: string, public readonly source: string, public readonly asset: string, public readonly originalError?: unknown) {
    super(message);
    this.name = "PriceFetchError";
  }
}

export interface PriceSource {
  source: string;
  price: number;
  timestamp: string;
}

export interface AggregatedPrice {
  symbol: string;
  vwap: number;
  sources: PriceSource[];
  deviation: number;
  lastUpdated: string;
}

export class PriceService {
  private readonly circleSource = new CircleSource();
  /**
   * Fetches the best available price from the Stellar Classic SDEX orderbook.
   * Calculates a volume-weighted price from the top of the orderbook (depth up to 5).
   * @param {string} symbol - The symbol code of the asset to price against USDC
   * @returns {Promise<{ price: number; volume: number }>} A tuple containing the derived VWAP point price and the total volume evaluated
   * @throws {PriceFetchError} If an error occurs during parsing or the asset config is not found
   */
  async fetchSDEXPrice(symbol: string): Promise<{ price: number; volume: number }> {
    try {
      const assetConfig = SUPPORTED_ASSETS.find(a => a.code === symbol);
      if (!assetConfig) throw new Error(`Asset ${symbol} not supported`);

      const usdcConfig = SUPPORTED_ASSETS.find(a => a.code === "USDC");
      if (!usdcConfig) throw new Error("USDC config missing");

      if (symbol === "USDC") return { price: 1, volume: 1000000 };

      const orderbook = await getOrderBook(
        symbol,
        assetConfig.issuer,
        "USDC",
        usdcConfig.issuer
      );

      let totalVolume = 0;
      let weightedPriceSum = 0;

      const depth = Math.min(5, orderbook.bids.length, orderbook.asks.length);
      if (depth === 0) throw new Error("Empty orderbook");

      for (let i = 0; i < depth; i++) {
        const bidPrice = parseFloat(orderbook.bids[i].price);
        const bidVol = parseFloat(orderbook.bids[i].amount);
        const askPrice = parseFloat(orderbook.asks[i].price);
        const askVol = parseFloat(orderbook.asks[i].amount);

        totalVolume += (bidVol + askVol);
        weightedPriceSum += (bidPrice * bidVol) + (askPrice * askVol);
      }

      return {
        price: weightedPriceSum / totalVolume,
        volume: totalVolume
      };
    } catch (error) {
      if (error instanceof HorizonTimeoutError || error instanceof HorizonClientError) throw error;
      throw new PriceFetchError(`Failed to fetch SDEX price for ${symbol}`, "SDEX", symbol, error);
    }
  }

  /**
   * Fetches the asset price from Stellar AMM Liquidity Pools.
   * Retrieves the pool with the largest reserves and calculates price from reserve ratios.
   * @param {string} symbol - The symbol code of the asset to price against USDC
   * @returns {Promise<{ price: number; volume: number }>} A tuple containing the derived price and liquidity volume proxy
   * @throws {PriceFetchError} If an error occurs retrieving the pool or evaluating the reserves
   */
  async fetchAMMPrice(symbol: string): Promise<{ price: number; volume: number }> {
    try {
      const assetConfig = SUPPORTED_ASSETS.find(a => a.code === symbol);
      if (!assetConfig) throw new Error(`Asset ${symbol} not supported`);
      const usdcConfig = SUPPORTED_ASSETS.find(a => a.code === "USDC");
      if (!usdcConfig) throw new Error("USDC config missing");

      if (symbol === "USDC") return { price: 1, volume: 1000000 };

      const assetA = assetConfig.code === "XLM" ? StellarSdk.Asset.native() : new StellarSdk.Asset(assetConfig.code, assetConfig.issuer);
      const assetB = new StellarSdk.Asset("USDC", usdcConfig.issuer);

      const pools = await getLiquidityPools(assetA, assetB);
      if (pools.records.length === 0) throw new Error("No liquidity pools found");

      const pool = pools.records.reduce((prev: any, current: any) => {
        const prevReserves = parseFloat(prev.reserves[0].amount) + parseFloat(prev.reserves[1].amount);
        const currentReserves = parseFloat(current.reserves[0].amount) + parseFloat(current.reserves[1].amount);
        return currentReserves > prevReserves ? current : prev;
      });

      const reserveA = pool.reserves.find((r: any) => r.asset.includes(symbol === "XLM" ? "native" : symbol));
      const reserveB = pool.reserves.find((r: any) => r.asset.includes("USDC"));

      if (!reserveA || !reserveB) throw new Error("Pool missing required reserves");

      const amountA = parseFloat(reserveA.amount);
      const amountB = parseFloat(reserveB.amount);
      if (amountA === 0) throw new Error("Empty reserves");

      return { price: amountB / amountA, volume: amountB * 2 };
    } catch (error) {
      console.error(error);
      if (error instanceof HorizonTimeoutError || error instanceof HorizonClientError) throw error;
      throw new PriceFetchError(`Failed to fetch AMM price for ${symbol}`, "AMM", symbol, error);
    }
  }

  /**
   * Calculates a pure Volume-Weighted Average Price (VWAP) across multiple independent price sources.
   * Gracefully ignores sources with missing or zero volumes.
   * @param {Array<{ price: number; volume: number; name: string }>} sources - Raw source price and volume data points
   * @returns {{ vwap: number, validSources: PriceSource[] }} The calculated VWAP and the valid sources used
   * @throws {Error} If no valid sources with non-zero volume were evaluated
   */
  calculateVWAP(sources: { price: number; volume: number; name: string }[]): { vwap: number, validSources: PriceSource[] } {
    let totalVolume = 0;
    let sumPriceVolume = 0;
    const validSources: PriceSource[] = [];
    const now = new Date().toISOString();

    for (const s of sources) {
      if (!isNaN(s.price) && !isNaN(s.volume) && s.volume > 0) {
        totalVolume += s.volume;
        sumPriceVolume += (s.price * s.volume);
        validSources.push({ source: s.name, price: s.price, timestamp: now });
      }
    }

    if (totalVolume === 0) throw new Error("No valid sources with volume to calculate VWAP");

    return { vwap: sumPriceVolume / totalVolume, validSources };
  }

  /**
   * Get an aggregated price from all supported Oracle sources.
   * Combines data from Stellar DEX (SDEX) and Stellar AMM Pools.
   * Uses Redis caching with a configurable TTL to keep response times under 500ms.
   * @param {string} symbol - The symbol code to aggregate price data for
   * @returns {Promise<AggregatedPrice | null>} The aggregated price object conforming to AggregatedPrice or null if fundamentally unresolvable
   * @throws {Error} Re-throws first error if all individual fetch sources fail
   */
  async getAggregatedPrice(symbol: string, bypassCache: boolean = false): Promise<AggregatedPrice | null> {
    const cacheKey = CacheService.generateKey("price", `aggregated:${symbol}`);

    return CacheService.getOrSet(
      cacheKey,
      async () => {
        logger.info({ symbol }, "Fetching aggregated price from sources");

        const fetches: Promise<{ price: number; volume: number; name: string }>[] = [
          this.fetchSDEXPrice(symbol).then((r) => ({ ...r, name: "Stellar DEX" })),
          this.fetchAMMPrice(symbol).then((r) => ({ ...r, name: "Stellar AMM" })),
        ];

        if (CircleSource.supports(symbol)) {
          fetches.push(this.circleSource.getPriceSourceData(symbol));
        }

        const results = await Promise.allSettled(fetches);

        const sourceData: { price: number; volume: number; name: string }[] = [];

        for (const result of results) {
          if (result.status === "fulfilled") {
            sourceData.push(result.value);
          } else {
            logger.warn({ error: result.reason, symbol }, "Price source fetch failed");
          }
        }

        if (sourceData.length === 0) {
          const firstError = (results[0] as PromiseRejectedResult).reason || (results[1] as PromiseRejectedResult).reason;
          throw firstError;
        }

        const { vwap, validSources } = this.calculateVWAP(sourceData);

        const aggregated: AggregatedPrice = {
          symbol,
          vwap,
          sources: validSources,
          deviation: 0,
          lastUpdated: new Date().toISOString()
        };

        return aggregated;
      },
      { bypassCache, tags: ["price"], ttl: CacheTTL.PRICES }
    );
  }

  /**
   * Get price from a specific source
   */
  async getPriceFromSource(
    symbol: string,
    source: string
  ): Promise<PriceSource | null> {
    logger.info({ symbol, source }, "Fetching price from specific source");

    if (source.toLowerCase() === "circle") {
      if (!CircleSource.supports(symbol)) return null;
      const { price } = await this.circleSource.getPriceSourceData(symbol);
      return { source: "Circle", price, timestamp: new Date().toISOString() };
    }

    return null;
  }

  /**
   * Check if price deviation exceeds the configured threshold
   */
  async checkDeviation(
    symbol: string
  ): Promise<{ deviated: boolean; percentage: number }> {
    logger.info({ symbol }, "Checking price deviation");
    // TODO: Compare prices across sources and check against threshold
    return { deviated: false, percentage: 0 };
  }

  /**
   * Get historical price data for charting
   */
  async getHistoricalPrices(
    symbol: string,
    interval: "1h" | "1d" | "7d" | "30d"
  ): Promise<{ timestamp: string; price: number }[]> {
    logger.info({ symbol, interval }, "Fetching historical prices");
    // TODO: Query TimescaleDB for time-bucketed price data
    return [];
  }
}
