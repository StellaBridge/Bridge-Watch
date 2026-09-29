import * as StellarSdk from "@stellar/stellar-sdk";
import type {
  ApiCapabilities,
  ApiContract,
  ApiContractSummary,
  ApiVersion,
} from "./compatibility";
import type {
  BackoffState,
  BridgeWatchSdkConfig,
  EventSubscription,
  EventSubscriptionOptions,
  InvokeContractParams,
  QueryContractParams,
  SdkHealth,
  WebSocketSubscriptionOptions,
} from "./types";
import {
  BridgeWatchConnectionError,
  BridgeWatchQueryError,
  BridgeWatchTransactionError,
} from "./errors";

export function createMockScValString(value: string): StellarSdk.xdr.ScVal {
  return StellarSdk.xdr.ScVal.scvString(value);
}

export function createMockScValU64(value: number): StellarSdk.xdr.ScVal {
  return StellarSdk.xdr.ScVal.scvU64(
    StellarSdk.xdr.Uint64.fromString(String(value))
  );
}

export function createMockEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: `evt_${Date.now()}`,
    type: "contract",
    contractId: "mock-contract-id",
    ledger: 1000,
    value: {},
    ...overrides,
  };
}

export function createMockWatchSubscription(): EventSubscription & { isClosed: () => boolean } {
  let closed = false;

  return {
    isClosed: () => closed,
    unsubscribe: () => {
      closed = true;
    },
  };
}

export type BridgeScenarioPreset =
  | "HEALTHY"
  | "DEGRADED"
  | "CRITICAL_MISMATCH"
  | "EMERGENCY_PAUSED"
  | "RECOVERY";

export interface ScenarioFixtureData {
  status: "healthy" | "degraded" | "down" | "paused";
  reserveBalance: string;
  issuedSupply: string;
  mismatchPercentage: number;
  totalValueLocked: number;
  averageLatencyMs: number;
  isPaused: boolean;
  events: Array<Record<string, unknown>>;
  activeAlerts: Array<{ id: string; severity: "info" | "warning" | "critical"; message: string }>;
}

export const SCENARIO_PRESETS: Record<BridgeScenarioPreset, ScenarioFixtureData> = {
  HEALTHY: {
    status: "healthy",
    reserveBalance: "10000000",
    issuedSupply: "10000000",
    mismatchPercentage: 0.0,
    totalValueLocked: 10000000,
    averageLatencyMs: 45,
    isPaused: false,
    events: [
      { id: "evt_1", type: "deposit", asset: "USDC", amount: "50000", ledger: 1000 },
      { id: "evt_2", type: "withdraw", asset: "USDC", amount: "20000", ledger: 1005 },
    ],
    activeAlerts: [],
  },
  DEGRADED: {
    status: "degraded",
    reserveBalance: "9950000",
    issuedSupply: "10000000",
    mismatchPercentage: 0.5,
    totalValueLocked: 9950000,
    averageLatencyMs: 380,
    isPaused: false,
    events: [
      { id: "evt_deg_1", type: "delayed_transfer", asset: "USDC", amount: "50000", ledger: 1010 },
      { id: "evt_deg_2", type: "mismatch_warning", mismatchPercent: 0.5, ledger: 1012 },
    ],
    activeAlerts: [
      { id: "alt_1", severity: "warning", message: "Bridge latency elevated above 300ms" },
    ],
  },
  CRITICAL_MISMATCH: {
    status: "down",
    reserveBalance: "9200000",
    issuedSupply: "10000000",
    mismatchPercentage: 8.0,
    totalValueLocked: 9200000,
    averageLatencyMs: 1200,
    isPaused: false,
    events: [
      { id: "evt_crit_1", type: "reserves_deficit", deficit: "800000", ledger: 1020 },
      { id: "evt_crit_2", type: "anomaly_detected", reason: "unbalanced_drain", ledger: 1021 },
    ],
    activeAlerts: [
      { id: "alt_crit_1", severity: "critical", message: "Reserve backing deficit exceeds 5% threshold" },
    ],
  },
  EMERGENCY_PAUSED: {
    status: "paused",
    reserveBalance: "10000000",
    issuedSupply: "10000000",
    mismatchPercentage: 0.0,
    totalValueLocked: 10000000,
    averageLatencyMs: 0,
    isPaused: true,
    events: [
      { id: "evt_pause_1", type: "emergency_stop", caller: "GA_OPERATOR", ledger: 1030 },
    ],
    activeAlerts: [
      { id: "alt_pause_1", severity: "critical", message: "Bridge contract operations paused by guardian" },
    ],
  },
  RECOVERY: {
    status: "healthy",
    reserveBalance: "9990000",
    issuedSupply: "10000000",
    mismatchPercentage: 0.1,
    totalValueLocked: 9990000,
    averageLatencyMs: 80,
    isPaused: false,
    events: [
      { id: "evt_rec_1", type: "rebalance_inbound", amount: "790000", ledger: 1040 },
      { id: "evt_rec_2", type: "resumed_normal_operations", ledger: 1045 },
    ],
    activeAlerts: [
      { id: "alt_rec_1", severity: "info", message: "Recovery stabilization in progress" },
    ],
  },
};

