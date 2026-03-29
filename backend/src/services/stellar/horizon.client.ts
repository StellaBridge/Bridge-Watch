/**
 * Stellar Horizon API client wrapper
 *
 * Provides connection management, request batching, rate limiting,
 * retry logic, streaming support, and metrics for all Horizon interactions.
 */

import * as StellarSdk from "@stellar/stellar-sdk";
import { config } from "../../config/index.js";
import { logger } from "../../utils/logger.js";
import { redis } from "../../utils/redis.js";
import { withRetry } from "../../utils/retry.js";

// ─── Network constants ────────────────────────────────────────────────────────

const HORIZON_URLS: Record<string, string> = {
  mainnet: "https://horizon.stellar.org",
  testnet: "https://horizon-testnet.stellar.org",
};

const HORIZON_RATE_LIMIT_PER_SECOND = 10; // Horizon public limit ~10 req/s per IP
const RATE_LIMIT_WINDOW_MS = 1_000;
const BATCH_FLUSH_INTERVAL_MS = 50;
const BATCH_MAX_SIZE = 20;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 500;

// ─── Error types ──────────────────────────────────────────────────────────────

export class HorizonError extends Error {
  constructor(
    message: string,
    public readonly code: HorizonErrorCode,
    public readonly cause?: unknown,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = "HorizonError";
  }
}

export type HorizonErrorCode =
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "NOT_FOUND"
  | "NETWORK_ERROR"
  | "INVALID_RESPONSE"
  | "STREAM_ERROR"
  | "BATCH_ERROR"
  | "UNKNOWN";

// ─── Public types ─────────────────────────────────────────────────────────────

export type HorizonNetwork = "testnet" | "mainnet";

export interface HorizonClientOptions {
  network?: HorizonNetwork;
  horizonUrls?: string[];
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  /** Override the Horizon.Server factory (useful for testing) */
  createServer?: (url: string) => StellarSdk.Horizon.Server;
}

export interface AccountInfo {
  id: string;
  sequence: string;
  balances: Array<{
    asset: string;
    balance: string;
    limit?: string;
  }>;
  subentryCount: number;
  lastModifiedLedger: number;
  thresholds: any;
  flags: any;
}

export interface AssetInfo {
  assetType: string;
  assetCode: string;
  assetIssuer: string;
  amount: string;
  numAccounts: number;
  numClaimableBalances: number;
  numLiquidityPools: number;
  claimableBalancesAmount: string;
  liquidityPoolsAmount: string;
  contractsAmount: string;
  numContracts: number;
  flags: {
    authRequired: boolean;
    authRevocable: boolean;
    authImmutable: boolean;
    authClawbackEnabled: boolean;
  };
}

export interface OrderbookInfo {
  base: { assetType: string; assetCode?: string; assetIssuer?: string };
  counter: { assetType: string; assetCode?: string; assetIssuer?: string };
  bids: Array<{ price: string; amount: string }>;
  asks: Array<{ price: string; amount: string }>;
  baseVolume?: string;
  counterVolume?: string;
}

export interface LiquidityPoolInfo {
  id: string;
  feeBp: number;
  totalTrustlines: number;
  totalShares: string;
  reserves: Array<{ asset: string; amount: string }>;
  lastModifiedLedger: number;
}

export interface TransactionInfo {
  id: string;
  hash: string;
  ledger: number;
  createdAt: string;
  sourceAccount: string;
  fee: string;
  operationCount: number;
  successful: boolean;
  memo?: string;
  memoType?: string;
}

export interface HorizonMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  rateLimitedRequests: number;
  averageLatencyMs: number;
  activeStreams: number;
  batchesProcessed: number;
  currentServer: string;
}

// ─── Internal types ───────────────────────────────────────────────────────────

