import { ethers } from "ethers";
import { logger } from "../../utils/logger.js";
import { withRetry } from "../../utils/retry.js";
import { getMetricsService } from "../../utils/metrics.js";
import { ERC20_ABI, BRIDGE_ABI } from "./abis.js";
import { ChainCircuit, withTimeout, type ChainCircuitEvent, type ChainCircuitSnapshot } from "./failover/index.js";
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
} from "./types.js";

// ─── Default chain configs ────────────────────────────────────────────────────

const DEFAULT_CHAINS: Record<ChainId, Omit<ChainConfig, "rpcUrls">> = {
  ethereum: { chainId: "ethereum", name: "Ethereum Mainnet", blockTime: 12, rateLimit: 10 },
  polygon:  { chainId: "polygon",  name: "Polygon PoS",      blockTime: 2,  rateLimit: 10 },
  base:     { chainId: "base",     name: "Base",             blockTime: 2,  rateLimit: 10 },
};

/** Test seam: injects provider construction so unit tests can substitute fakes. */
export interface EthereumRpcClientDeps {
  createProvider?: (url: string) => ethers.JsonRpcProvider;
}

// ─── EthereumRpcClient ────────────────────────────────────────────────────────

export class EthereumRpcClient {
  private readonly chains = new Map<ChainId, ChainConfig>();
  private readonly circuits = new Map<ChainId, ChainCircuit<ethers.JsonRpcProvider>>();
  private readonly opts: Required<Pick<RpcClientOptions, "maxRetries" | "retryDelayMs" | "requestTimeoutMs">>;
  private readonly metrics = getMetricsService();

  constructor(
    chainConfigs: ChainConfig[],
    opts: RpcClientOptions = {},
    private readonly deps: EthereumRpcClientDeps = {}
  ) {
    this.opts = {
      maxRetries:       opts.maxRetries       ?? 3,
      retryDelayMs:     opts.retryDelayMs     ?? 1000,
      requestTimeoutMs: opts.requestTimeoutMs ?? 10_000,
    };

    const createProvider = deps.createProvider ?? ((url: string) => new ethers.JsonRpcProvider(url));

    for (const cfg of chainConfigs) {
      if (!cfg.rpcUrls.length) throw new Error(`No RPC URLs for chain ${cfg.chainId}`);
      this.chains.set(cfg.chainId, cfg);
      this.circuits.set(
        cfg.chainId,
        new ChainCircuit<ethers.JsonRpcProvider>(
          cfg.rpcUrls.map(createProvider),
          { config: opts.failover, onEvent: (event) => this.handleCircuitEvent(cfg.chainId, event) }
        )
      );
    }
  }

  // ─── Circuit event wiring ──────────────────────────────────────────────────

  private handleCircuitEvent(chainId: ChainId, event: ChainCircuitEvent): void {
    const meta = { chainId, providerIndex: event.index, fromIndex: event.fromIndex, kind: event.kind };

    switch (event.type) {
      case "failover":
        this.metrics.recordCustomMetric("rpc_failover_total", 1, "count", { chainId });
        logger.warn(meta, `RPC provider failover: ${event.fromIndex} -> ${event.index}`);
        break;
      case "provider_failed":
        logger.warn(meta, `RPC provider failed (${event.kind})`);
        break;
      case "block_regressed":
        logger.warn(meta, "RPC provider reported a block height behind the accepted head");
        break;
      case "all_providers_down":
        this.metrics.recordCustomMetric("rpc_all_providers_down_total", 1, "count", { chainId });
        logger.error(meta, "All RPC providers are currently unavailable");
        break;
      default:
        break;
    }
  }

  // ─── Provider management ───────────────────────────────────────────────────

  private readonly requestCounts = new Map<ChainId, number>();
  private readonly lastRateLimitResets = new Map<ChainId, number>();

  /** Enforce per-chain rate limit (token bucket, 1-second window). */
  private async throttle(chainId: ChainId): Promise<void> {
    const cfg = this.requireChain(chainId);
    const now = Date.now();
    const lastReset = this.lastRateLimitResets.get(chainId) ?? now;
    let count = this.requestCounts.get(chainId) ?? 0;

    if (now - lastReset >= 1000) {
      count = 0;
      this.lastRateLimitResets.set(chainId, now);
    }

    if (count >= cfg.rateLimit) {
      const wait = 1000 - (now - lastReset);
      await new Promise((resolve) => setTimeout(resolve, wait));
      count = 0;
      this.lastRateLimitResets.set(chainId, Date.now());
    }

    this.requestCounts.set(chainId, count + 1);
  }

  /**
   * Execute a provider call through the chain circuit with throttling,
   * a cancellation-safe timeout, retry, deterministic failover, and (for
   * critical reads) request hedging.
   */
  private async call<T>(
    chainId: ChainId,
    fn: (provider: ethers.JsonRpcProvider) => Promise<T>,
    options: { hedge?: boolean; blockHeight?: (value: T) => number } = {}
  ): Promise<T> {
    await this.throttle(chainId);
    const circuit = this.requireCircuit(chainId);

    return withRetry(
      () =>
        circuit.execute(
          (provider) => withTimeout((_signal) => fn(provider), this.opts.requestTimeoutMs),
          options
        ),
      this.opts.maxRetries,
      this.opts.retryDelayMs
    );
  }

  // ─── Block tracking ────────────────────────────────────────────────────────

