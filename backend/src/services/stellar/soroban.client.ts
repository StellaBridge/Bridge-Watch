import * as StellarSdk from "@stellar/stellar-sdk";
import { config } from "../../config/index.js";
import { logger } from "../../utils/logger.js";

export type SorobanNetwork = "testnet" | "mainnet";

export type SorobanContractValue =
  | string
  | number
  | bigint
  | boolean
  | null
  | undefined
  | Buffer
  | Uint8Array
  | Record<string, unknown>
  | SorobanContractValue[]
  | StellarSdk.xdr.ScVal;

export interface SorobanContractMethod<TArgs extends readonly SorobanContractValue[] = readonly SorobanContractValue[], TResult = unknown> {
  contractId: string;
  functionName: string;
  args?: TArgs;
  decodeResult?: (value: unknown) => TResult;
}

export interface SorobanContractInterface<TMethods extends Record<string, SorobanContractMethod>> {
  contractId: string;
  methods: TMethods;
}

export interface SorobanClientOptions {
  rpcUrls?: string[];
  network?: SorobanNetwork;
  allowHttp?: boolean;
  timeoutMs?: number;
  headers?: Record<string, string>;
  eventPollIntervalMs?: number;
  transactionPollAttempts?: number;
  transactionPollDelayMs?: number;
  createServer?: (
    url: string,
    options: { allowHttp: boolean; timeout?: number; headers?: Record<string, string> }
  ) => StellarSdk.SorobanRpc.Server;
  sleep?: (ms: number) => Promise<void>;
}

export interface SorobanReadRequest<T = unknown> {
  contractId: string;
  key: StellarSdk.xdr.ScVal;
  durability?: unknown;
  decodeResult?: (value: unknown) => T;
}

export interface SorobanEventRequest {
  startLedger?: number;
  endLedger?: number;
  cursor?: string;
  limit?: number;
  filters?: Array<Record<string, unknown>>;
}

export interface SorobanGasEstimate {
  minResourceFee: number;
  cpuInstructions: number;
  memoryBytes: number;
  raw: unknown;
}

export interface SorobanTransactionStatus<T = unknown> {
  hash: string;
  status: "pending" | "success" | "failed";
  response: unknown;
  returnValue?: T;
  error?: string;
}

export interface SorobanInvocationRequest<TArgs extends readonly SorobanContractValue[] = readonly SorobanContractValue[], TResult = unknown> {
  contractId: string;
  functionName: string;
  args?: TArgs;
  signer: StellarSdk.Keypair;
  sourceAccount?: string | StellarSdk.Account;
  fee?: string | number;
  timeoutSeconds?: number;
  decodeResult?: (value: unknown) => TResult;
}

export interface SorobanInvocationResult<TResult = unknown> extends SorobanTransactionStatus<TResult> {
  preparedTransaction: StellarSdk.Transaction | StellarSdk.FeeBumpTransaction;
  sendResponse: unknown;
  simulation?: unknown;
  gasEstimate?: SorobanGasEstimate;
}

export class SorobanClientError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "SorobanClientError";
  }
}

export class SorobanSimulationError extends SorobanClientError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "SorobanSimulationError";
  }
}

export class SorobanTransactionError extends SorobanClientError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "SorobanTransactionError";
  }
}

export class SorobanStateReadError extends SorobanClientError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "SorobanStateReadError";
  }
}

export class SorobanEventError extends SorobanClientError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "SorobanEventError";
  }
}

const DEFAULT_EVENT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_TRANSACTION_POLL_ATTEMPTS = 20;
const DEFAULT_TRANSACTION_POLL_DELAY_MS = 2_000;

function getNetworkPassphrase(network: SorobanNetwork): string {
  return network === "mainnet" ? StellarSdk.Networks.PUBLIC : StellarSdk.Networks.TESTNET;
}