interface BatchEntry<T> {
  key: string;
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

interface MetricsState {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  rateLimitedRequests: number;
  totalLatencyMs: number;
  activeStreams: number;
  batchesProcessed: number;
}

// ─── Rate limiter (token bucket via Redis) ────────────────────────────────────

async function acquireRateLimit(clientId: string): Promise<void> {
  const key = `horizon:ratelimit:${clientId}`;
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;

  // Sliding window counter using Redis sorted set
  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(key, "-inf", windowStart);
  pipeline.zadd(key, now, `${now}-${Math.random()}`);
  pipeline.zcard(key);
  pipeline.pexpire(key, RATE_LIMIT_WINDOW_MS * 2);

  const results = await pipeline.exec();
  const count = (results?.[2]?.[1] as number) ?? 0;

  if (count > HORIZON_RATE_LIMIT_PER_SECOND) {
    const waitMs = RATE_LIMIT_WINDOW_MS - (now - windowStart) + 10;
    logger.debug({ count, waitMs }, "Horizon rate limit reached, backing off");
    await new Promise((r) => setTimeout(r, waitMs));
  }
}

// ─── Main client ──────────────────────────────────────────────────────────────

export class HorizonClient {
  private readonly servers: StellarSdk.Horizon.Server[];
  private readonly urls: string[];
  private currentServerIndex = 0;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly retryDelayMs: number;
  private readonly network: HorizonNetwork;
  private readonly clientId: string;

  // Batch queue: key → pending entries
  private readonly batchQueue = new Map<string, BatchEntry<unknown>[]>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private batchTimer: ReturnType<typeof setTimeout> | null = null;

  // Metrics
  private readonly metrics: MetricsState = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    rateLimitedRequests: 0,
    totalLatencyMs: 0,
    activeStreams: 0,
    batchesProcessed: 0,
  };

  // Active stream closers
  private readonly activeStreams = new Set<() => void>();

  constructor(options: HorizonClientOptions = {}) {
    this.network = options.network ?? (config.STELLAR_NETWORK as HorizonNetwork);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.retries = options.retries ?? DEFAULT_RETRIES;
    this.retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    this.clientId = `horizon-${this.network}-${process.pid}`;

    const defaultUrl = HORIZON_URLS[this.network] ?? config.STELLAR_HORIZON_URL;
    const rawUrls = options.horizonUrls?.length
      ? options.horizonUrls
      : [config.STELLAR_HORIZON_URL ?? defaultUrl];

    this.urls = rawUrls.filter(Boolean);

    const factory =
      options.createServer ??
      ((url: string) =>
        new StellarSdk.Horizon.Server(url, {
          allowHttp: config.NODE_ENV === "development",
        }));

    this.servers = this.urls.map(factory);

    logger.info(
      { network: this.network, urls: this.urls },
      "HorizonClient initialised",
    );
  }

  // ─── Connection management ──────────────────────────────────────────────────

  private get server(): StellarSdk.Horizon.Server {
    return this.servers[this.currentServerIndex];
  }

  private rotateServer(): void {
    this.currentServerIndex =
      (this.currentServerIndex + 1) % this.servers.length;
    logger.warn(
      { newUrl: this.urls[this.currentServerIndex] },
      "Rotated to next Horizon server",
    );
  }

  // ─── Core request executor ──────────────────────────────────────────────────

