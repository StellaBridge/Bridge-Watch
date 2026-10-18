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
  WebSocketSubscriptionOptions,
} from "./types";
import type { ApiCapabilities, ApiContract, ApiContractSummary, ApiVersion } from "./compatibility";
import { compatibilityHeaders } from "./compatibility";
import { injectTraceHeaders, type TraceContextOptions } from "./tracecontext";

/**
 * Configuration options for HTTP request retry behavior and exponential backoff.
 * Applied to compatibility API requests made by the client.
 *
 * Retries are performed exclusively on HTTP 429 (Too Many Requests) and 5xx server error responses.
 * Other 4xx client errors (e.g. 400, 401, 403, 404) and non-HTTP errors are not retried.
 */
export interface ClientRetryConfig {
  /**
   * Maximum number of retries after the first attempt.
   * Default: 3 (allows up to 4 total attempts).
   */
  maxRetries?: number;
  /**
   * Base delay between retries in milliseconds.
   * Default: 1000.
   */
  baseDelayMs?: number;
  /**
   * Maximum delay cap between retries in milliseconds.
   * Default: 10000.
   */
  maxDelayMs?: number;
}

/**
 * Main SDK client for interacting with the BridgeWatch Soroban smart contract and
 * backend compatibility services.
 *
 * @example
 * ```ts
 * import { BridgeWatchContractSdk } from "@bridge-watch/contract-sdk";
 * import * as StellarSdk from "@stellar/stellar-sdk";
 *
 * const client = new BridgeWatchContractSdk({
 *   rpcUrl: "https://soroban-testnet.stellar.org",
 *   contractId: "CA3D5KRYMCMCZKPOQ36BWWBI7VXX7N4Q67Z6V2HIKLNYOCYTX7235L2B",
 *   networkPassphrase: StellarSdk.Networks.TESTNET,
 * });
 * ```
 */
export class BridgeWatchContractSdk {
  /**
   * `tracing` is deliberately left optional rather than `Required<>`-ed:
   * trace propagation is opt-in, and forcing a default would make the
   * no-tracing case a lie.
   */
  private readonly config: Required<Omit<BridgeWatchSdkConfig, "tracing">> &
    Pick<BridgeWatchSdkConfig, "tracing">;
  private readonly retryConfig: Required<ClientRetryConfig>;
  private readonly server: StellarSdk.rpc.Server;
  private connected = false;

  /**
   * Creates an instance of BridgeWatchContractSdk.
   *
   * @param config - SDK configuration options including RPC URL, contract ID, and network passphrase.
   * @param retryConfig - Optional retry and backoff configuration for HTTP requests. If omitted or partially
   *                      specified, defaults are merged (maxRetries: 3, baseDelayMs: 1000ms, maxDelayMs: 10000ms).
   *                      Retries occur only on HTTP 429 and 5xx responses with exponential backoff and jitter.
   *
   * @example
   * ```ts
   * import { BridgeWatchContractSdk } from "@bridge-watch/contract-sdk";
   * import * as StellarSdk from "@stellar/stellar-sdk";
   *
   * // Initializing with custom retryConfig:
   * const client = new BridgeWatchContractSdk(
   *   {
   *     rpcUrl: "https://soroban-testnet.stellar.org",
   *     contractId: "CA3D5KRYMCMCZKPOQ36BWWBI7VXX7N4Q67Z6V2HIKLNYOCYTX7235L2B",
   *     networkPassphrase: StellarSdk.Networks.TESTNET,
   *     retryConfig: {
   *       maxRetries: 5,
   *       baseDelayMs: 500,
   *       maxDelayMs: 8000,
   *     },
   *   }
   * );
   * ```
   */
  constructor(
    config: BridgeWatchSdkConfig & { retryConfig?: ClientRetryConfig },
    retryConfig?: ClientRetryConfig
  ) {
    this.config = {
      allowHttp: false,
      defaultFee: "100000",
      defaultTimeoutSeconds: 30,
      ...config,
      apiUrl: config.apiUrl ?? config.rpcUrl,
    };

    const mergedRetry = retryConfig ?? config.retryConfig;
    this.retryConfig = {
      // maxRetries represents the maximum number of retries after the first attempt.
      maxRetries: mergedRetry?.maxRetries ?? 3,
      baseDelayMs: mergedRetry?.baseDelayMs ?? 1000,
      maxDelayMs: mergedRetry?.maxDelayMs ?? 10000,
    };

    this.server = new StellarSdk.rpc.Server(this.config.rpcUrl, {
      allowHttp: this.config.allowHttp,
    });
  }

