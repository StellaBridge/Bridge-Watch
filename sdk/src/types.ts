import type * as StellarSdk from "@stellar/stellar-sdk";

export interface BridgeWatchSdkConfig {
  rpcUrl: string;
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

export interface SdkHealth {
  connected: boolean;
  rpcUrl: string;
  latestLedger?: number;
}