  private async execute<T>(
    label: string,
    fn: (server: StellarSdk.Horizon.Server) => Promise<T>,
  ): Promise<T> {
    await acquireRateLimit(this.clientId);

    const start = Date.now();
    this.metrics.totalRequests++;

    const attempt = async (): Promise<T> => {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new HorizonError(
                `Horizon request "${label}" timed out after ${this.timeoutMs}ms`,
                "TIMEOUT",
              ),
            ),
          this.timeoutMs,
        ),
      );

      try {
        return await Promise.race([fn(this.server), timeoutPromise]);
      } catch (err) {
        const status = (err as { response?: { status?: number } })?.response?.status;

        if (status === 404) {
          throw new HorizonError(`${label}: resource not found`, "NOT_FOUND", err, 404);
        }
        if (status === 429) {
          this.metrics.rateLimitedRequests++;
          throw new HorizonError(`${label}: rate limited by Horizon`, "RATE_LIMITED", err, 429);
        }
        if (err instanceof HorizonError) throw err;

        // Try next server on network errors
        if (this.servers.length > 1) this.rotateServer();

        throw new HorizonError(
          `${label}: ${(err as Error).message ?? "unknown error"}`,
          "NETWORK_ERROR",
          err,
          status,
        );
      }
    };

    try {
      const result = await withRetry(attempt, this.retries, this.retryDelayMs);
      this.metrics.successfulRequests++;
      this.metrics.totalLatencyMs += Date.now() - start;
      logger.debug({ label, latencyMs: Date.now() - start }, "Horizon request succeeded");
      return result;
    } catch (err) {
      this.metrics.failedRequests++;
      logger.error({ label, err }, "Horizon request failed after retries");
      throw err;
    }
  }

  // ─── Batch support ──────────────────────────────────────────────────────────

  /**
   * Enqueue a request into the batch queue. Requests with the same key are
   * deduplicated — only one network call is made and the result is shared.
   */
  private enqueue<T>(key: string, execute: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const entry: BatchEntry<T> = {
        key,
        execute: execute as () => Promise<unknown>,
        resolve: resolve as (v: unknown) => void,
        reject,
      } as unknown as BatchEntry<T>;

      const existing = this.batchQueue.get(key);
      if (existing) {
        // Deduplicate: piggyback on the first entry's promise
        existing.push(entry as unknown as BatchEntry<unknown>);
      } else {
        this.batchQueue.set(key, [entry as unknown as BatchEntry<unknown>]);
      }

      if (!this.batchTimer) {
        this.batchTimer = setTimeout(() => this.flushBatch(), BATCH_FLUSH_INTERVAL_MS);
      }

      // Flush early if batch is full
      if (this.batchQueue.size >= BATCH_MAX_SIZE) {
        if (this.batchTimer) clearTimeout(this.batchTimer);
        this.batchTimer = null;
        void this.flushBatch();
      }
    });
  }

  private async flushBatch(): Promise<void> {
    this.batchTimer = null;
    if (this.batchQueue.size === 0) return;

    const snapshot = new Map(this.batchQueue);
    this.batchQueue.clear();
    this.metrics.batchesProcessed++;

    logger.debug({ batchSize: snapshot.size }, "Flushing Horizon batch");

    await Promise.allSettled(
      Array.from(snapshot.entries()).map(async ([, entries]) => {
        try {
          const result = await entries[0].execute();
          for (const e of entries) e.resolve(result);
        } catch (err) {
          for (const e of entries) e.reject(err);
        }
      }),
    );
  }

  // ─── Account queries ────────────────────────────────────────────────────────

  async getAccount(accountId: string): Promise<AccountInfo> {
    return this.enqueue(`account:${accountId}`, () =>
      this.execute(`getAccount(${accountId})`, async (server) => {
        const raw = await server.loadAccount(accountId);
        return {
          id: raw.id,
          sequence: raw.sequence,
          balances: raw.balances.map(
            (b: StellarSdk.Horizon.HorizonApi.BalanceLine) => ({
              asset:
                b.asset_type === "native"
                  ? "XLM"
                  : `${(b as StellarSdk.Horizon.HorizonApi.BalanceLine<"credit_alphanum4" | "credit_alphanum12">).asset_code}:${(b as StellarSdk.Horizon.HorizonApi.BalanceLine<"credit_alphanum4" | "credit_alphanum12">).asset_issuer}`,
              balance: b.balance,
              limit:
                b.asset_type !== "native"
                  ? (b as StellarSdk.Horizon.HorizonApi.BalanceLine<"credit_alphanum4" | "credit_alphanum12">).limit
                  : undefined,
            }),
          ),
          subentryCount: raw.subentry_count,
          lastModifiedLedger: raw.last_modified_ledger,
          thresholds: raw.thresholds,
          flags: raw.flags,
        } satisfies AccountInfo;
      }),
    ) as Promise<AccountInfo>;
  }

  async getAccountTransactions(
    accountId: string,
    limit = 20,
    cursor?: string,
  ): Promise<TransactionInfo[]> {
    return this.execute(
      `getAccountTransactions(${accountId})`,
      async (server) => {
        let builder = server
          .transactions()
          .forAccount(accountId)
          .limit(limit)
          .order("desc");
        if (cursor) builder = builder.cursor(cursor);
        const page = await builder.call();
        return page.records.map(mapTransaction);
      },
    );
  }

  // ─── Asset queries ──────────────────────────────────────────────────────────

  async getAsset(assetCode: string, issuer: string): Promise<AssetInfo | null> {
    return this.enqueue(`asset:${assetCode}:${issuer}`, () =>
      this.execute(`getAsset(${assetCode})`, async (server) => {
        const page = await server
          .assets()
          .forCode(assetCode)
          .forIssuer(issuer)
          .call();
        if (!page.records.length) return null;
        return mapAsset(page.records[0]);
      }),
    ) as Promise<AssetInfo | null>;
  }

  async getAssetSupply(assetCode: string, issuer: string): Promise<number> {
    const asset = await this.getAsset(assetCode, issuer);
    return asset ? parseFloat(asset.amount) : 0;
  }

  async getAssets(assetCode: string, limit = 10): Promise<AssetInfo[]> {
    return this.execute(`getAssets(${assetCode})`, async (server) => {
      const page = await server.assets().forCode(assetCode).limit(limit).call();
      return page.records.map(mapAsset);
    });
  }

  // ─── Orderbook queries ──────────────────────────────────────────────────────

  async getOrderbook(
    baseCode: string,
    baseIssuer: string | null,
    counterCode: string,
    counterIssuer: string | null,
    limit = 20,
  ): Promise<OrderbookInfo> {
    const base =
      baseCode === "XLM" || !baseIssuer
        ? StellarSdk.Asset.native()
        : new StellarSdk.Asset(baseCode, baseIssuer);
    const counter =
      counterCode === "XLM" || !counterIssuer
        ? StellarSdk.Asset.native()
        : new StellarSdk.Asset(counterCode, counterIssuer);

    const key = `orderbook:${base.toString()}:${counter.toString()}`;
    return this.enqueue(key, () =>
      this.execute(`getOrderbook(${base}/${counter})`, async (server) => {
        const raw = await server.orderbook(base, counter).limit(limit).call();
        return mapOrderbook(raw);
      }),
    ) as Promise<OrderbookInfo>;
  }

  // ─── Liquidity pool queries ─────────────────────────────────────────────────

  async getLiquidityPool(poolId: string): Promise<LiquidityPoolInfo | null> {
    return this.enqueue(`pool:${poolId}`, () =>
      this.execute(`getLiquidityPool(${poolId})`, async (server) => {
        try {
          const raw = await server.liquidityPools().liquidityPoolId(poolId).call();
          return mapLiquidityPool(raw);
        } catch (err) {
          if ((err as HorizonError).code === "NOT_FOUND") return null;
          throw err;
        }
      }),
    ) as Promise<LiquidityPoolInfo | null>;
  }

  async getLiquidityPoolsForAssets(
    assetA: StellarSdk.Asset,
    assetB: StellarSdk.Asset,
    limit = 10,
  ): Promise<LiquidityPoolInfo[]> {
    const key = `pools:${assetA.toString()}:${assetB.toString()}`;
    return this.enqueue(key, () =>
      this.execute(
        `getLiquidityPoolsForAssets(${assetA}/${assetB})`,
        async (server) => {
          const page = await (server.liquidityPools() as unknown as {
            forReserves: (
              a: StellarSdk.Asset,
              b: StellarSdk.Asset,
            ) => { limit: (n: number) => { call: () => Promise<StellarSdk.Horizon.ServerApi.CollectionPage<StellarSdk.Horizon.ServerApi.LiquidityPoolRecord>> };
            };
          })
            .forReserves(assetA, assetB)
            .limit(limit)
            .call();
          return page.records.map(mapLiquidityPool);
        },
      ),
    ) as Promise<LiquidityPoolInfo[]>;
  }

  // ─── Transaction queries ────────────────────────────────────────────────────

  async getTransaction(hash: string): Promise<TransactionInfo | null> {
    return this.enqueue(`tx:${hash}`, () =>
      this.execute(`getTransaction(${hash})`, async (server) => {
        try {
          const raw = await server.transactions().transaction(hash).call();
          return mapTransaction(raw);
        } catch (err) {
          if ((err as HorizonError).code === "NOT_FOUND") return null;
          throw err;
        }
      }),
    ) as Promise<TransactionInfo | null>;
  }

  async getTransactions(limit = 20, cursor?: string): Promise<TransactionInfo[]> {
    return this.execute("getTransactions", async (server) => {
      let builder = server.transactions().limit(limit).order("desc");
      if (cursor) builder = builder.cursor(cursor);
      const page = await builder.call();
      return page.records.map(mapTransaction);
    });
  }

  // ─── Batch helpers ──────────────────────────────────────────────────────────

  /**
   * Fetch multiple accounts in a single batched round-trip window.
   */
  async batchGetAccounts(accountIds: string[]): Promise<Array<AccountInfo | null>> {
    return Promise.all(
      accountIds.map((id) =>
        this.getAccount(id).catch((err) => {
          if ((err as HorizonError).code === "NOT_FOUND") return null;
          throw err;
        }),
      ),
    );
  }

  /**
   * Fetch multiple assets in a single batched round-trip window.
   */
  async batchGetAssets(
    pairs: Array<{ code: string; issuer: string }>,
  ): Promise<Array<AssetInfo | null>> {
    return Promise.all(pairs.map(({ code, issuer }) => this.getAsset(code, issuer)));
  }

  // ─── Streaming ──────────────────────────────────────────────────────────────

  /**
   * Stream real-time payments. Returns a closer function.
   */
  streamPayments(
    onPayment: (payment: StellarSdk.Horizon.ServerApi.PaymentOperationRecord) => void,
    onError?: (err: HorizonError) => void,
    cursor = "now",
  ): () => void {
    this.metrics.activeStreams++;

    const close = this.server
      .payments()
      .cursor(cursor)
      .stream({
        onmessage: ((payment: StellarSdk.Horizon.ServerApi.PaymentOperationRecord) => {
          onPayment(payment);
        }) as any,
        onerror: ((err: Error) => {
          const wrapped = new HorizonError(
            `Payment stream error: ${(err as Error).message}`,
            "STREAM_ERROR",
            err,
          );
          logger.error({ err }, "Horizon payment stream error");
          onError?.(wrapped);
        }) as any,
      });

    const closer = () => {
      close();
      this.metrics.activeStreams--;
      this.activeStreams.delete(closer);
    };

    this.activeStreams.add(closer);
    logger.info({ cursor }, "Started Horizon payment stream");
    return closer;
  }

  /**
   * Stream transactions for a specific account.
   */
  streamAccountTransactions(
    accountId: string,
    onTransaction: (tx: StellarSdk.Horizon.ServerApi.TransactionRecord) => void,
    onError?: (err: HorizonError) => void,
    cursor = "now",
  ): () => void {
    this.metrics.activeStreams++;

    const close = this.server
      .transactions()
      .forAccount(accountId)
      .cursor(cursor)
      .stream({
        onmessage: ((tx: StellarSdk.Horizon.ServerApi.TransactionRecord) => {
          onTransaction(tx);
        }) as any,
        onerror: ((err: Error) => {
          const wrapped = new HorizonError(
            `Transaction stream error for ${accountId}: ${(err as Error).message}`,
            "STREAM_ERROR",
            err,
          );
          logger.error({ accountId, err }, "Horizon transaction stream error");
          onError?.(wrapped);
        }) as any,
      });

    const closer = () => {
      close();
      this.metrics.activeStreams--;
      this.activeStreams.delete(closer);
    };

    this.activeStreams.add(closer);
    logger.info({ accountId, cursor }, "Started Horizon account transaction stream");
    return closer;
  }

  /**
   * Stream ledger close events.
   */
  streamLedgers(
    onLedger: (ledger: StellarSdk.Horizon.ServerApi.LedgerRecord) => void,
    onError?: (err: HorizonError) => void,
    cursor = "now",
  ): () => void {
    this.metrics.activeStreams++;

    const close = this.server
      .ledgers()
      .cursor(cursor)
      .stream({
        onmessage: ((ledger: StellarSdk.Horizon.ServerApi.LedgerRecord) => {
          onLedger(ledger);
        }) as any,
        onerror: ((err: Error) => {
          const wrapped = new HorizonError(
            `Ledger stream error: ${(err as Error).message}`,
            "STREAM_ERROR",
            err,
          );
          logger.error({ err }, "Horizon ledger stream error");
          onError?.(wrapped);
        }) as any,
      });

    const closer = () => {
      close();
      this.metrics.activeStreams--;
      this.activeStreams.delete(closer);
    };

    this.activeStreams.add(closer);
    logger.info({ cursor }, "Started Horizon ledger stream");
    return closer;
  }

  // ─── Metrics ────────────────────────────────────────────────────────────────

  getMetrics(): HorizonMetrics {
    const { totalRequests, successfulRequests, failedRequests, rateLimitedRequests, totalLatencyMs, activeStreams, batchesProcessed } = this.metrics;
    return {
      totalRequests,
      successfulRequests,
      failedRequests,
      rateLimitedRequests,
      averageLatencyMs:
        successfulRequests > 0 ? totalLatencyMs / successfulRequests : 0,
      activeStreams,
      batchesProcessed,
      currentServer: this.urls[this.currentServerIndex],
    };
  }

  resetMetrics(): void {
    Object.assign(this.metrics, {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      rateLimitedRequests: 0,
      totalLatencyMs: 0,
      batchesProcessed: 0,
    });
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  /** Close all active streams and flush pending batches. */
  async destroy(): Promise<void> {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
      await this.flushBatch();
    }
    for (const close of this.activeStreams) close();
    logger.info("HorizonClient destroyed");
  }
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