export function createDeterministicFixture(scenario: BridgeScenarioPreset = "HEALTHY"): ScenarioFixtureData {
  return JSON.parse(JSON.stringify(SCENARIO_PRESETS[scenario]));
}

export interface MockBridgeWatchClientOptions extends Partial<BridgeWatchSdkConfig> {
  scenario?: BridgeScenarioPreset;
  initialLedger?: number;
  failureRate?: number;
  latencyMs?: number;
}

export class MockBridgeWatchClient {
  private connected = false;
  private currentLedger: number;
  private scenario: BridgeScenarioPreset;
  private fixtureData: ScenarioFixtureData;
  private readonly config: Required<BridgeWatchSdkConfig>;
  private readonly subscribers: Set<(event: unknown) => void> = new Set();
  private readonly errorSubscribers: Set<(error: Error) => void> = new Set();

  constructor(options: MockBridgeWatchClientOptions = {}) {
    this.scenario = options.scenario ?? "HEALTHY";
    this.fixtureData = createDeterministicFixture(this.scenario);
    this.currentLedger = options.initialLedger ?? 1000;
    this.config = {
      rpcUrl: options.rpcUrl ?? "http://localhost:8000/soroban/rpc",
      apiUrl: options.apiUrl ?? "http://localhost:3000",
      contractId: options.contractId ?? "CA3D5KRYMCMUZNRCQU63DA3WPRBNQ74Z6SVW64D",
      networkPassphrase: options.networkPassphrase ?? "Test SDF Future Network ; October 2022",
      allowHttp: options.allowHttp ?? true,
      defaultFee: options.defaultFee ?? "100",
      defaultTimeoutSeconds: options.defaultTimeoutSeconds ?? 30,
    };
  }

  setScenario(scenario: BridgeScenarioPreset): void {
    this.scenario = scenario;
    this.fixtureData = createDeterministicFixture(scenario);
  }

  getScenario(): BridgeScenarioPreset {
    return this.scenario;
  }

  getFixtureData(): ScenarioFixtureData {
    return this.fixtureData;
  }

  advanceLedger(count: number = 1): number {
    this.currentLedger += count;
    return this.currentLedger;
  }

  emitEvent(event: Record<string, unknown>): void {
    const fullEvent = {
      id: `evt_mock_${Date.now()}`,
      ledger: this.currentLedger,
      ...event,
    };
    this.fixtureData.events.push(fullEvent);
    this.subscribers.forEach((cb) => cb(fullEvent));
  }

  triggerError(error: Error): void {
    this.errorSubscribers.forEach((cb) => cb(error));
  }

