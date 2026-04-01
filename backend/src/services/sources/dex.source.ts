/**
 * DEX Aggregator price source.
 *
 * Fetches on-chain prices from decentralised exchanges:
 *   - Stellar DEX  — via the Horizon order-book endpoint (native integration)
 *   - Jupiter      — Solana DEX aggregator price API
 *   - 1inch        — EVM DEX aggregator price API
 *
 * Results represent the mid-price of the best available order on each DEX.
 * All prices are quoted in USD.
 */

import { redis } from "../../utils/redis.js";
import { logger } from "../../utils/logger.js";
import { withRetry } from "../../utils/retry.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SOURCE_NAME = "DEX";
const CACHE_PREFIX = "dex:price:";
const CACHE_TTL_SEC = 30;
const TIMEOUT_MS = 6_000;

const STELLAR_HORIZON = "https://horizon.stellar.org";
const JUPITER_PRICE_URL = "https://price.jup.ag/v6/price";
const ONEINCH_PRICE_URL = "https://api.1inch.dev/price/v1.1/1"; // Ethereum mainnet

/** Stellar asset descriptions: { code, issuer } for known bridged assets */
const STELLAR_ASSETS: Record<string, { code: string; issuer: string }> = {
  USDC: {
    code: "USDC",
    issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
  },
  USDT: {
    code: "USDT",
    issuer: "GCQTGZQQ5G4PTM2GL7CDIFKUBIPEC52BROAQIAPW53XBRJVN6ZJVTG6V",
  },
  WBTC: {
    code: "WBTC",
    issuer: "GDPJALI4AZKUU2W426U5WKMAT6CN3AJRPIIRYR2YM54TL2GDWO5O2MZM",
  },
  WETH: {
    code: "WETH",
    issuer: "GDLW7I64UY2HG4PWIX53FMDJ37OVOLIHGTW7IJGQ6YIQUWKP3RJPZXR",
  },
};

/** Jupiter token mint addresses for Solana */
const JUPITER_MINTS: Record<string, string> = {
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  WBTC: "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh",
  WETH: "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs",
};