function mapAsset(raw: StellarSdk.Horizon.ServerApi.AssetRecord): AssetInfo {
  return {
    assetType: raw.asset_type,
    assetCode: raw.asset_code,
    assetIssuer: raw.asset_issuer,
    amount: raw.amount,
    numAccounts: raw.num_accounts,
    numClaimableBalances: raw.num_claimable_balances,
    numLiquidityPools: raw.num_liquidity_pools,
    claimableBalancesAmount: raw.claimable_balances_amount,
    liquidityPoolsAmount: raw.liquidity_pools_amount,
    contractsAmount: raw.contracts_amount,
    numContracts: raw.num_contracts,
    flags: {
      authRequired: raw.flags.auth_required,
      authRevocable: raw.flags.auth_revocable,
      authImmutable: raw.flags.auth_immutable,
      authClawbackEnabled: raw.flags.auth_clawback_enabled,
    },
  };
}

function mapOrderbook(
  raw: StellarSdk.Horizon.ServerApi.OrderbookRecord,
): OrderbookInfo {
  return {
    base: (raw.base as unknown) as OrderbookInfo["base"],
    counter: (raw.counter as unknown) as OrderbookInfo["counter"],
    bids: raw.bids.map((b: { price: string; amount: string }) => ({ price: b.price, amount: b.amount })),
    asks: raw.asks.map((a: { price: string; amount: string }) => ({ price: a.price, amount: a.amount })),
  };
}