function normalizeContractValue(value: SorobanContractValue): StellarSdk.xdr.ScVal {
  if (value instanceof StellarSdk.xdr.ScVal) {
    return value;
  }

  return StellarSdk.nativeToScVal(value as never);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function stringifyError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/**
 * Soroban RPC client for contract invocations, state reads, and transaction tracking.
 *
 * Example:
 * const client = new SorobanRpcClient();
 * const estimate = await client.estimateGas({
 *   contractId: "C...",
 *   functionName: "commit_reserves",
 *   args: ["bridge-1", rootHex, 1000n],
 * });
 */
export class SorobanRpcClient {
  private readonly rpcUrls: string[];
  private readonly servers: StellarSdk.SorobanRpc.Server[];
  private readonly networkPassphrase: string;
  private readonly eventPollIntervalMs: number;
  private readonly transactionPollAttempts: number;
  private readonly transactionPollDelayMs: number;
  private readonly sleepImpl: (ms: number) => Promise<void>;

  constructor(private readonly options: SorobanClientOptions = {}) {
    const network = options.network ?? config.STELLAR_NETWORK;

    if (options.rpcUrls?.length) {
      this.rpcUrls = options.rpcUrls.filter(Boolean);
    } else if (network === "mainnet") {
      if (!config.SOROBAN_MAINNET_RPC_URL) {
        throw new SorobanClientError("Soroban mainnet RPC URL is not configured");
      }

      this.rpcUrls = [config.SOROBAN_MAINNET_RPC_URL];
    } else {
      this.rpcUrls = [config.SOROBAN_RPC_URL].filter(Boolean);
    }

    this.networkPassphrase = getNetworkPassphrase(network);
    this.eventPollIntervalMs = options.eventPollIntervalMs ?? DEFAULT_EVENT_POLL_INTERVAL_MS;
    this.transactionPollAttempts = options.transactionPollAttempts ?? DEFAULT_TRANSACTION_POLL_ATTEMPTS;
    this.transactionPollDelayMs = options.transactionPollDelayMs ?? DEFAULT_TRANSACTION_POLL_DELAY_MS;
    this.sleepImpl = options.sleep ?? sleep;

    const serverOptions = {
      allowHttp: options.allowHttp ?? config.NODE_ENV === "development",
      timeout: options.timeoutMs,
      headers: options.headers,
    };

    const createServer = options.createServer
      ?? ((url: string, rpcOptions: { allowHttp: boolean; timeout?: number; headers?: Record<string, string> }) => new StellarSdk.SorobanRpc.Server(url, rpcOptions));

    this.servers = this.rpcUrls.map((url) => createServer(url, serverOptions));
  }

  getNetworkPassphrase(): string {
    return this.networkPassphrase;
  }

  getRpcUrls(): string[] {
    return [...this.rpcUrls];
  }

  async getNetwork(): Promise<unknown> {
    return this.withFailover("get network", (server) => server.getNetwork());
  }

  async getLatestLedger(): Promise<unknown> {
    return this.withFailover("get latest ledger", (server) => server.getLatestLedger());
  }

  async getFeeStats(): Promise<unknown> {
    return this.withFailover("get fee stats", (server) => server.getFeeStats());
  }

  async readContractData<T = unknown>(request: SorobanReadRequest<T>): Promise<T | null> {
    try {
      const result = await this.withFailover(
        "read contract data",
        (server) => server.getContractData(request.contractId, request.key, request.durability as never)
      );

      const nativeValue = this.extractScVal((result as { val?: unknown } | null | undefined)?.val);
      return nativeValue === null || nativeValue === undefined
        ? null
        : (request.decodeResult ? request.decodeResult(nativeValue) : (nativeValue as T));
    } catch (error) {
      throw this.translateError(error, "Failed to read Soroban contract state", SorobanStateReadError);
    }
  }

  async batchReadContractData<T = unknown>(requests: SorobanReadRequest<T>[]): Promise<Array<T | null>> {
    return Promise.all(requests.map((request) => this.readContractData(request)));
  }

  async buildInvocationTransaction(request: Omit<SorobanInvocationRequest, "signer">): Promise<StellarSdk.Transaction> {
    const account = await this.resolveSourceAccount(request.sourceAccount);
    const contract = new StellarSdk.Contract(request.contractId);
    const args = (request.args ?? []).map((value) => normalizeContractValue(value));

    return new StellarSdk.TransactionBuilder(account, {
      fee: String(request.fee ?? StellarSdk.BASE_FEE),
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(contract.call(request.functionName, ...args))
      .setTimeout(request.timeoutSeconds ?? 30)
      .build();
  }

  async prepareTransaction(transaction: StellarSdk.Transaction | StellarSdk.FeeBumpTransaction): Promise<StellarSdk.Transaction | StellarSdk.FeeBumpTransaction> {
    try {
      return await this.withFailover("prepare transaction", (server) => server.prepareTransaction(transaction));
    } catch (error) {
      throw this.translateError(error, "Failed to prepare Soroban transaction", SorobanTransactionError);
    }
  }

  async submitTransaction(transaction: StellarSdk.Transaction | StellarSdk.FeeBumpTransaction): Promise<unknown> {
    try {
      const response = await this.withFailover("submit transaction", (server) => server.sendTransaction(transaction));
      if ((response as { status?: string }).status === "ERROR") {
        throw new Error(stringifyError((response as { errorResult?: unknown; errorResultXdr?: unknown }).errorResult ?? (response as { errorResultXdr?: unknown }).errorResultXdr));
      }

      return response;
    } catch (error) {
      throw this.translateError(error, "Failed to submit Soroban transaction", SorobanTransactionError);
    }
  }

  async simulateInvocation<T = unknown>(request: Omit<SorobanInvocationRequest, "signer">): Promise<{ simulation: unknown; returnValue: T | null }> {
    const tx = await this.buildInvocationTransaction(request);

    try {
      const simulation = await this.withFailover("simulate transaction", (server) => server.simulateTransaction(tx));

      if (StellarSdk.SorobanRpc.Api.isSimulationError(simulation)) {
        throw new Error(stringifyError((simulation as { error?: unknown }).error));
      }

      return {
        simulation,
        returnValue: this.extractSimulationValue<T>(simulation),
      };
    } catch (error) {
      throw this.translateError(error, "Failed to simulate Soroban contract call", SorobanSimulationError);
    }
  }

  async estimateGas(request: Omit<SorobanInvocationRequest, "signer">): Promise<SorobanGasEstimate> {
    const { simulation } = await this.simulateInvocation(request);
    const cost = (simulation as { cost?: Record<string, unknown> } | null | undefined)?.cost ?? {};

    return {
      minResourceFee: toNumber((simulation as { minResourceFee?: unknown }).minResourceFee ?? cost.minResourceFee),
      cpuInstructions: toNumber(cost.cpuInsns ?? cost.cpuInstructions),
      memoryBytes: toNumber(cost.memBytes ?? cost.memoryBytes),
      raw: simulation,
    };
  }

  async getContractData<T = unknown>(request: SorobanReadRequest<T>): Promise<T | null> {
    return this.readContractData(request);
  }

  async invokeContract<TResult = unknown>(request: SorobanInvocationRequest): Promise<SorobanInvocationResult<TResult>> {
    const builtTransaction = await this.buildInvocationTransaction(request);
    const preparedTransaction = await this.prepareTransaction(builtTransaction);

    (preparedTransaction as any).sign(request.signer);

    const sendResponse = await this.submitTransaction(preparedTransaction);
    const status = await this.trackTransactionStatus<TResult>((sendResponse as { hash: string }).hash, {
      attempts: this.transactionPollAttempts,
      delayMs: this.transactionPollDelayMs,
      decodeResult: request.decodeResult as ((value: unknown) => TResult) | undefined,
    });

    return {
      ...status,
      preparedTransaction,
      sendResponse,
    };
  }

  async trackTransactionStatus<TResult = unknown>(
    hash: string,
    options?: {
      attempts?: number;
      delayMs?: number;
      decodeResult?: (value: unknown) => TResult;
    }
  ): Promise<SorobanTransactionStatus<TResult>> {
    const attempts = options?.attempts ?? this.transactionPollAttempts;
    const delayMs = options?.delayMs ?? this.transactionPollDelayMs;
    let lastResponse: unknown = null;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const response = await this.withFailover(
        "get transaction",
        (server) => server.getTransaction(hash)
      );

      lastResponse = response;
      const status = String((response as { status?: unknown }).status ?? "").toLowerCase();

      if (status === "success") {
        const returnValue = this.extractTransactionValue<TResult>(response, options?.decodeResult);
        return {
          hash,
          status: "success",
          response,
          returnValue: returnValue ?? undefined,
        };
      }

      if (status === "failed") {
        return {
          hash,
          status: "failed",
          response,
          error: stringifyError((response as { errorResultXdr?: unknown; errorResult?: unknown }).errorResultXdr ?? (response as { errorResult?: unknown }).errorResult),
        };
      }

      if (attempt < attempts - 1) {
        await this.sleepImpl(delayMs);
      }
    }

    return {
      hash,
      status: "pending",
      response: lastResponse,
    };
  }

  async getEvents(request: SorobanEventRequest): Promise<unknown> {
    try {
      return await this.withFailover("get events", (server) => server.getEvents(request as never));
    } catch (error) {
      throw this.translateError(error, "Failed to fetch Soroban events", SorobanEventError);
    }
  }

  /**
   * Fetch raw ledger entries by XDR ledger keys (#1200).
   * Thin failover wrapper over Soroban RPC `getLedgerEntries`.
   */
  async getLedgerEntries(
    keys: StellarSdk.xdr.LedgerKey[],
    ledgerSeq?: number
  ): Promise<unknown> {
    try {
      return await this.withFailover("get ledger entries", (server) =>
        (server as unknown as {
          getLedgerEntries: (
            keys: StellarSdk.xdr.LedgerKey[],
            ledgerSeq?: number
          ) => Promise<unknown>;
        }).getLedgerEntries(keys, ledgerSeq)
      );
    } catch (error) {
      throw this.translateError(error, "Failed to fetch ledger entries", SorobanStateReadError);
    }
  }

  async *streamEvents(request: SorobanEventRequest, options?: { pollIntervalMs?: number; signal?: AbortSignal }): AsyncGenerator<unknown, void, void> {
    let cursor = request.cursor ?? "now";
    const pollIntervalMs = options?.pollIntervalMs ?? this.eventPollIntervalMs;

    while (!options?.signal?.aborted) {
      const response = await this.getEvents({ ...request, cursor });
      const events = Array.isArray((response as { events?: unknown[] }).events)
        ? ((response as { events?: unknown[] }).events as unknown[])
        : [];

      if (events.length === 0) {
        await this.sleepImpl(pollIntervalMs);
        continue;
      }

      for (const event of events) {
        cursor = String((event as { pagingToken?: unknown }).pagingToken ?? cursor);
        yield event;
      }
    }
  }

  async readContractMethod<TResult = unknown>(
    contract: SorobanContractInterface<Record<string, SorobanContractMethod<any, TResult>>>,
    methodName: string,
    overrides?: Partial<Omit<SorobanInvocationRequest, "contractId" | "functionName" | "args">>
  ): Promise<TResult | null> {
    const method = contract.methods[String(methodName)];
    if (!method) {
      throw new SorobanStateReadError(`Unknown contract method: ${String(methodName)}`);
    }

    const result = await this.simulateInvocation<TResult>({
      contractId: method.contractId,
      functionName: method.functionName,
      args: method.args,
      sourceAccount: overrides?.sourceAccount,
      fee: overrides?.fee,
      timeoutSeconds: overrides?.timeoutSeconds,
      decodeResult: method.decodeResult,
    });

    return result.returnValue;
  }

  private async resolveSourceAccount(sourceAccount?: string | StellarSdk.Account): Promise<StellarSdk.Account> {
    if (sourceAccount instanceof StellarSdk.Account) {
      return sourceAccount;
    }

    if (typeof sourceAccount === "string" && sourceAccount.length > 0) {
      return this.withFailover("load account", (server) => server.getAccount(sourceAccount));
    }

    const randomKeypair = StellarSdk.Keypair.random();
    return new StellarSdk.Account(randomKeypair.publicKey(), "0");
  }

  private async withFailover<T>(operation: string, task: (server: StellarSdk.SorobanRpc.Server) => Promise<T>): Promise<T> {
    let lastError: unknown;

    for (const [index, server] of this.servers.entries()) {
      try {
        return await task(server);
      } catch (error) {
        lastError = error;
        logger.warn(
          { operation, rpcUrl: this.rpcUrls[index], error: stringifyError(error) },
          "Soroban RPC request failed; trying next endpoint"
        );
      }
    }

    throw this.translateError(lastError, `Soroban RPC request failed during ${operation}`, SorobanClientError);
  }

  private extractScVal(value: unknown): unknown {
    if (!value) {
      return null;
    }

    try {
      return StellarSdk.scValToNative(value as never);
    } catch {
      return value;
    }
  }

  private extractSimulationValue<TResult>(simulation: unknown): TResult | null {
    const result = simulation as { result?: { retval?: unknown }; returnValue?: unknown };
    const rawValue = result.result?.retval ?? result.returnValue;

    if (rawValue === undefined || rawValue === null) {
      return null;
    }

    try {
      return StellarSdk.scValToNative(rawValue as never) as TResult;
    } catch {
      return rawValue as TResult;
    }
  }

  private extractTransactionValue<TResult>(
    response: unknown,
    decodeResult?: (value: unknown) => TResult
  ): TResult | null {
    const rawValue = (response as { returnValue?: unknown }).returnValue;

    if (rawValue === undefined || rawValue === null) {
      return null;
    }

    const nativeValue = this.extractScVal(rawValue);
    return decodeResult ? decodeResult(nativeValue) : (nativeValue as TResult);
  }

  private translateError<TError extends SorobanClientError>(
    error: unknown,
    fallbackMessage: string,
    ErrorType: new (message: string, cause?: unknown) => TError
  ): TError {
    const message = error instanceof Error && error.message ? error.message : stringifyError(error) || fallbackMessage;
    return new ErrorType(message || fallbackMessage, error);
  }
}