/** 1inch token contract addresses on Ethereum */
const ONEINCH_CONTRACTS: Record<string, string> = {
  USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  WBTC: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
  WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class DexSourceError extends Error {
  constructor(
    message: string,
    public readonly dex: string
  ) {
    super(message);
    this.name = "DexSourceError";
  }
}

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

async function fetchJson<T>(
  url: string,
  headers: Record<string, string> = {}
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", ...headers },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new DexSourceError(`HTTP ${res.status}`, url);
    }
    return res.json() as Promise<T>;
  } catch (err) {
    if (err instanceof DexSourceError) throw err;
    const isTimeout = err instanceof Error && err.name === "AbortError";
    throw new DexSourceError(
      isTimeout ? "Request timed out" : String(err),
      url
    );
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DexPriceResult {
  symbol: string;
  price: number;
  dex: string;
  source: string;
}

// ---------------------------------------------------------------------------
// DexSource
// ---------------------------------------------------------------------------

export class DexSource {
  static supports(symbol: string): boolean {
    const upper = symbol.toUpperCase();
    return (
      upper in STELLAR_ASSETS ||
      upper in JUPITER_MINTS ||
      upper in ONEINCH_CONTRACTS
    );
  }

  async getPrices(symbols: string[]): Promise<DexPriceResult[]> {
    const upper = symbols.map((s) => s.toUpperCase());
    const cacheKey = `${CACHE_PREFIX}${upper.sort().join(",")}`;

    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        logger.debug({ cacheKey }, "DEX price cache hit");
        return JSON.parse(cached) as DexPriceResult[];
      }
    } catch (err) {
      logger.warn({ err }, "DEX cache read error");
    }

    const [stellarPrices, jupiterPrices, oneinchPrices] = await Promise.allSettled([
      this.fetchStellarPrices(upper.filter((s) => s in STELLAR_ASSETS)),
      this.fetchJupiterPrices(upper.filter((s) => s in JUPITER_MINTS)),
      this.fetchOneInchPrices(upper.filter((s) => s in ONEINCH_CONTRACTS)),
    ]);

    const results: DexPriceResult[] = [
      ...(stellarPrices.status === "fulfilled" ? stellarPrices.value : []),
      ...(jupiterPrices.status === "fulfilled" ? jupiterPrices.value : []),
      ...(oneinchPrices.status === "fulfilled" ? oneinchPrices.value : []),
    ];

    if (stellarPrices.status === "rejected") {
      logger.warn({ err: stellarPrices.reason }, "Stellar DEX fetch failed");
    }
    if (jupiterPrices.status === "rejected") {
      logger.warn({ err: jupiterPrices.reason }, "Jupiter fetch failed");
    }
    if (oneinchPrices.status === "rejected") {
      logger.warn({ err: oneinchPrices.reason }, "1inch fetch failed");
    }

    try {
      await redis.set(cacheKey, JSON.stringify(results), "EX", CACHE_TTL_SEC);
    } catch (err) {
      logger.warn({ err }, "DEX cache write error");
    }

    return results;
  }

  async getPrice(symbol: string): Promise<DexPriceResult | null> {
    const results = await this.getPrices([symbol]);
    return results.find((r) => r.symbol === symbol.toUpperCase()) ?? null;
  }

  // ---------------------------------------------------------------------------
  // Stellar DEX (Horizon order-book endpoint)
  // ---------------------------------------------------------------------------

  private async fetchStellarPrices(
    symbols: string[]
  ): Promise<DexPriceResult[]> {
    if (symbols.length === 0) return [];

    const results: DexPriceResult[] = [];

    await Promise.allSettled(
      symbols.map(async (symbol) => {
        const asset = STELLAR_ASSETS[symbol];
        if (!asset) return;

        const url = `${STELLAR_HORIZON}/order_book?selling_asset_type=native&buying_asset_type=credit_alphanum4&buying_asset_code=${asset.code}&buying_asset_issuer=${asset.issuer}&limit=1`;

        try {
          const book = await withRetry(
            () => fetchJson<{ bids: { price: string }[]; asks: { price: string }[] }>(url),
            2,
            300
          );

          const bid = parseFloat(book.bids?.[0]?.price ?? "0");
          const ask = parseFloat(book.asks?.[0]?.price ?? "0");

          if (!bid && !ask) return;

          // Mid-price in XLM/asset; we approximate USD via a known XLM price
          // For production: fetch XLM/USD separately. Here we use a placeholder.
          const xlmUsd = await this.fetchXlmUsd();
          const midXlm = bid && ask ? (bid + ask) / 2 : bid || ask;
          const priceUsd = midXlm > 0 ? (1 / midXlm) * xlmUsd : 0;

          if (priceUsd > 0) {
            results.push({
              symbol,
              price: priceUsd,
              dex: "Stellar DEX",
              source: SOURCE_NAME,
            });
          }
        } catch (err) {
          logger.warn({ symbol, err }, "Stellar DEX order book fetch failed");
        }
      })
    );

    return results;
  }

  /** Fetch XLM/USD price from Stellar DEX (XLM vs USDC) */
  private async fetchXlmUsd(): Promise<number> {
    const cacheKey = "dex:xlm-usd";
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return parseFloat(cached);
    } catch {
      // ignore
    }

    const usdc = STELLAR_ASSETS["USDC"];
    const url = `${STELLAR_HORIZON}/order_book?selling_asset_type=native&buying_asset_type=credit_alphanum4&buying_asset_code=${usdc.code}&buying_asset_issuer=${usdc.issuer}&limit=1`;

    try {
      const book = await fetchJson<{ bids: { price: string }[]; asks: { price: string }[] }>(url);
      const bid = parseFloat(book.bids?.[0]?.price ?? "0");
      const ask = parseFloat(book.asks?.[0]?.price ?? "0");
      const mid = bid && ask ? (bid + ask) / 2 : bid || ask;
      if (mid > 0) {
        const xlmUsd = 1 / mid;
        await redis.set(cacheKey, String(xlmUsd), "EX", 30).catch(() => undefined);
        return xlmUsd;
      }
    } catch {
      // fallback
    }

    return 0.12; // emergency fallback
  }

  // ---------------------------------------------------------------------------
  // Jupiter (Solana)
  // ---------------------------------------------------------------------------

  private async fetchJupiterPrices(
    symbols: string[]
  ): Promise<DexPriceResult[]> {
    if (symbols.length === 0) return [];

    const ids = symbols.map((s) => JUPITER_MINTS[s]).filter(Boolean);
    if (ids.length === 0) return [];

    const url = `${JUPITER_PRICE_URL}?ids=${ids.join(",")}&vsToken=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`;

    const body = await withRetry(
      () =>
        fetchJson<{
          data: Record<string, { id: string; mintSymbol: string; price: number }>;
        }>(url),
      2,
      300
    );

    const results: DexPriceResult[] = [];
    for (const [, symbol] of symbols.entries()) {
      const mint = JUPITER_MINTS[symbol];
      const item = body.data?.[mint];
      if (!item?.price) continue;
      results.push({
        symbol,
        price: item.price,
        dex: "Jupiter",
        source: SOURCE_NAME,
      });
    }

    return results;
  }

  // ---------------------------------------------------------------------------
  // 1inch (Ethereum)
  // ---------------------------------------------------------------------------

  private async fetchOneInchPrices(
    symbols: string[]
  ): Promise<DexPriceResult[]> {
    if (symbols.length === 0) return [];

    const apiKey = process.env.ONEINCH_API_KEY;
    if (!apiKey) {
      logger.debug("1inch API key not configured — skipping");
      return [];
    }

    const addresses = symbols
      .map((s) => ONEINCH_CONTRACTS[s])
      .filter(Boolean);
    if (addresses.length === 0) return [];

    const url = `${ONEINCH_PRICE_URL}/${addresses.join(",")}?currency=USD`;
    const headers = { Authorization: `Bearer ${apiKey}` };

    const body = await withRetry(
      () => fetchJson<Record<string, string>>(url, headers),
      2,
      300
    );

    const results: DexPriceResult[] = [];
    for (const symbol of symbols) {
      const addr = ONEINCH_CONTRACTS[symbol]?.toLowerCase();
      const priceStr = addr ? body[addr] : undefined;
      if (!priceStr) continue;
      const price = parseFloat(priceStr);
      if (!isNaN(price) && price > 0) {
        results.push({ symbol, price, dex: "1inch", source: SOURCE_NAME });
      }
    }

    return results;
  }
}
