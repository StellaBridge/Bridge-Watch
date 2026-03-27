import { ethers } from "ethers";
import { logger } from "../../utils/logger.js";
import { withRetry } from "../../utils/retry.js";
import { ERC20_ABI, BRIDGE_ABI } from "./abis.js";
import type {
  ChainId,
  ChainConfig,
  TokenInfo,
  TokenBalance,
  BridgeReserves,
  EventLogQuery,
  ParsedEvent,
  BatchCall,
  RpcClientOptions,
  ProviderState,
} from "./types.js";

// ─── Default chain configs ────────────────────────────────────────────────────

const DEFAULT_CHAINS: Record<ChainId, Omit<ChainConfig, "rpcUrls">> = {
  ethereum: { chainId: "ethereum", name: "Ethereum Mainnet", blockTime: 12, rateLimit: 10 },
  polygon:  { chainId: "polygon",  name: "Polygon PoS",      blockTime: 2,  rateLimit: 10 },
  base:     { chainId: "base",     name: "Base",             blockTime: 2,  rateLimit: 10 },
};

// ─── EthereumRpcClient ────────────────────────────────────────────────────────

export class EthereumRpcClient {
  private readonly chains = new Map<ChainId, ChainConfig>();
  private readonly state   = new Map<ChainId, ProviderState>();
  private readonly opts: Required<RpcClientOptions>;

  constructor(
    chainConfigs: ChainConfig[],
    opts: RpcClientOptions = {}
  ) {
    this.opts = {
      maxRetries:       opts.maxRetries       ?? 3,
      retryDelayMs:     opts.retryDelayMs     ?? 1000,
      requestTimeoutMs: opts.requestTimeoutMs ?? 10_000,
    };

    for (const cfg of chainConfigs) {
      if (!cfg.rpcUrls.length) throw new Error(`No RPC URLs for chain ${cfg.chainId}`);
      this.chains.set(cfg.chainId, cfg);
      this.state.set(cfg.chainId, {
        providers:           cfg.rpcUrls.map((url) => new ethers.JsonRpcProvider(url)),
        activeIndex:         0,
        lastBlockNumber:     0,
        lastBlockTime:       0,
        requestCount:        0,
        lastRateLimitReset:  Date.now(),
      });
    }
  }

  // ─── Provider management ───────────────────────────────────────────────────

  /** Returns the active provider for a chain, failing over on error. */
  private getProvider(chainId: ChainId): ethers.JsonRpcProvider {
    const s = this.requireState(chainId);
    return s.providers[s.activeIndex];
  }

  /** Rotate to the next available provider for a chain. */
  private failover(chainId: ChainId): void {
    const s = this.requireState(chainId);
    const next = (s.activeIndex + 1) % s.providers.length;
    if (next === s.activeIndex) {
      logger.error({ chainId }, "All RPC providers exhausted");
      return;
    }
    logger.warn({ chainId, from: s.activeIndex, to: next }, "Failing over to next RPC provider");
    s.activeIndex = next;
  }

  /** Enforce per-chain rate limit (token bucket, 1-second window). */
  private async throttle(chainId: ChainId): Promise<void> {
    const cfg = this.requireChain(chainId);
    const s   = this.requireState(chainId);
    const now = Date.now();

    if (now - s.lastRateLimitReset >= 1000) {
      s.requestCount        = 0;
      s.lastRateLimitReset  = now;
    }

    if (s.requestCount >= cfg.rateLimit) {
      const wait = 1000 - (now - s.lastRateLimitReset);
      await new Promise((r) => setTimeout(r, wait));
      s.requestCount        = 0;
      s.lastRateLimitReset  = Date.now();
    }

    s.requestCount++;
  }

