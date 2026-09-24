import * as StellarSdk from "@stellar/stellar-sdk";
import { getDatabase } from "../database/connection.js";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";
import { SorobanRpcClient } from "./stellar/soroban.client.js";

// =============================================================================
// SOROBAN CONTRACT INSTANCE DISCOVERY (#1198)
// =============================================================================

export interface DiscoverInstancesRequest {
  contractIds: string[];
  ledgerSeq?: number;
}

export interface DiscoveredContractInstance {
  contractId: string;
  exists: boolean;
  wasmHash?: string;
  lastModifiedLedgerSeq?: number;
  liveUntilLedgerSeq?: number;
  lastSeenLedgerSeq?: number;
}

export interface DiscoverInstancesResult {
  ledgerSeq?: number;
  discovered: number;
  instances: DiscoveredContractInstance[];
}

export class ContractDiscoveryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContractDiscoveryValidationError";
  }
}

export class ContractDiscoveryUpstreamError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "ContractDiscoveryUpstreamError";
  }
}

type RpcClientFactory = () => Pick<SorobanRpcClient, "getLedgerEntries">;

const MAX_CONTRACT_IDS = 50;
const CONTRACT_ID_RE = /^C[A-Z2-7]{55}$/;

function isValidContractId(value: string): boolean {
  return CONTRACT_ID_RE.test(value);
}

/** Build the persistent CONTRACT_INSTANCE ledger key for a contract ID. */
function buildInstanceKey(contractId: string): StellarSdk.xdr.LedgerKey {
  // Preferred: SDK Contract footprint helper (present in stellar-sdk v12+).
  try {
    const contract = new StellarSdk.Contract(contractId) as unknown as {
      getFootprint?: () => StellarSdk.xdr.LedgerKey;
    };
    if (typeof contract.getFootprint === "function") {
      return contract.getFootprint();
    }
  } catch {
    // Fall through to manual construction.
  }

  const instanceVal = (StellarSdk.xdr.ScVal as unknown as {
    scvLedgerKeyContractInstance: () => unknown;
  }).scvLedgerKeyContractInstance() as StellarSdk.xdr.ScVal;

  return StellarSdk.xdr.LedgerKey.contractData(
    new StellarSdk.xdr.LedgerKeyContractData({
      contract: new StellarSdk.Address(contractId).toScAddress(),
      key: instanceVal,
      durability: StellarSdk.xdr.ContractDataDurability.persistent(),
    })
  );
}

function tryExtractWasmHash(entryXdrBase64: string): string | undefined {
  try {
    const data = StellarSdk.xdr.LedgerEntryData.fromXDR(entryXdrBase64, "base64");
    const executable = data.contractData().val().instance().executable() as unknown as {
      switch: () => { name: string };
      wasmHash: () => Buffer | Uint8Array;
    };
    if (executable.switch().name !== "wasm") return undefined;
    const hash = Buffer.from(executable.wasmHash());
    return hash.length === 32 ? hash.toString("hex") : undefined;
  } catch {
    return undefined;
  }
}

export class ContractInstanceDiscoveryService {
  private static instance: ContractInstanceDiscoveryService;
  private readonly createClient: RpcClientFactory;

