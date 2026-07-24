import * as StellarSdk from "@stellar/stellar-sdk";
import {
  BridgeWatchConnectionError,
  BridgeWatchQueryError,
  BridgeWatchTransactionError,
} from "./errors";
import type {
  BackoffState,
  BridgeWatchSdkConfig,
  EventSubscription,
  EventSubscriptionOptions,
  InvokeContractParams,
  QueryContractParams,
  SdkHealth,
} from "./types";

export class BridgeWatchContractSdk {
  private readonly config: Required<BridgeWatchSdkConfig>;
  private readonly server: StellarSdk.rpc.Server;
  private connected = false;

  constructor(config: BridgeWatchSdkConfig) {
    this.config = {
      allowHttp: false,
      defaultFee: "100000",
      defaultTimeoutSeconds: 30,
      ...config,
    };

    this.server = new StellarSdk.rpc.Server(this.config.rpcUrl, {
      allowHttp: this.config.allowHttp,
    });
  }

  async connect(): Promise<SdkHealth> {
    try {
      const latestLedger = await this.getLatestLedger();
      this.connected = true;

      return {
        connected: true,
        rpcUrl: this.config.rpcUrl,
        latestLedger,
      };
    } catch (error) {
      throw new BridgeWatchConnectionError("Unable to connect to Soroban RPC", error);
    }
  }

  disconnect() {
    this.connected = false;
  }

  async getLatestLedger(): Promise<number | undefined> {
    const health = await this.server.getHealth();
    return health.latestLedger;
  }

  async getHealth(): Promise<SdkHealth> {
    const latestLedger = await this.getLatestLedger();

    return {
      connected: this.connected,
      rpcUrl: this.config.rpcUrl,
      latestLedger,
    };
  }

  async buildInvokeTransaction(params: InvokeContractParams) {
    try {
      const account = await this.server.getAccount(params.sourcePublicKey);
      const contract = new StellarSdk.Contract(this.config.contractId);

      return new StellarSdk.TransactionBuilder(account, {
        fee: params.fee ?? this.config.defaultFee,
        networkPassphrase: this.config.networkPassphrase,
      })
        .addOperation(
          contract.call(
            params.method,
            ...((params.args ?? []) as StellarSdk.xdr.ScVal[])
          )
        )
        .setTimeout(params.timeoutSeconds ?? this.config.defaultTimeoutSeconds)
        .build();
    } catch (error) {
      throw new BridgeWatchTransactionError("Failed to build invoke transaction", error);
    }
  }

  async simulateTransaction(
    transaction: ReturnType<StellarSdk.TransactionBuilder["build"]>
  ): Promise<StellarSdk.rpc.Api.SimulateTransactionResponse> {
    const simulation = await this.server.simulateTransaction(transaction);

    if (StellarSdk.rpc.Api.isSimulationError(simulation)) {
      throw new BridgeWatchTransactionError("Simulation failed", simulation);
    }

    return simulation;
  }

  async sendTransaction(
    signedTransaction: ReturnType<StellarSdk.TransactionBuilder["build"]>
  ): Promise<StellarSdk.rpc.Api.SendTransactionResponse> {
    const result = await this.server.sendTransaction(signedTransaction);

    if (result.status === "ERROR") {
      throw new BridgeWatchTransactionError("Transaction submission failed", result);
    }

    return result;
  }

  async invokeAndSend(params: InvokeContractParams, signerSecret: string) {
    const transaction = await this.buildInvokeTransaction(params);
    const simulation = await this.simulateTransaction(transaction);
    const assembled = StellarSdk.rpc.assembleTransaction(
      transaction,
      simulation
    ).build();

    const keypair = StellarSdk.Keypair.fromSecret(signerSecret);
    assembled.sign(keypair);

    return this.sendTransaction(assembled);
  }

  async queryMethod(
    params: QueryContractParams
  ): Promise<StellarSdk.rpc.Api.SimulateTransactionResponse> {
    try {
      const sourcePublicKey =
        params.sourcePublicKey ?? StellarSdk.Keypair.random().publicKey();
      const sourceAccount = new StellarSdk.Account(sourcePublicKey, "0");
      const contract = new StellarSdk.Contract(this.config.contractId);

      const tx = new StellarSdk.TransactionBuilder(sourceAccount, {
        fee: "100",
        networkPassphrase: this.config.networkPassphrase,
      })
        .addOperation(
          contract.call(
            params.method,
            ...((params.args ?? []) as StellarSdk.xdr.ScVal[])
          )
        )
        .setTimeout(10)
        .build();

      return this.simulateTransaction(tx);
    } catch (error) {
      throw new BridgeWatchQueryError("Failed to query contract method", error);
    }
  }

  subscribeToEvents(options: EventSubscriptionOptions): EventSubscription {
    let active = true;
    let cursor = options.startLedger;
    let consecutiveFailures = 0;
    const minBackoffMs = options.pollIntervalMs ?? 5000;
    const maxBackoffMs = options.maxBackoffMs ?? 60000;
    let currentBackoffMs = minBackoffMs;

    const updateBackoffState = (isBackingOff: boolean) => {
      const state: BackoffState = {
        currentBackoffMs,
        consecutiveFailures,
        isBackingOff,
      };
      options.onBackoffStateChange?.(state);
    };

    const jitter = () => {
      const jitterPercent = Math.random() * 0.1;
      return currentBackoffMs * (1 + jitterPercent);
    };

    const run = async () => {
      while (active) {
        try {
          const response = await (this.server as unknown as {
            getEvents: (request: {
              startLedger?: number;
              filters?: Array<{
                type?: string;
                contractIds?: string[];
                topics?: string[][];
              }>;
            }) => Promise<{ events?: unknown[]; latestLedger?: number }>;
          }).getEvents({
            startLedger: cursor,
            filters: options.filter ? [options.filter] : undefined,
          });

          (response.events ?? []).forEach((event) => options.onEvent(event));

          if (response.latestLedger) {
            cursor = response.latestLedger + 1;
          }

          if (consecutiveFailures > 0) {
            consecutiveFailures = 0;
            currentBackoffMs = minBackoffMs;
            updateBackoffState(false);
          }

          await new Promise((resolve) => {
            setTimeout(resolve, minBackoffMs);
          });
        } catch (error) {
          consecutiveFailures++;
          currentBackoffMs = Math.min(
            minBackoffMs * Math.pow(2, consecutiveFailures - 1),
            maxBackoffMs
          );
          updateBackoffState(true);

          options.onError?.(
            error instanceof Error
              ? error
              : new BridgeWatchConnectionError("Event polling failed", error)
          );

          const delay = jitter();
          await new Promise((resolve) => {
            setTimeout(resolve, delay);
          });
        }
      }
    };

    void run();

    return {
      unsubscribe: () => {
        active = false;
      },
    };
  }
}