  /** Execute a provider call with throttling, timeout, retry, and failover. */
  private async call<T>(chainId: ChainId, fn: (p: ethers.JsonRpcProvider) => Promise<T>): Promise<T> {
    await this.throttle(chainId);

    return withRetry(
      async () => {
        const provider = this.getProvider(chainId);
        try {
          return await Promise.race([
            fn(provider),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("RPC request timed out")), this.opts.requestTimeoutMs)
            ),
          ]);
        } catch (err) {
          this.failover(chainId);
          throw err;
        }
      },
      this.opts.maxRetries,
      this.opts.retryDelayMs
    );
  }

  // ─── Block tracking ────────────────────────────────────────────────────────

  async getBlockNumber(chainId: ChainId): Promise<number> {
    const block = await this.call(chainId, (p) => p.getBlockNumber());
    const s = this.requireState(chainId);
    s.lastBlockNumber = block;
    s.lastBlockTime   = Date.now();
    return block;
  }

  async getBlock(chainId: ChainId, blockNumber: number): Promise<ethers.Block | null> {
    return this.call(chainId, (p) => p.getBlock(blockNumber));
  }

  // ─── ERC-20 queries ────────────────────────────────────────────────────────

  async getTokenInfo(chainId: ChainId, tokenAddress: string): Promise<TokenInfo> {
    const provider = this.getProvider(chainId);
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);

    const [totalSupply, decimals, symbol] = await this.call(chainId, () =>
      Promise.all([
        contract.totalSupply() as Promise<bigint>,
        contract.decimals()    as Promise<number>,
        contract.symbol()      as Promise<string>,
      ])
    );

    return { address: tokenAddress, symbol, decimals, totalSupply };
  }

  async getTokenBalance(chainId: ChainId, tokenAddress: string, holder: string): Promise<TokenBalance> {
    const provider = this.getProvider(chainId);
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);

    const [balance, decimals] = await this.call(chainId, () =>
      Promise.all([
        contract.balanceOf(holder) as Promise<bigint>,
        contract.decimals()        as Promise<number>,
      ])
    );

    return {
      address:   tokenAddress,
      holder,
      balance,
      formatted: ethers.formatUnits(balance, decimals),
    };
  }

  // ─── Bridge contract queries ───────────────────────────────────────────────

  async getBridgeReserves(
    chainId: ChainId,
    contractAddress: string,
    tokenAddress: string
  ): Promise<BridgeReserves> {
    const provider = this.getProvider(chainId);
    const bridge   = new ethers.Contract(contractAddress, BRIDGE_ABI, provider);
    const token    = new ethers.Contract(tokenAddress,    ERC20_ABI,  provider);

    const [lockedAmount, decimals, isPaused, blockNumber] = await this.call(chainId, () =>
      Promise.all([
        bridge.lockedAmount(tokenAddress) as Promise<bigint>,
        token.decimals()                  as Promise<number>,
        bridge.isPaused()                 as Promise<boolean>,
        provider.getBlockNumber(),
      ])
    );

    const block = await this.getBlock(chainId, blockNumber);

    return {
      chain:           chainId,
      contractAddress,
      tokenAddress,
      lockedAmount,
      formattedAmount: ethers.formatUnits(lockedAmount, decimals),
      isPaused,
      blockNumber,
      timestamp:       block?.timestamp ?? 0,
    };
  }

  // ─── Event log queries ─────────────────────────────────────────────────────

  async queryEvents(chainId: ChainId, query: EventLogQuery): Promise<ParsedEvent[]> {
    const provider = this.getProvider(chainId);
    const contract = new ethers.Contract(query.contractAddress, query.abi, provider);
    const filter   = contract.filters[query.eventName]?.(...Object.values(query.filters ?? {}));

    if (!filter) throw new Error(`Event ${query.eventName} not found in ABI`);

    const logs = await this.call(chainId, () =>
      contract.queryFilter(filter, query.fromBlock, query.toBlock)
    );

    return logs.map((log) => {
      const parsed = contract.interface.parseLog({ topics: log.topics as string[], data: log.data });
      const args: Record<string, unknown> = {};
      if (parsed) {
        parsed.fragment.inputs.forEach((input, i) => {
          args[input.name] = parsed.args[i];
        });
      }
      return {
        blockNumber:     log.blockNumber,
        blockHash:       log.blockHash,
        transactionHash: log.transactionHash,
        logIndex:        log.index,
        eventName:       query.eventName,
        args,
      };
    });
  }

  /** Query events with block timestamps resolved (extra RPC calls). */
  async queryEventsWithTimestamps(chainId: ChainId, query: EventLogQuery): Promise<ParsedEvent[]> {
    const events = await this.queryEvents(chainId, query);
    const blockNumbers = [...new Set(events.map((e) => e.blockNumber))];

    const blocks = await Promise.all(
      blockNumbers.map((n) => this.getBlock(chainId, n))
    );
    const timestampMap = new Map(
      blockNumbers.map((n, i) => [n, blocks[i]?.timestamp ?? 0])
    );

    return events.map((e) => ({ ...e, timestamp: timestampMap.get(e.blockNumber) }));
  }

  // ─── Request batching ──────────────────────────────────────────────────────

  /** Execute multiple read-only contract calls in parallel (connection-pooled). */
  async batchCall<T = unknown>(chainId: ChainId, calls: BatchCall[]): Promise<T[]> {
    return this.call(chainId, (provider) =>
      Promise.all(
        calls.map(({ contractAddress, abi, method, args = [] }) => {
          const contract = new ethers.Contract(contractAddress, abi, provider);
          return contract[method](...args) as Promise<T>;
        })
      )
    );
  }

  // ─── Historical data ───────────────────────────────────────────────────────

  /**
   * Query events in chunks to avoid RPC block-range limits.
   * Most providers cap at 2000 blocks per eth_getLogs call.
   */
  async queryEventsInRange(
    chainId: ChainId,
    query: Omit<EventLogQuery, "fromBlock" | "toBlock">,
    fromBlock: number,
    toBlock: number,
    chunkSize = 2000
  ): Promise<ParsedEvent[]> {
    const results: ParsedEvent[] = [];

    for (let start = fromBlock; start <= toBlock; start += chunkSize) {
      const end = Math.min(start + chunkSize - 1, toBlock);
      const chunk = await this.queryEvents(chainId, { ...query, fromBlock: start, toBlock: end });
      results.push(...chunk);
    }

    return results;
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private requireChain(chainId: ChainId): ChainConfig {
    const cfg = this.chains.get(chainId);
    if (!cfg) throw new Error(`Chain ${chainId} not configured`);
    return cfg;
  }

  private requireState(chainId: ChainId): ProviderState {
    const s = this.state.get(chainId);
    if (!s) throw new Error(`Chain ${chainId} not configured`);
    return s;
  }

  /** Cached last-known block number (no RPC call). */
  getLastKnownBlock(chainId: ChainId): number {
    return this.requireState(chainId).lastBlockNumber;
  }

  getSupportedChains(): ChainId[] {
    return [...this.chains.keys()];
  }

  async destroy(): Promise<void> {
    for (const s of this.state.values()) {
      for (const p of s.providers) {
        await p.destroy();
      }
    }
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Build an EthereumRpcClient from environment variables.
 * Only chains with at least one RPC URL configured are registered.
 */
export function createEthereumRpcClient(opts?: RpcClientOptions): EthereumRpcClient {
  const chainConfigs: ChainConfig[] = [];

  const envMap: Record<ChainId, string[]> = {
    ethereum: [
      process.env.ETHEREUM_RPC_URL ?? "",
      process.env.ETHEREUM_RPC_FALLBACK_URL ?? "",
    ],
    polygon: [
      process.env.POLYGON_RPC_URL ?? "",
      process.env.POLYGON_RPC_FALLBACK_URL ?? "",
    ],
    base: [
      process.env.BASE_RPC_URL ?? "",
      process.env.BASE_RPC_FALLBACK_URL ?? "",
    ],
  };

  for (const [chainId, urls] of Object.entries(envMap) as [ChainId, string[]][]) {
    const validUrls = urls.filter(Boolean);
    if (!validUrls.length) continue;
    chainConfigs.push({ ...DEFAULT_CHAINS[chainId], rpcUrls: validUrls });
  }

  if (!chainConfigs.length) {
    logger.warn("EthereumRpcClient: no chains configured — all EVM queries disabled");
  }

  return new EthereumRpcClient(chainConfigs, opts);
}

// Singleton for use across services
let _client: EthereumRpcClient | null = null;

export function getEthereumRpcClient(): EthereumRpcClient {
  if (!_client) _client = createEthereumRpcClient();
  return _client;
}
