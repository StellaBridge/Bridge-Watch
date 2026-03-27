import { ethers } from "ethers";

/** Supported EVM chains */
export type ChainId = "ethereum" | "polygon" | "base";

export interface ChainConfig {
  chainId: ChainId;
  name: string;
  rpcUrls: string[];       // ordered by priority; first is primary
  blockTime: number;       // seconds
  rateLimit: number;       // max requests per second
}

export interface TokenInfo {
  address: string;
  symbol: string;
  decimals: number;
  totalSupply: bigint;
}

export interface TokenBalance {
  address: string;
  holder: string;
  balance: bigint;
  formatted: string;
}

export interface BridgeReserves {
  chain: ChainId;
  contractAddress: string;
  tokenAddress: string;
  lockedAmount: bigint;
  formattedAmount: string;
  isPaused: boolean;
  blockNumber: number;
  timestamp: number;
}

export interface EventLogQuery {
  contractAddress: string;
  abi: readonly string[];
  eventName: string;
  fromBlock: number | "earliest";
  toBlock: number | "latest";
  filters?: Record<string, unknown>;
}

export interface ParsedEvent {
  blockNumber: number;
  blockHash: string;
  transactionHash: string;
  logIndex: number;
  eventName: string;
  args: Record<string, unknown>;
  timestamp?: number;
}

export interface BatchCall {
  contractAddress: string;
  abi: readonly string[];
  method: string;
  args?: unknown[];
}

export interface RpcClientOptions {
  maxRetries?: number;
  retryDelayMs?: number;
  requestTimeoutMs?: number;
}

/** Internal provider state per chain */
export interface ProviderState {
  providers: ethers.JsonRpcProvider[];
  activeIndex: number;
  lastBlockNumber: number;
  lastBlockTime: number;
  requestCount: number;
  lastRateLimitReset: number;
}