function mapLiquidityPool(
  raw: StellarSdk.Horizon.ServerApi.LiquidityPoolRecord,
): LiquidityPoolInfo {
  return {
    id: raw.id as string,
    feeBp: Number((raw.fee_bp as unknown)),
    totalTrustlines: Number((raw.total_trustlines as unknown)),
    totalShares: raw.total_shares as string,
    reserves: raw.reserves.map((r: { asset: string; amount: string }) => ({
      asset: r.asset,
      amount: r.amount,
    })),
    lastModifiedLedger: (raw as any).last_modified_ledger || 0,
  };
}

function mapTransaction(
  raw: StellarSdk.Horizon.ServerApi.TransactionRecord,
): TransactionInfo {
  return {
    id: raw.id as string,
    hash: raw.hash as unknown as string,
    ledger: Number((raw as any).ledger),
    createdAt: raw.created_at as string,
    sourceAccount: raw.source_account as string,
    fee: (raw.fee_charged as unknown as string),
    operationCount: raw.operation_count as number,
    successful: raw.successful as boolean,
    memo: raw.memo as string,
    memoType: String((raw.memo_type as unknown)),
  };
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _defaultClient: HorizonClient | null = null;

export function getHorizonClient(options?: HorizonClientOptions): HorizonClient {
  if (!_defaultClient) {
    _defaultClient = new HorizonClient(options);
  }
  return _defaultClient;
}

/** Replace the singleton (useful in tests). */
export function setHorizonClient(client: HorizonClient): void {
  _defaultClient = client;
}