  async connect(): Promise<SdkHealth> {
    this.connected = true;
    return {
      connected: true,
      rpcUrl: this.config.rpcUrl,
      latestLedger: this.currentLedger,
    };
  }

  disconnect(): void {
    this.connected = false;
  }

  async getLatestLedger(): Promise<number> {
    return this.currentLedger;
  }

  async getHealth(): Promise<SdkHealth> {
    return {
      connected: this.connected,
      rpcUrl: this.config.rpcUrl,
      latestLedger: this.currentLedger,
    };
  }

  async getApiContract(version?: ApiVersion): Promise<ApiContract> {
    return {
      version: version ?? "1.0.0",
      checksum: "mock-checksum-abc-123",
      endpoints: ["/api/v1/bridges", "/api/v1/assets", "/api/v1/health"],
    };
  }

  async getApiCapabilities(version?: ApiVersion): Promise<ApiCapabilities> {
    return {
      version: version ?? "1.0.0",
      features: ["streaming-exports", "continuous-aggregates", "mock-sandbox"],
    };
  }

  async getApiVersions(): Promise<{ current: ApiVersion; versions: ApiContractSummary[] }> {
    return {
      current: "1.0.0",
      versions: [{ version: "1.0.0", releaseDate: "2026-01-01" }],
    };
  }

  async queryMethod(params: QueryContractParams): Promise<any> {
    if (this.fixtureData.isPaused && params.method === "transfer") {
      throw new BridgeWatchQueryError("Bridge is currently paused by emergency stop");
    }

    return {
      status: "SUCCESS",
      result: {
        method: params.method,
        scenario: this.scenario,
        fixture: this.fixtureData,
        ledger: this.currentLedger,
      },
    };
  }

  async simulateTransaction(transaction: any): Promise<any> {
    if (this.fixtureData.isPaused) {
      throw new BridgeWatchTransactionError("Simulation failed: Contract is paused");
    }

    return {
      status: "SUCCESS",
      minResourceFee: "100",
      results: [{ auth: [], xdr: "AAAA" }],
    };
  }

  async sendTransaction(signedTransaction: any): Promise<any> {
    if (this.fixtureData.isPaused) {
      throw new BridgeWatchTransactionError("Transaction failed: Bridge operations are paused");
    }

    this.advanceLedger(1);
    return {
      status: "SUCCESS",
      hash: `tx_hash_${Date.now()}`,
      latestLedger: this.currentLedger,
    };
  }

  async invokeAndSend(params: InvokeContractParams, signerSecret: string): Promise<any> {
    if (!signerSecret) {
      throw new BridgeWatchTransactionError("Signer secret is required");
    }
    return this.sendTransaction(params);
  }

  subscribeToEvents(options: EventSubscriptionOptions): EventSubscription {
    const callback = (event: unknown) => options.onEvent(event);
    this.subscribers.add(callback);

    if (options.onError) {
      this.errorSubscribers.add(options.onError);
    }

    // Deliver preset fixture events
    setTimeout(() => {
      this.fixtureData.events.forEach((event) => options.onEvent(event));
    }, 0);

    return {
      unsubscribe: () => {
        this.subscribers.delete(callback);
        if (options.onError) {
          this.errorSubscribers.delete(options.onError);
        }
      },
    };
  }

  subscribeToEventsWebSocket(options: WebSocketSubscriptionOptions): EventSubscription {
    const callback = (event: unknown) => options.onEvent(event);
    this.subscribers.add(callback);

    if (options.onError) {
      this.errorSubscribers.add(options.onError);
    }

    setTimeout(() => {
      this.fixtureData.events.forEach((event) => options.onEvent(event));
    }, 0);

    return {
      unsubscribe: () => {
        this.subscribers.delete(callback);
        if (options.onError) {
          this.errorSubscribers.delete(options.onError);
        }
      },
    };
  }
}