  constructor(createClient?: RpcClientFactory) {
    this.createClient =
      createClient ??
      (() =>
        new SorobanRpcClient({
          rpcUrls: [config.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org"],
        }));
  }

  public static getInstance(): ContractInstanceDiscoveryService {
    if (!ContractInstanceDiscoveryService.instance) {
      ContractInstanceDiscoveryService.instance = new ContractInstanceDiscoveryService();
    }
    return ContractInstanceDiscoveryService.instance;
  }

  /** For tests: build a service backed by a stub RPC client. */
  public static withClient(createClient: RpcClientFactory): ContractInstanceDiscoveryService {
    return new ContractInstanceDiscoveryService(createClient);
  }

  public validateRequest(request: DiscoverInstancesRequest): string[] {
    if (!request || !Array.isArray(request.contractIds) || request.contractIds.length === 0) {
      throw new ContractDiscoveryValidationError("contractIds must be a non-empty array.");
    }
    if (request.contractIds.length > MAX_CONTRACT_IDS) {
      throw new ContractDiscoveryValidationError(
        `contractIds must contain at most ${MAX_CONTRACT_IDS} entries.`
      );
    }
    if (
      request.ledgerSeq !== undefined &&
      (!Number.isInteger(request.ledgerSeq) || request.ledgerSeq <= 0)
    ) {
      throw new ContractDiscoveryValidationError("ledgerSeq must be a positive integer.");
    }
    const seen = new Set<string>();
    for (const id of request.contractIds) {
      if (typeof id !== "string" || !isValidContractId(id)) {
        throw new ContractDiscoveryValidationError(
          "Each contractId must be a valid Soroban contract address (C...)."
        );
      }
      if (seen.has(id)) {
        throw new ContractDiscoveryValidationError("contractIds must not contain duplicates.");
      }
      seen.add(id);
    }
    return [...seen];
  }

  public async discover(request: DiscoverInstancesRequest): Promise<DiscoverInstancesResult> {
    const contractIds = this.validateRequest(request);
    const client = this.createClient();
    const keys = contractIds.map(buildInstanceKey);

    let response: {
      entries?: Array<{
        xdr?: unknown;
        liveUntilLedgerSeq?: unknown;
        lastModifiedLedgerSeq?: unknown;
      }>;
    };
    try {
      response = (await client.getLedgerEntries(keys, request.ledgerSeq)) as typeof response;
    } catch (error) {
      logger.error({ count: contractIds.length }, "Contract instance discovery upstream failure");
      throw new ContractDiscoveryUpstreamError(
        error instanceof Error ? error.message : "Soroban RPC getLedgerEntries failed",
        error
      );
    }

    // getLedgerEntries returns only found entries in request order gaps —
    // match by index is unreliable, so match by decoded presence: the RPC
    // echoes entries found; we map each returned entry back via wasm/content
    // is not possible, so we probe per-key membership by re-querying order?
    // Simplification: entries are returned in the same order as found keys;
    // to stay correct, fetch per-contract individually when batch is partial.
    const foundByIndex = response.entries ?? [];
    let instances: DiscoveredContractInstance[];
    if (foundByIndex.length === contractIds.length || foundByIndex.length === 0) {
      instances = contractIds.map((contractId, index) => {
        const entry = foundByIndex[index];
        if (!entry) return { contractId, exists: false };
        return this.toInstance(contractId, entry);
      });
      // When nothing found the index mapping is trivially correct; when all
      // found, RPC preserves request order.
    } else {
      // Partial batch: resolve membership per contract to avoid misattribution.
      instances = await this.discoverIndividually(client, contractIds, request.ledgerSeq);
    }

    await this.persistInstances(instances, request.ledgerSeq);

    const discovered = instances.filter((i) => i.exists).length;
    logger.info({ requested: contractIds.length, discovered }, "Contract instances discovered");

    return {
      ...(request.ledgerSeq !== undefined && { ledgerSeq: request.ledgerSeq }),
      discovered,
      instances,
    };
  }

  /** Known contract IDs from local index + configured environment. */
  public async listKnownContractIds(limit = 100): Promise<string[]> {
    const ids = new Set<string>();
    for (const envId of [config.CIRCUIT_BREAKER_CONTRACT_ID, config.LIQUIDITY_CONTRACT_ADDRESS]) {
      if (envId && isValidContractId(envId)) ids.add(envId);
    }
    try {
      const db = getDatabase();
      const rows = await db("soroban_events")
        .distinct("contract_id as contractId")
        .limit(Math.min(Math.max(limit, 1), 500));
      for (const row of rows) {
        const id = String((row as { contractId?: unknown }).contractId ?? "");
        if (isValidContractId(id)) ids.add(id);
      }
    } catch {
      // Table may not exist in all environments; env IDs still returned.
    }
    return [...ids].slice(0, Math.min(Math.max(limit, 1), 500));
  }

  private toInstance(
    contractId: string,
    entry: { xdr?: unknown; liveUntilLedgerSeq?: unknown; lastModifiedLedgerSeq?: unknown }
  ): DiscoveredContractInstance {
    const xdr = typeof entry.xdr === "string" ? entry.xdr : "";
    const wasmHash = xdr ? tryExtractWasmHash(xdr) : undefined;
    const lastModified =
      typeof entry.lastModifiedLedgerSeq === "number" ? entry.lastModifiedLedgerSeq : undefined;
    const liveUntil =
      typeof entry.liveUntilLedgerSeq === "number" ? entry.liveUntilLedgerSeq : undefined;
    return {
      contractId,
      exists: true,
      ...(wasmHash && { wasmHash }),
      ...(lastModified !== undefined && { lastModifiedLedgerSeq: lastModified }),
      ...(liveUntil !== undefined && { liveUntilLedgerSeq: liveUntil }),
      ...(lastModified !== undefined && { lastSeenLedgerSeq: lastModified }),
    };
  }

  private async discoverIndividually(
    client: Pick<SorobanRpcClient, "getLedgerEntries">,
    contractIds: string[],
    ledgerSeq?: number
  ): Promise<DiscoveredContractInstance[]> {
    const results: DiscoveredContractInstance[] = [];
    for (const contractId of contractIds) {
      try {
        const res = (await client.getLedgerEntries([buildInstanceKey(contractId)], ledgerSeq)) as {
          entries?: Array<{
            xdr?: unknown;
            liveUntilLedgerSeq?: unknown;
            lastModifiedLedgerSeq?: unknown;
          }>;
        };
        const entry = res.entries?.[0];
        results.push(entry ? this.toInstance(contractId, entry) : { contractId, exists: false });
      } catch {
        results.push({ contractId, exists: false });
      }
    }
    return results;
  }

  private async persistInstances(
    instances: DiscoveredContractInstance[],
    ledgerSeq?: number
  ): Promise<void> {
    try {
      const db = getDatabase();
      const now = new Date();
      for (const instance of instances) {
        if (!instance.exists) continue;
        const seenLedger = instance.lastSeenLedgerSeq ?? ledgerSeq ?? null;
        await db("soroban_contract_instances")
          .insert({
            contract_id: instance.contractId,
            wasm_hash: instance.wasmHash ?? null,
            first_seen_ledger: seenLedger,
            last_seen_ledger: seenLedger,
            live_until_ledger: instance.liveUntilLedgerSeq ?? null,
            metadata: JSON.stringify({ source: "discovery" }),
            last_synced_at: now,
          })
          .onConflict("contract_id")
          .merge({
            wasm_hash: instance.wasmHash ?? null,
            last_seen_ledger: seenLedger,
            live_until_ledger: instance.liveUntilLedgerSeq ?? null,
            last_synced_at: now,
          });
      }
    } catch (error) {
      // Persistence is best-effort: discovery results are still returned
      // when the table/migration is unavailable.
      logger.warn({ error }, "Failed to persist discovered contract instances");
    }
  }
}

export const contractInstanceDiscoveryService = ContractInstanceDiscoveryService.getInstance();