  /** Fetch the latest block number (hedged; advances the accepted head). */
  async getBlockNumber(chainId: ChainId): Promise<number> {
    return this.call(chainId, (provider) => provider.getBlockNumber(), {
      hedge: true,
      blockHeight: (height) => height,
    });
  }

  /** Fetch a block by number. `"latest"` is hedged and advances the head. */
  async getBlock(chainId: ChainId, blockNumber: number | "latest"): Promise<ethers.Block | null> {
    const isLatest = blockNumber === "latest";
    return this.call(
      chainId,
      (provider) => provider.getBlock(blockNumber),
      isLatest ? { hedge: true, blockHeight: (block) => block?.number } : undefined
    );
  }

  // ─── ERC-20 queries ────────────────────────────────────────────────────────

  async getTokenInfo(chainId: ChainId, tokenAddress: string): Promise<TokenInfo> {
    return this.call(chainId, async (provider) => {
      const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
      const [totalSupply, decimals, symbol] = await Promise.all([
        contract.totalSupply() as Promise<bigint>,
        contract.decimals()    as Promise<number>,
        contract.symbol()      as Promise<string>,
      ]);
      return { address: tokenAddress, symbol, decimals, totalSupply };
    });
  }

  async getTokenBalance(chainId: ChainId, tokenAddress: string, holder: string): Promise<TokenBalance> {
    return this.call(chainId, async (provider) => {
      const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
      const [balance, decimals] = await Promise.all([
        contract.balanceOf(holder) as Promise<bigint>,
        contract.decimals()        as Promise<number>,
      ]);
      return {
        address:   tokenAddress,
        holder,
        balance,
        formatted: ethers.formatUnits(balance, decimals),
      };
    });
  }

  // ─── Bridge contract queries ───────────────────────────────────────────────

  /**
   * Read bridge reserves (hedged critical read). All contract calls and the
   * head-height read run against the *selected* provider, so a mid-request
   * failover can never bind a contract to a stale provider.
   */
  async getBridgeReserves(
    chainId: ChainId,
    contractAddress: string,
    tokenAddress: string
  ): Promise<BridgeReserves> {
    const result = await this.call(
      chainId,
      async (provider) => {
        const bridge = new ethers.Contract(contractAddress, BRIDGE_ABI, provider);
        const token  = new ethers.Contract(tokenAddress,    ERC20_ABI,  provider);
        const [lockedAmount, decimals, isPaused, blockNumber] = await Promise.all([
          bridge.lockedAmount(tokenAddress) as Promise<bigint>,
          token.decimals()                  as Promise<number>,
          bridge.isPaused()                 as Promise<boolean>,
          provider.getBlockNumber(),
        ]);
        return { lockedAmount, decimals, isPaused, blockNumber };
      },
      { hedge: true, blockHeight: (r) => r.blockNumber }
    );

    const block = await this.getBlock(chainId, result.blockNumber);

    return {
      chain:           chainId,
      contractAddress,
      tokenAddress,
      lockedAmount:    result.lockedAmount,
      formattedAmount: ethers.formatUnits(result.lockedAmount, result.decimals),
      isPaused:        result.isPaused,
      blockNumber:     result.blockNumber,
      timestamp:       block?.timestamp ?? 0,
    };
  }

  // ─── Event log queries ─────────────────────────────────────────────────────

  async queryEvents(chainId: ChainId, query: EventLogQuery): Promise<ParsedEvent[]> {
    return this.call(chainId, async (provider) => {
      const contract = new ethers.Contract(query.contractAddress, query.abi, provider);
      const filter = contract.filters[query.eventName]?.(...Object.values(query.filters ?? {}));
      if (!filter) throw new Error(`Event ${query.eventName} not found in ABI`);

      const logs = await contract.queryFilter(filter, query.fromBlock, query.toBlock);
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
    });
  }

  /** Query events with block timestamps resolved (extra RPC calls). */
  async queryEventsWithTimestamps(chainId: ChainId, query: EventLogQuery): Promise<ParsedEvent[]> {
    const events = await this.queryEvents(chainId, query);
    const blockNumbers = [...new Set(events.map((event) => event.blockNumber))];

    const blocks = await Promise.all(
      blockNumbers.map((n) => this.getBlock(chainId, n))
    );
    const timestampMap = new Map(
      blockNumbers.map((n, i) => [n, blocks[i]?.timestamp ?? 0])
    );

    return events.map((event) => ({ ...event, timestamp: timestampMap.get(event.blockNumber) }));
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

  private requireCircuit(chainId: ChainId): ChainCircuit<ethers.JsonRpcProvider> {
    const circuit = this.circuits.get(chainId);
    if (!circuit) throw new Error(`Chain ${chainId} not configured`);
    return circuit;
  }

  /** Cached last-known accepted block height (no RPC call). */
  getLastKnownBlock(chainId: ChainId): number {
    return this.requireCircuit(chainId).getLastAcceptedBlockHeight();
  }

  /** Per-chain provider health, including recovery criteria and reason codes. */
  getProviderStates(chainId: ChainId): ChainCircuitSnapshot {
    return this.requireCircuit(chainId).snapshot();
  }

  getActiveProviderIndex(chainId: ChainId): number {
    return this.requireCircuit(chainId).getActiveIndex();
  }

  getSupportedChains(): ChainId[] {
    return [...this.chains.keys()];
  }

  async destroy(): Promise<void> {
    for (const circuit of this.circuits.values()) {
      await Promise.all(circuit.allProviders().map((provider) => provider.destroy()));
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