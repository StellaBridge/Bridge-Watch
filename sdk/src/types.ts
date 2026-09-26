import type * as StellarSdk from "@stellar/stellar-sdk";

export interface BridgeWatchSdkConfig {
  rpcUrl: string;
  apiUrl?: string;
  contractId: string;
  networkPassphrase: string;
  allowHttp?: boolean;
  defaultFee?: string;
  defaultTimeoutSeconds?: number;
}

export interface InvokeContractParams {
  sourcePublicKey: string;
  method: string;
  args?: StellarSdk.xdr.ScVal[];
  fee?: string;
  timeoutSeconds?: number;
}

export interface QueryContractParams {
  method: string;
  args?: StellarSdk.xdr.ScVal[];
  sourcePublicKey?: string;
  /** Override the configured contract, e.g. to target the batch query contract. */
  contractId?: string;
}

export interface EventSubscriptionOptions {
  startLedger?: number;
  pollIntervalMs?: number;
  filter?: {
    type?: string;
    contractIds?: string[];
    topics?: string[][];
  };
  onEvent: (event: unknown) => void;
  onError?: (error: Error) => void;
  maxBackoffMs?: number;
  onBackoffStateChange?: (state: BackoffState) => void;
}

export interface BackoffState {
  currentBackoffMs: number;
  consecutiveFailures: number;
  isBackingOff: boolean;
}

export interface EventSubscription {
  unsubscribe: () => void;
}

/** Options for the auto-reconnecting WebSocket event stream (issue #1244). */
export interface WebSocketSubscriptionOptions {
  /** WebSocket endpoint delivering ledger events as JSON messages. */
  wsUrl: string;
  /** Ledger to resume from; defaults to the current latest ledger. */
  startLedger?: number;
  /** Base reconnect delay in ms (default 1000). */
  minBackoffMs?: number;
  /** Maximum reconnect delay in ms (default 60000). */
  maxBackoffMs?: number;
  /** Optional Soroban event filter forwarded as the subscribe message. */
  filter?: {
    type?: string;
    contractIds?: string[];
    topics?: string[][];
  };
  onEvent: (event: unknown) => void;
  onError?: (error: Error) => void;
  /** Connection state changes (connecting/open/backoff). */
  onBackoffStateChange?: (state: BackoffState) => void;
}

export interface SdkHealth {
  connected: boolean;
  rpcUrl: string;
  latestLedger?: number;
}
