import type { TraceContextOptions } from "./tracecontext";
import type * as StellarSdk from "@stellar/stellar-sdk";

/**
 * Configuration options required to initialize the BridgeWatch Contract SDK.
 */
export interface BridgeWatchSdkConfig {
  /**
   * The Soroban RPC endpoint URL.
   */
  rpcUrl: string;
  /**
   * Optional REST API base URL for compatibility endpoints. Defaults to rpcUrl if omitted.
   */
  apiUrl?: string;
  /**
   * The deployed Soroban contract address or ID to interact with.
   */
  contractId: string;
  /**
   * Stellar network passphrase (e.g. Testnet or Public).
   */
  networkPassphrase: string;
  /**
   * Whether unencrypted HTTP connections are permitted. Defaults to false.
   */
  allowHttp?: boolean;
  /**
   * Default transaction fee in stroops. Defaults to "100000".
   */
  defaultFee?: string;
  /**
   * Default transaction timeout in seconds. Defaults to 30.
   */
  defaultTimeoutSeconds?: number;
  /**
   * W3C trace context to propagate on outgoing API requests. Supply the
   * inbound `traceparent`/`tracestate` from the current HTTP request to
   * correlate SDK calls with the caller's trace.
   */
  tracing?: TraceContextOptions;
}


/**
 * Parameters for building and submitting contract invocation transactions.
 */
export interface InvokeContractParams {
  /**
   * Stellar public key of the account initiating the transaction.
   */
  sourcePublicKey: string;
  /**
   * The smart contract function or method name to invoke.
   */
  method: string;
  /**
   * Optional array of contract method arguments in Soroban ScVal format.
   */
  args?: StellarSdk.xdr.ScVal[];
  /**
   * Optional custom transaction fee in stroops. Overrides defaultFee.
   */
  fee?: string;
  /**
   * Optional transaction timeout in seconds. Overrides defaultTimeoutSeconds.
   */
  timeoutSeconds?: number;
}

/**
 * Parameters for read-only contract simulation queries.
 */
export interface QueryContractParams {
  /**
   * The smart contract function or method name to query.
   */
  method: string;
  /**
   * Optional array of contract method arguments in Soroban ScVal format.
   */
  args?: StellarSdk.xdr.ScVal[];
  /**
   * Optional source public key used as the simulation invoker. Defaults to a random keypair.
   */
  sourcePublicKey?: string;
  /** Override the configured contract, e.g. to target the batch query contract. */
  contractId?: string;
}

/**
 * Options configuring event subscription polling and exponential backoff behavior.
 */
export interface EventSubscriptionOptions {
  /**
   * Initial ledger sequence number from which to start consuming events.
   */
  startLedger?: number;
  /**
   * Polling interval in milliseconds when healthy. Defaults to 5000ms.
   */
  pollIntervalMs?: number;
  /**
   * Optional event filter criteria by type, contract ID, or topic paths.
   */
  filter?: {
    type?: string;
    contractIds?: string[];
    topics?: string[][];
  };
  /**
   * Callback invoked whenever new events are received.
   */
  onEvent: (event: unknown) => void;
  /**
   * Callback invoked when polling encounters an error.
   */
  onError?: (error: Error) => void;
  /**
   * Maximum backoff delay in milliseconds on consecutive failures. Defaults to 60000ms.
   */
  maxBackoffMs?: number;
  /**
   * Callback invoked when backoff state changes (failure progression or recovery).
   */
  onBackoffStateChange?: (state: BackoffState) => void;
}

/**
 * Snapshot of the current exponential backoff status during event polling.
 */
export interface BackoffState {
  /**
   * Current backoff delay interval in milliseconds.
   */
  currentBackoffMs: number;
  /**
   * Number of consecutive failed polling attempts.
   */
  consecutiveFailures: number;
  /**
   * Whether the poller is currently in a backing-off state.
   */
  isBackingOff: boolean;
}

/**
 * Represents an active subscription to contract events.
 */
export interface EventSubscription {
  /**
   * Stops event polling and cleans up the active subscription.
   */
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

/**
 * Connection and health status information for the SDK client.
 */
export interface SdkHealth {
  /**
   * Whether the client has established a connection to the RPC server.
   */
  connected: boolean;
  /**
   * The RPC URL currently configured.
   */
  rpcUrl: string;
  /**
   * The latest ledger sequence number observed on the network.
   */
  latestLedger?: number;
}
