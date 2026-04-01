/**
 * CoinMarketCap price source.
 *
 * Fetches latest quotes from the CoinMarketCap Pro API (v1).
 * Requires the `COINMARKETCAP_API_KEY` environment variable.
 *
 * Docs: https://coinmarketcap.com/api/documentation/v1/
 */

import { redis } from "../../utils/redis.js";
import { logger } from "../../utils/logger.js";
import { withRetry } from "../../utils/retry.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SOURCE_NAME = "CoinMarketCap";
const BASE_URL = "https://pro-api.coinmarketcap.com/v1";
const CACHE_PREFIX = "cmc:price:";
const CACHE_TTL_SEC = 60;
const TIMEOUT_MS = 8_000;

/** Bridge-Watch symbols CoinMarketCap can serve (all symbols must match CMC) */
const SUPPORTED_SYMBOLS = new Set([
  "USDC",
  "USDT",
  "WBTC",
  "WETH",
  "ETH",
  "BTC",
  "XLM",
  "EURC",
]);

// ---------------------------------------------------------------------------
// CMC response shapes
// ---------------------------------------------------------------------------

interface CmcQuote {
  price: number;
  volume_24h: number;
  market_cap: number;
  percent_change_24h: number;
  last_updated: string;
}

interface CmcCoinData {
  id: number;
  name: string;
  symbol: string;
  quote: { USD: CmcQuote };
}

interface CmcQuotesResponse {
  data: Record<string, CmcCoinData>;
  status: {
    error_code: number;
    error_message: string | null;
  };
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class CoinMarketCapError extends Error {
  constructor(
    message: string,
    public readonly code?: number
  ) {
    super(message);
    this.name = "CoinMarketCapError";
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
// CoinMarketCapSource
// ---------------------------------------------------------------------------

export interface CmcPriceResult {
  symbol: string;
  price: number;
  volume24h: number;
  marketCap: number;
  change24h: number;
  lastUpdated: string;
  source: string;
}

export class CoinMarketCapSource {
  private readonly apiKey: string | undefined;

  constructor() {
    this.apiKey = process.env.COINMARKETCAP_API_KEY;
  }

  static supports(symbol: string): boolean {
    return SUPPORTED_SYMBOLS.has(symbol.toUpperCase());
  }

  /** Returns false when no API key is configured. */
  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async getPrices(symbols: string[]): Promise<CmcPriceResult[]> {
    if (!this.apiKey) {
      logger.warn("CoinMarketCap API key not configured — skipping source");
      return [];
    }

    const upper = symbols
      .map((s) => s.toUpperCase())
      .filter((s) => SUPPORTED_SYMBOLS.has(s));

    if (upper.length === 0) return [];

    const cacheKey = `${CACHE_PREFIX}${upper.sort().join(",")}`;

    // --- cache read ---
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        logger.debug({ cacheKey }, "CoinMarketCap cache hit");
        return JSON.parse(cached) as CmcPriceResult[];
      }
    } catch (err) {
      logger.warn({ err }, "CoinMarketCap cache read error");
    }

    const results = await withRetry(
      () => this.fetchLive(upper),
      3,
      500
    );

    try {
      await redis.set(cacheKey, JSON.stringify(results), "EX", CACHE_TTL_SEC);
    } catch (err) {
      logger.warn({ err }, "CoinMarketCap cache write error");
    }

    return results;
  }

  async getPrice(symbol: string): Promise<CmcPriceResult | null> {
    const results = await this.getPrices([symbol]);
    return results.find((r) => r.symbol === symbol.toUpperCase()) ?? null;
  }

  // ---------------------------------------------------------------------------

  private async fetchLive(symbols: string[]): Promise<CmcPriceResult[]> {
    const params = new URLSearchParams({
      symbol: symbols.join(","),
      convert: "USD",
    });

    const url = `${BASE_URL}/cryptocurrency/quotes/latest?${params.toString()}`;
    const headers = {
      "X-CMC_PRO_API_KEY": this.apiKey!,
      Accept: "application/json",
    };

    const start = Date.now();

    let response: Response;
    try {
      response = await fetchWithTimeout(url, headers);
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === "AbortError";
      throw new CoinMarketCapError(
        isTimeout ? "CoinMarketCap request timed out" : "CoinMarketCap unreachable"
      );
    }

    logger.info(
      { url, status: response.status, durationMs: Date.now() - start },
      "CoinMarketCap API call"
    );

    if (response.status === 429) {
      throw new CoinMarketCapError("CoinMarketCap rate limit exceeded", 429);
    }
    if (!response.ok) {
      throw new CoinMarketCapError(
        `CoinMarketCap returned ${response.status}`,
        response.status
      );
    }

    const body = (await response.json()) as CmcQuotesResponse;

    if (body.status?.error_code && body.status.error_code !== 0) {
      throw new CoinMarketCapError(
        body.status.error_message ?? "CoinMarketCap API error",
        body.status.error_code
      );
    }

    const results: CmcPriceResult[] = [];
    for (const [sym, coin] of Object.entries(body.data ?? {})) {
      const q = coin.quote?.USD;
      if (!q) continue;
      results.push({
        symbol: sym.toUpperCase(),
        price: q.price,
        volume24h: q.volume_24h ?? 0,
        marketCap: q.market_cap ?? 0,
        change24h: q.percent_change_24h ?? 0,
        lastUpdated: q.last_updated,
        source: SOURCE_NAME,
      });
    }

    logger.info(
      { fetched: results.length, requested: symbols.length },
      "CoinMarketCap prices fetched"
    );

    return results;
  }
}
