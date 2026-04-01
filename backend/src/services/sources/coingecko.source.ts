/**
 * CoinGecko price source.
 *
 * Fetches spot prices, market-cap, and 24-hour trading volume for supported
 * assets from the CoinGecko public API (v3).  No API key is required for the
 * free tier; the optional `COINGECKO_API_KEY` env var is forwarded as a
 * `x-cg-demo-api-key` header to increase the rate-limit allowance.
 *
 * Docs: https://www.coingecko.com/api/documentation
 */

import { redis } from "../../utils/redis.js";
import { logger } from "../../utils/logger.js";
import { withRetry } from "../../utils/retry.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SOURCE_NAME = "CoinGecko";
const BASE_URL = "https://api.coingecko.com/api/v3";
const CACHE_PREFIX = "coingecko:price:";
const CACHE_TTL_SEC = 60;
const TIMEOUT_MS = 8_000;

/** Map from Bridge-Watch asset symbol → CoinGecko coin ID */
const SYMBOL_TO_ID: Record<string, string> = {
  USDC: "usd-coin",
  USDT: "tether",
  WBTC: "wrapped-bitcoin",
  WETH: "weth",
  EURC: "euro-coin",
  XLM: "stellar",
  ETH: "ethereum",
  BTC: "bitcoin",
};

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

interface CoinGeckoPriceItem {
  usd: number;
  usd_market_cap: number;
  usd_24h_vol: number;
  usd_24h_change: number;
  last_updated_at: number;
}

type CoinGeckoSimplePriceResponse = Record<string, CoinGeckoPriceItem>;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class CoinGeckoError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "CoinGeckoError";
  }
}

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

async function fetchWithTimeout(
  url: string,
  headers: Record<string, string>
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { headers, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// CoinGeckoSource
// ---------------------------------------------------------------------------

export interface CoinGeckoPriceResult {
  symbol: string;
  price: number;
  volume24h: number;
  marketCap: number;
  change24h: number;
  lastUpdatedAt: number;
  source: string;
}

export class CoinGeckoSource {
  private readonly headers: Record<string, string>;

  constructor() {
    this.headers = {
      Accept: "application/json",
      ...(process.env.COINGECKO_API_KEY
        ? { "x-cg-demo-api-key": process.env.COINGECKO_API_KEY }
        : {}),
    };
  }

  static supports(symbol: string): boolean {
    return symbol.toUpperCase() in SYMBOL_TO_ID;
  }

  /** Fetch price data for one or more symbols. Results are Redis-cached. */
  async getPrices(symbols: string[]): Promise<CoinGeckoPriceResult[]> {
    const upper = symbols.map((s) => s.toUpperCase());
    const ids = upper.map((s) => SYMBOL_TO_ID[s]).filter(Boolean);

    if (ids.length === 0) {
      logger.warn({ symbols }, "CoinGecko: no known IDs for requested symbols");
      return [];
    }

    const cacheKey = `${CACHE_PREFIX}${ids.sort().join(",")}`;

    // --- cache read ---
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        logger.debug({ cacheKey }, "CoinGecko cache hit");
        return JSON.parse(cached) as CoinGeckoPriceResult[];
      }
    } catch (err) {
      logger.warn({ err }, "CoinGecko cache read error");
    }

    const results = await withRetry(
      () => this.fetchLive(ids, upper),
      3,
      500
    );

    try {
      await redis.set(cacheKey, JSON.stringify(results), "EX", CACHE_TTL_SEC);
    } catch (err) {
      logger.warn({ err }, "CoinGecko cache write error");
    }

    return results;
  }

  /** Convenience: fetch a single symbol */
  async getPrice(symbol: string): Promise<CoinGeckoPriceResult | null> {
    const results = await this.getPrices([symbol]);
    return results.find((r) => r.symbol === symbol.toUpperCase()) ?? null;
  }

  // ---------------------------------------------------------------------------

  private async fetchLive(
    ids: string[],
    symbols: string[]
  ): Promise<CoinGeckoPriceResult[]> {
    const params = new URLSearchParams({
      ids: ids.join(","),
      vs_currencies: "usd",
      include_market_cap: "true",
      include_24hr_vol: "true",
      include_24hr_change: "true",
      include_last_updated_at: "true",
    });

    const url = `${BASE_URL}/simple/price?${params.toString()}`;
    const start = Date.now();

    let response: Response;
    try {
      response = await fetchWithTimeout(url, this.headers);
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === "AbortError";
      throw new CoinGeckoError(
        isTimeout ? "CoinGecko request timed out" : "CoinGecko unreachable"
      );
    }

    logger.info(
      { url, status: response.status, durationMs: Date.now() - start },
      "CoinGecko API call"
    );

    if (response.status === 429) {
      throw new CoinGeckoError("CoinGecko rate limit exceeded", 429);
    }
    if (!response.ok) {
      throw new CoinGeckoError(
        `CoinGecko returned ${response.status}`,
        response.status
      );
    }

    const body = (await response.json()) as CoinGeckoSimplePriceResponse;

    const results: CoinGeckoPriceResult[] = [];
    for (const [idx, id] of ids.entries()) {
      const item = body[id];
      if (!item) continue;
      results.push({
        symbol: symbols[idx],
        price: item.usd,
        volume24h: item.usd_24h_vol ?? 0,
        marketCap: item.usd_market_cap ?? 0,
        change24h: item.usd_24h_change ?? 0,
        lastUpdatedAt: item.last_updated_at,
        source: SOURCE_NAME,
      });
    }

    logger.info(
      { fetched: results.length, requested: ids.length },
      "CoinGecko prices fetched"
    );

    return results;
  }
}