  /**
   * Fetches the API contract specification for a given version.
   *
   * @param version - Optional API version string (e.g. "v1").
   * @returns Promise resolving to the API contract definition.
   * @throws {BridgeWatchConnectionError} If the HTTP request fails or returns an unrecoverable/final error status.
   *
   * @example
   * ```ts
   * const contract = await client.getApiContract("v1");
   * console.log(contract.version);
   * ```
   */
  async getApiContract(version?: ApiVersion): Promise<ApiContract> {
    return this.fetchCompatibility<ApiContract>(`/contract${version ? `?version=${version}` : ""}`, version);
  }

  /**
   * Fetches the supported API capabilities from the compatibility service.
   *
   * @param version - Optional API version string.
   * @returns Promise resolving to the API capabilities object.
   * @throws {BridgeWatchConnectionError} If the HTTP request fails or returns an unrecoverable/final error status.
   *
   * @example
   * ```ts
   * const capabilities = await client.getApiCapabilities();
   * console.log(capabilities.supportedFeatures);
   * ```
   */
  async getApiCapabilities(version?: ApiVersion): Promise<ApiCapabilities> {
    return this.fetchCompatibility<ApiCapabilities>("/capabilities", version);
  }

  /**
   * Fetches the list of supported API versions and current version metadata.
   *
   * @returns Promise resolving to the current version and list of available version summaries.
   * @throws {BridgeWatchConnectionError} If the HTTP request fails or returns an unrecoverable/final error status.
   *
   * @example
   * ```ts
   * const { current, versions } = await client.getApiVersions();
   * console.log("Current version:", current);
   * ```
   */
  async getApiVersions(): Promise<{ current: ApiVersion; versions: ApiContractSummary[] }> {
    return this.fetchCompatibility<{ current: ApiVersion; versions: ApiContractSummary[] }>("/versions");
  }

  private async fetchCompatibility<T>(path: string, version?: ApiVersion): Promise<T> {
    const url = `${this.config.apiUrl.replace(/\/$/, "")}/api/v1/compatibility${path}`;
    // Propagate W3C trace context so the backend can correlate this request
    // with the caller's trace. An explicit per-call context wins over config.
    const headers = injectTraceHeaders(
      compatibilityHeaders(version),
      this.config.tracing as TraceContextOptions | undefined
    );

    // maxRetries represents the maximum number of retries after the first attempt.
    const maxRetries = this.retryConfig.maxRetries;
    let attempt = 0;

    while (true) {
      const response = await fetch(url, { headers });

      if (response.ok) {
        return response.json() as Promise<T>;
      }

      // Retry only on HTTP 429 and 5xx responses. Do not retry other 4xx responses.
      const isRetryable =
        response.status === 429 || (response.status >= 500 && response.status <= 599);

      if (!isRetryable || attempt >= maxRetries) {
        throw new BridgeWatchConnectionError(`Compatibility request failed: ${response.status}`);
      }

      attempt++;

      // Exponential backoff with jitter between retries.
      const exponentialDelay = this.retryConfig.baseDelayMs * Math.pow(2, attempt - 1);
      const cappedDelay = Math.min(exponentialDelay, this.retryConfig.maxDelayMs);
      const jitter = Math.random() * (cappedDelay * 0.1);
      const delay = Math.min(cappedDelay + jitter, this.retryConfig.maxDelayMs);

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  /**
   * Establishes a connection to the Soroban RPC server by checking its health.
   *
   * @returns Promise resolving to the SDK health status including connectivity and latest ledger.
   * @throws {BridgeWatchConnectionError} If unable to connect to the Soroban RPC server.
   */
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

  /**
   * Disconnects the SDK client by resetting the internal connection flag.
   */
  disconnect() {
    this.connected = false;
  }

  /**
   * Queries the latest ledger sequence number from the Soroban RPC server.
   *
   * @returns Promise resolving to the latest ledger sequence number, or undefined if unavailable.
   */
  async getLatestLedger(): Promise<number | undefined> {
    const health = await this.server.getHealth();
    return health.latestLedger;
  }

  /**
   * Retrieves the current connection state and health metrics of the SDK client.
   *
   * @returns Promise resolving to SdkHealth containing connection status, RPC URL, and latest ledger.
   */
  async getHealth(): Promise<SdkHealth> {
    const latestLedger = await this.getLatestLedger();

    return {
      connected: this.connected,
      rpcUrl: this.config.rpcUrl,
      latestLedger,
    };
  }

  /**
   * Constructs an unsigned Soroban contract invocation transaction.
   *
   * @param params - Parameters for the invocation including source account, method name, args, fee, and timeout.
   * @returns Promise resolving to the built Stellar transaction.
   * @throws {BridgeWatchTransactionError} If building the transaction fails.
   */
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

  /**
   * Simulates a transaction on the Soroban RPC server without submitting it to the ledger.
   *
   * @param transaction - Built Stellar transaction to simulate.
   * @returns Promise resolving to the simulation response.
   * @throws {BridgeWatchTransactionError} If the simulation returns an error.
   */
  async simulateTransaction(
    transaction: ReturnType<StellarSdk.TransactionBuilder["build"]>
  ): Promise<StellarSdk.rpc.Api.SimulateTransactionResponse> {
    const simulation = await this.server.simulateTransaction(transaction);

    if (StellarSdk.rpc.Api.isSimulationError(simulation)) {
      throw new BridgeWatchTransactionError("Simulation failed", simulation);
    }

    return simulation;
  }

  /**
   * Submits a signed transaction to the Soroban network via RPC.
   *
   * @param signedTransaction - Fully signed Stellar transaction.
   * @returns Promise resolving to the transaction submission response.
   * @throws {BridgeWatchTransactionError} If the submission fails or results in an error status.
   */
  async sendTransaction(
    signedTransaction: ReturnType<StellarSdk.TransactionBuilder["build"]>
  ): Promise<StellarSdk.rpc.Api.SendTransactionResponse> {
    const result = await this.server.sendTransaction(signedTransaction);

    if (result.status === "ERROR") {
      throw new BridgeWatchTransactionError("Transaction submission failed", result);
    }

    return result;
  }

  /**
   * Helper method that builds, simulates, signs, and sends a contract invocation transaction in one step.
   *
   * @param params - Contract invocation parameters.
   * @param signerSecret - Secret key of the account used to sign the transaction.
   * @returns Promise resolving to the transaction submission response.
   * @throws {BridgeWatchTransactionError} If building, simulating, or sending the transaction fails.
   */
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

  /**
   * Executes a read-only smart contract method call via simulation.
   *
   * @param params - Query parameters including method name, arguments, and optional invoker key.
   * @returns Promise resolving to the simulation result from the Soroban RPC server.
   * @throws {BridgeWatchQueryError} If executing or simulating the query fails.
   */
  async queryMethod(
    params: QueryContractParams
  ): Promise<StellarSdk.rpc.Api.SimulateTransactionResponse> {
    try {
      const sourcePublicKey =
        params.sourcePublicKey ?? StellarSdk.Keypair.random().publicKey();
      const sourceAccount = new StellarSdk.Account(sourcePublicKey, "0");
      const contract = new StellarSdk.Contract(
        params.contractId ?? this.config.contractId
      );

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

  /**
   * Subscribes to Soroban contract events with automatic polling, jitter, and exponential backoff on failure.
   *
   * @param options - Configuration for the subscription, including start ledger, filter, poll interval, callbacks, and max backoff.
   * @returns EventSubscription object with an unsubscribe method to cancel polling.
   */
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
      await new Promise((resolve) => {
        setTimeout(resolve, minBackoffMs);
      });
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

  /**
   * Auto-reconnecting WebSocket event subscription (issue #1244).
   *
   * Opens a WebSocket to `options.wsUrl`, delivers each message to
   * `onEvent`, and tracks the last received ledger sequence. On close or
   * error the socket is reopened with exponential backoff + jitter,
   * resuming from the last received ledger so no events are missed during
   * network blips.
   *
   * Uses the environment's global WebSocket (native in browsers and
   * Node >= 22).
   */
  subscribeToEventsWebSocket(options: WebSocketSubscriptionOptions): EventSubscription {
    let active = true;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const minBackoffMs = options.minBackoffMs ?? 1000;
    const maxBackoffMs = options.maxBackoffMs ?? 60000;
    let consecutiveFailures = 0;
    let currentBackoffMs = minBackoffMs;
    // Resume cursor: the last ledger delivered to the consumer, or the
    // requested start point.
    let lastLedger: number | undefined = options.startLedger;

    const updateBackoffState = (isBackingOff: boolean) => {
      const state: BackoffState = {
        currentBackoffMs,
        consecutiveFailures,
        isBackingOff,
      };
      options.onBackoffStateChange?.(state);
    };

    const jitter = () => currentBackoffMs * (1 + Math.random() * 0.1);

    const openSocket = () => {
      if (!active) return;

      try {
        // Native WebSocket (browsers, Node >= 21).
        socket = new WebSocket(options.wsUrl);
      } catch (error) {
        scheduleReconnect(error instanceof Error ? error : new Error("WebSocket construction failed"));
        return;
      }

      socket.onopen = () => {
        // Connected: reset the backoff state and subscribe, resuming from
        // the last received ledger so no event is missed across reconnects.
        consecutiveFailures = 0;
        currentBackoffMs = minBackoffMs;
        updateBackoffState(false);

        socket?.send(
          JSON.stringify({
            action: "subscribe",
            startLedger: lastLedger,
            filter: options.filter,
          })
        );
      };

      socket.onmessage = (messageEvent) => {
        try {
          const payload = JSON.parse(String(messageEvent.data)) as {
            event?: unknown;
            latestLedger?: number;
          };
          if (payload.event !== undefined) {
            options.onEvent(payload.event);
          }
          if (typeof payload.latestLedger === "number") {
            lastLedger = payload.latestLedger;
          }
        } catch (error) {
          options.onError?.(
            error instanceof Error
              ? error
              : new BridgeWatchConnectionError("Malformed WebSocket message", error)
          );
        }
      };

      socket.onerror = () => {
        // Reconnection is driven by onclose (which always follows onerror).
      };

      socket.onclose = () => {
        if (!active) return;
        scheduleReconnect(new BridgeWatchConnectionError("WebSocket closed"));
      };
    };

    const scheduleReconnect = (error: Error) => {
      if (!active) return;
      consecutiveFailures++;
      currentBackoffMs = Math.min(
        minBackoffMs * Math.pow(2, consecutiveFailures - 1),
        maxBackoffMs
      );
      updateBackoffState(true);
      options.onError?.(error);

      const delay = currentBackoffMs * (1 + Math.random() * 0.1);
      reconnectTimer = setTimeout(openSocket, delay);
    };

    openSocket();

    return {
      unsubscribe: () => {
        active = false;
        if (reconnectTimer !== null) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
        if (socket) {
          socket.onclose = null;
          socket.onerror = null;
          socket.onmessage = null;
          socket.close();
          socket = null;
        }
      },
    };
  }
}
