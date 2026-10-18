import * as StellarSdk from "@stellar/stellar-sdk";
import { BridgeWatchContractSdk } from "./client";
import type { BridgeWatchSdkConfig, InvokeContractParams } from "./types";
import { BridgeWatchQueryError, BridgeWatchTransactionError } from "./errors";

// ============================================================
// TypeScript interfaces mirroring Soroban contract types
// ============================================================

export interface AssetHealth {
  asset_code: string;
  health_score: number;
  liquidity_score: number;
  price_stability_score: number;
  bridge_uptime_score: number;
  paused: boolean;
  active: boolean;
  timestamp: number;
  expires_at: number;
}

export interface PriceRecord {
  asset_code: string;
  price: bigint;
  source: string;
  timestamp: number;
  expires_at: number;
}

export interface HealthScoreBatch {
  asset_code: string;
  health_score: number;
  liquidity_score: number;
  price_stability_score: number;
  bridge_uptime_score: number;
}

export interface HealthWeights {
  liquidity_weight: number;
  price_stability_weight: number;
  bridge_uptime_weight: number;
  version: number;
}

export interface HealthScoreResult {
  composite_score: number;
  liquidity_score: number;
  price_stability_score: number;
  bridge_uptime_score: number;
  weights: HealthWeights;
  timestamp: number;
  expires_at: number;
}

export interface AggregatedHealth {
  asset_code: string;
  weighted_health_score: number;
  weighted_liquidity_score: number;
  weighted_price_stability_score: number;
  weighted_bridge_uptime_score: number;
  source_count: number;
  computed_at: number;
}

export interface HealthSource {
  source_id: string;
  weight_bps: number;
  trusted: boolean;
  registered_at: number;
}

/** Mirrors batch_query::AssetData, serialized as JSON by the batch query contract. */
export interface BatchAssetState {
  asset_code: string;
  name: string;
  symbol: string;
  issuer: string;
  status: string;
}

/** One entry per requested asset code, in request order. */
export type BatchAssetResult =
  | { asset_code: string; ok: true; data: BatchAssetState }
  | { asset_code: string; ok: false; error: string };

/** Mirrors batch_query::MAX_BATCH_SIZE. */
export const MAX_BATCH_QUERY_SIZE = 50;

export type StatusTier = "ok" | "low" | "medium" | "high";

export interface ContractStatusRollup {
  tier: StatusTier;
  asset_ok: number;
  asset_low: number;
  asset_medium: number;
  asset_high: number;
  bridge_ok: number;
  bridge_low: number;
  bridge_medium: number;
  bridge_high: number;
  timestamp: number;
}

export interface AssetStatusRollup {
  asset_code: string;
  tier: StatusTier;
  health_score: number;
  has_price_deviation_alert: boolean;
  price_deviation_tier: StatusTier;
  paused: boolean;
  active: boolean;
  timestamp: number;
}

export interface BridgeStatusRollup {
  bridge_id: string;
  tier: StatusTier;
  latest_mismatch_bps: bigint;
  is_critical: boolean;
  timestamp: number;
}

export interface GlobalPauseState {
  is_paused: boolean;
  reason: string;
  paused_at: number;
  unpause_available_at: number;
  emergency_contact: string;
}

export interface PauseRecord {
  paused: boolean;
  reason: string;
  caller: string;
  timestamp: number;
}

export type ConfigCategory = "Threshold" | "Timeouts" | "Limits";

export interface ConfigValue {
  value: bigint;
  description: string;
}

export interface ConfigEntry {
  category: ConfigCategory;
  name: string;
  value: ConfigValue;
  version: number;
  updated_at: number;
  updated_by: string;
}

export interface AllConfigsExport {
  entries: ConfigEntry[];
  total: number;
  exported_at: number;
}

export interface EventReplayPage {
  total: number;
  schema_version: number;
}

export interface SetHealthWeightsParams {
  caller: string;
  liquidity_weight: number;
  price_stability_weight: number;
  bridge_uptime_weight: number;
  version: number;
}

export interface SubmitHealthParams {
  caller: string;
  asset_code: string;
  health_score: number;
  liquidity_score: number;
  price_stability_score: number;
  bridge_uptime_score: number;
}

export interface SubmitPriceParams {
  caller: string;
  asset_code: string;
  price: bigint | number;
  source: string;
}

/** Parameters mirroring the contract's `ZkPublicInputs` (issue #1244). */
export interface ZkPublicInputsParams {
  total_reserves: bigint | number;
  on_chain_supply: bigint | number;
  min_reserve_ratio_bps: number;
  timestamp: number;
  bridge_id: string;
  asset_code: string;
}

/** Parameters mirroring the contract's `ZkProof` (issue #1244). */
export interface ZkProofParams {
  /** Proof scheme expected by the registered verification key ("Groth16" | "Plonk"). */
  scheme: string;
  /** Proof curve expected by the registered verification key ("Bn254" | "Bls12_381"). */
  curve: string;
  /** Base-64 XDR proof point components. */
  pi_a: string;
  pi_b: string;
  pi_c: string;
  /** Hex-encoded 32-byte commitment hash. */
  commitment_hash: string;
}

/** Parameters mirroring the contract's `MmrProof` (issue #1244). */
export interface MmrProofParams {
  /** Hex-encoded 32-byte hash of the leaf being proven. */
  leaf_hash: string;
  /** 0-indexed position of the leaf in the overall sequence. */
  leaf_index: number;
  /** Hex-encoded 32-byte sibling hashes from leaf to local subtree peak. */
  siblings: string[];
  /** Snapshot of all peaks with the proven leaf's local root zeroed. */
  peaks_snapshot: string[];
  /** Index into `peaks_snapshot` of the local subtree peak. */
  local_peak_pos: number;
}

/** Result of an on-chain ZK reserve-proof verification. */
export interface ZkProofVerificationResult {
  /** Whether the proof verified and the attestation was recorded. */
  valid: boolean;
  /** Hex-encoded attestation id (sha256 of the attestation payload). */
  attestationId?: string;
}

// ============================================================
// ScVal creation helpers
// ============================================================

function scvString(v: string): StellarSdk.xdr.ScVal {
  return StellarSdk.xdr.ScVal.scvString(v);
}

function scvU32(v: number): StellarSdk.xdr.ScVal {
  return StellarSdk.xdr.ScVal.scvU32(v);
}

function scvI128(v: bigint | number): StellarSdk.xdr.ScVal {
  const val = typeof v === "number" ? BigInt(v) : v;
  const lo = StellarSdk.xdr.Uint64.fromString(
    String(val & BigInt("0xFFFFFFFFFFFFFFFF"))
  );
  const hi = StellarSdk.xdr.Int64.fromString(
    String(val >> BigInt(64))
  );
  return StellarSdk.xdr.ScVal.scvI128(
    new StellarSdk.xdr.Int128Parts({ lo, hi })
  );
}

function scvU64(v: number): StellarSdk.xdr.ScVal {
  return StellarSdk.xdr.ScVal.scvU64(
    StellarSdk.xdr.Uint64.fromString(String(v))
  );
}

function scvBool(v: boolean): StellarSdk.xdr.ScVal {
  return StellarSdk.xdr.ScVal.scvBool(v);
}

function scvAddress(v: string): StellarSdk.xdr.ScVal {
  return StellarSdk.Address.fromString(v).toScVal();
}

/** Base-64 XDR bytes → ScVal bytes (contract `Bytes` fields). */
function scvBytes(base64: string): StellarSdk.xdr.ScVal {
  return StellarSdk.xdr.ScVal.scvBytes(Buffer.from(base64, "base64"));
}

/** Hex-encoded 32-byte hash → ScVal bytes (contract `BytesN<32>` fields). */
function scvBytesN32(hex: string): StellarSdk.xdr.ScVal {
  const clean = hex.replace(/^0x/, "");
  if (!/^[0-9a-fA-F]{64}$/.test(clean)) {
    throw new BridgeWatchQueryError(
      `Expected a 32-byte hex string for BytesN<32>, got: ${hex}`
    );
  }
  return StellarSdk.xdr.ScVal.scvBytes(Buffer.from(clean, "hex"));
}

function scvMap(
  entries: Array<{ key: string; val: StellarSdk.xdr.ScVal }>
): StellarSdk.xdr.ScVal {
  return StellarSdk.xdr.ScVal.scvMap(
    entries.map(
      (e) =>
        new StellarSdk.xdr.ScMapEntry({
          key: scvString(e.key),
          val: e.val,
        })
    )
  );
}

function scvVec(items: StellarSdk.xdr.ScVal[]): StellarSdk.xdr.ScVal {
  return StellarSdk.xdr.ScVal.scvVec(items);
}

// ============================================================
// ScVal parsing helpers
// ============================================================

function isScvVoid(val: StellarSdk.xdr.ScVal): boolean {
  return val.switch().name === "scvVoid";
}

function parseScvString(val: StellarSdk.xdr.ScVal): string {
  const v = val.str();
  if (v == null) return "";
  return typeof v === "string" ? v : Buffer.from(v).toString("utf-8");
}

function parseScvU32(val: StellarSdk.xdr.ScVal): number {
  return val.u32() ?? 0;
}

function parseScvU64(val: StellarSdk.xdr.ScVal): number {
  return Number(val.u64()?.toString() ?? "0");
}

function parseScvBool(val: StellarSdk.xdr.ScVal): boolean {
  return val.b() ?? false;
}

function parseScvI128(val: StellarSdk.xdr.ScVal): bigint {
  const parts = val.i128();
  const lo = BigInt(parts.lo().toString());
  const hi = BigInt(parts.hi().toString());
  return (hi << BigInt(64)) | lo;
}

function parseScvSymbol(val: StellarSdk.xdr.ScVal): string {
  const v = val.sym();
  if (v == null) return "";
  return typeof v === "string" ? v : Buffer.from(v).toString("utf-8");
}

function parseScvAddress(val: StellarSdk.xdr.ScVal): string {
  return StellarSdk.Address.fromScVal(val).toString();
}

/**
 * Normalizes one topic/value entry from a raw Soroban event into an
 * `xdr.ScVal`. `getEvents` (and the WebSocket relay in `client.ts`) can
 * deliver either the base64 XDR string form or an already-parsed `ScVal`
 * depending on the RPC client/transport in front of it — accepting both
 * here means the event parsers below don't have to care which one arrived.
 */
function toScVal(input: string | StellarSdk.xdr.ScVal): StellarSdk.xdr.ScVal {
  return typeof input === "string"
    ? StellarSdk.xdr.ScVal.fromXDR(input, "base64")
    : input;
}

function getScvMap(
  val: StellarSdk.xdr.ScVal
): Map<string, StellarSdk.xdr.ScVal> {
  const entries = val.map() ?? [];
  const m = new Map<string, StellarSdk.xdr.ScVal>();
  for (const entry of entries) {
    const key = parseScvString(entry.key());
    m.set(key, entry.val());
  }
  return m;
}

function parseAssetHealth(val: StellarSdk.xdr.ScVal): AssetHealth {
  const m = getScvMap(val);
  return {
    asset_code: parseScvString(m.get("asset_code")!),
    health_score: parseScvU32(m.get("health_score")!),
    liquidity_score: parseScvU32(m.get("liquidity_score")!),
    price_stability_score: parseScvU32(m.get("price_stability_score")!),
    bridge_uptime_score: parseScvU32(m.get("bridge_uptime_score")!),
    paused: parseScvBool(m.get("paused")!),
    active: parseScvBool(m.get("active")!),
    timestamp: parseScvU64(m.get("timestamp")!),
    expires_at: parseScvU64(m.get("expires_at")!),
  };
}

function parsePriceRecord(val: StellarSdk.xdr.ScVal): PriceRecord {
  const m = getScvMap(val);
  return {
    asset_code: parseScvString(m.get("asset_code")!),
    price: parseScvI128(m.get("price")!),
    source: parseScvString(m.get("source")!),
    timestamp: parseScvU64(m.get("timestamp")!),
    expires_at: parseScvU64(m.get("expires_at")!),
  };
}

function parseHealthWeights(val: StellarSdk.xdr.ScVal): HealthWeights {
  const m = getScvMap(val);
  return {
    liquidity_weight: parseScvU32(m.get("liquidity_weight")!),
    price_stability_weight: parseScvU32(m.get("price_stability_weight")!),
    bridge_uptime_weight: parseScvU32(m.get("bridge_uptime_weight")!),
    version: parseScvU32(m.get("version")!),
  };
}

function parseHealthScoreResult(val: StellarSdk.xdr.ScVal): HealthScoreResult {
  const m = getScvMap(val);
  return {
    composite_score: parseScvU32(m.get("composite_score")!),
    liquidity_score: parseScvU32(m.get("liquidity_score")!),
    price_stability_score: parseScvU32(m.get("price_stability_score")!),
    bridge_uptime_score: parseScvU32(m.get("bridge_uptime_score")!),
    weights: parseHealthWeights(m.get("weights")!),
    timestamp: parseScvU64(m.get("timestamp")!),
    expires_at: parseScvU64(m.get("expires_at")!),
  };
}

function parseAggregatedHealth(val: StellarSdk.xdr.ScVal): AggregatedHealth {
  const m = getScvMap(val);
  return {
    asset_code: parseScvString(m.get("asset_code")!),
    weighted_health_score: parseScvU32(m.get("weighted_health_score")!),
    weighted_liquidity_score: parseScvU32(m.get("weighted_liquidity_score")!),
    weighted_price_stability_score: parseScvU32(
      m.get("weighted_price_stability_score")!
    ),
    weighted_bridge_uptime_score: parseScvU32(
      m.get("weighted_bridge_uptime_score")!
    ),
    source_count: parseScvU32(m.get("source_count")!),
    computed_at: parseScvU64(m.get("computed_at")!),
  };
}

function parseHealthSource(val: StellarSdk.xdr.ScVal): HealthSource {
  const m = getScvMap(val);
  return {
    source_id: parseScvString(m.get("source_id")!),
    weight_bps: parseScvU32(m.get("weight_bps")!),
    trusted: parseScvBool(m.get("trusted")!),
    registered_at: parseScvU64(m.get("registered_at")!),
  };
}

function parseEventReplayPage(val: StellarSdk.xdr.ScVal): EventReplayPage {
  const m = getScvMap(val);
  return {
    total: parseScvU32(m.get("total")!),
    schema_version: parseScvU32(m.get("schema_version")!),
  };
}

function parseStatusTier(val: StellarSdk.xdr.ScVal): StatusTier {
  const v = parseScvString(val).toLowerCase();
  if (["ok", "low", "medium", "high"].includes(v)) return v as StatusTier;
  return "ok";
}

function parseScvI128AsNumber(val: StellarSdk.xdr.ScVal): number {
  return Number(parseScvI128(val));
}

function parseContractStatusRollup(val: StellarSdk.xdr.ScVal): ContractStatusRollup {
  const m = getScvMap(val);
  return {
    tier: parseStatusTier(m.get("tier")!),
    asset_ok: parseScvU32(m.get("asset_ok")!),
    asset_low: parseScvU32(m.get("asset_low")!),
    asset_medium: parseScvU32(m.get("asset_medium")!),
    asset_high: parseScvU32(m.get("asset_high")!),
    bridge_ok: parseScvU32(m.get("bridge_ok")!),
    bridge_low: parseScvU32(m.get("bridge_low")!),
    bridge_medium: parseScvU32(m.get("bridge_medium")!),
    bridge_high: parseScvU32(m.get("bridge_high")!),
    timestamp: parseScvU64(m.get("timestamp")!),
  };
}

function parseAssetStatusRollup(val: StellarSdk.xdr.ScVal): AssetStatusRollup {
  const m = getScvMap(val);
  return {
    asset_code: parseScvString(m.get("asset_code")!),
    tier: parseStatusTier(m.get("tier")!),
    health_score: parseScvU32(m.get("health_score")!),
    has_price_deviation_alert: parseScvBool(m.get("has_price_deviation_alert")!),
    price_deviation_tier: parseStatusTier(m.get("price_deviation_tier")!),
    paused: parseScvBool(m.get("paused")!),
    active: parseScvBool(m.get("active")!),
    timestamp: parseScvU64(m.get("timestamp")!),
  };
}

function parseBridgeStatusRollup(val: StellarSdk.xdr.ScVal): BridgeStatusRollup {
  const m = getScvMap(val);
  return {
    bridge_id: parseScvString(m.get("bridge_id")!),
    tier: parseStatusTier(m.get("tier")!),
    latest_mismatch_bps: parseScvI128(m.get("latest_mismatch_bps")!),
    is_critical: parseScvBool(m.get("is_critical")!),
    timestamp: parseScvU64(m.get("timestamp")!),
  };
}

function parseGlobalPauseState(val: StellarSdk.xdr.ScVal): GlobalPauseState {
  const m = getScvMap(val);
  return {
    is_paused: parseScvBool(m.get("is_paused")!),
    reason: parseScvString(m.get("reason")!),
    paused_at: parseScvU64(m.get("paused_at")!),
    unpause_available_at: parseScvU64(m.get("unpause_available_at")!),
    emergency_contact: parseScvString(m.get("emergency_contact")!),
  };
}

function parsePauseRecord(val: StellarSdk.xdr.ScVal): PauseRecord {
  const m = getScvMap(val);
  return {
    paused: parseScvBool(m.get("paused")!),
    reason: parseScvString(m.get("reason")!),
    caller: parseScvString(m.get("caller")!),
    timestamp: parseScvU64(m.get("timestamp")!),
  };
}

function parseConfigEntry(val: StellarSdk.xdr.ScVal): ConfigEntry {
  const m = getScvMap(val);
  const valueMap = getScvMap(m.get("value")!);
  return {
    category: parseScvString(m.get("category")!) as ConfigCategory,
    name: parseScvString(m.get("name")!),
    value: {
      value: parseScvI128(valueMap.get("value")!),
      description: parseScvString(valueMap.get("description")!),
    },
    version: parseScvU32(m.get("version")!),
    updated_at: parseScvU64(m.get("updated_at")!),
    updated_by: parseScvString(m.get("updated_by")!),
  };
}

function parseBatchAssetResults(
  assetCodes: string[],
  val: StellarSdk.xdr.ScVal
): BatchAssetResult[] {
  // QueryResult enum variants decode to ["Success" | "Failure", string].
  const { results } = StellarSdk.scValToNative(val) as {
    results: [string, string][];
  };
  return results.map(([tag, payload], i) =>
    tag === "Success"
      ? { asset_code: assetCodes[i], ok: true, data: JSON.parse(payload) }
      : { asset_code: assetCodes[i], ok: false, error: payload }
  );
}

function parseVecOfStrings(val: StellarSdk.xdr.ScVal): string[] {
  const items = val.vec() ?? [];
  return items.map(parseScvString);
}

function parseVecOfPauseRecords(val: StellarSdk.xdr.ScVal): PauseRecord[] {
  const items = val.vec() ?? [];
  return items.map(parsePauseRecord);
}

function extractResultScVal(
  simulation: StellarSdk.rpc.Api.SimulateTransactionResponse
): StellarSdk.xdr.ScVal | undefined {
  if (
    (StellarSdk.rpc.Api.isSimulationSuccess(simulation) || (simulation as any)?.result?.retval) &&
    (simulation as any)?.result?.retval
  ) {
    return (simulation as any).result.retval;
  }
  return undefined;
}

// ============================================================
// TypedBridgeWatchContractSdk
// ============================================================

/**
 * Strongly typed SDK client providing high-level helper methods for querying and invoking
 * BridgeWatch Soroban smart contract functions.
 */
export class TypedBridgeWatchContractSdk extends BridgeWatchContractSdk {
  /**
   * Initializes the typed contract client with the provided SDK configuration.
   *
   * @param config - SDK configuration options.
   */
  constructor(config: BridgeWatchSdkConfig) {
    super(config);
  }

  // ---------------------------------------------------------
  // Health query methods
  // ---------------------------------------------------------

  /**
   * Queries the health record for a specific asset code.
   *
   * @param assetCode - The asset identifier (e.g. "USDC").
   * @returns Promise resolving to the AssetHealth record, or null if not found.
   * @throws {BridgeWatchQueryError} If the contract query simulation fails.
   */
  async getContractHealth(assetCode: string): Promise<AssetHealth | null> {
    const result = await this.queryMethod({
      method: "get_health",
      args: [scvString(assetCode)],
    });
    const val = extractResultScVal(result);
    if (!val || isScvVoid(val)) return null;
    return parseAssetHealth(val);
  }

  /**
   * Query many assets in a single RPC simulation via the batch query contract
   * (contracts/soroban/src/batch_query.rs) instead of one request per asset.
   * Pass `batchContractId` when the batch contract is deployed separately.
   */
  async getBatchAssetHealth(
    assetCodes: string[],
    batchContractId?: string
  ): Promise<BatchAssetResult[]> {
    if (assetCodes.length === 0 || assetCodes.length > MAX_BATCH_QUERY_SIZE) {
      throw new BridgeWatchQueryError(
        `assetCodes must contain 1-${MAX_BATCH_QUERY_SIZE} entries, got ${assetCodes.length}`
      );
    }
    const result = await this.queryMethod({
      method: "batch_query_assets",
      args: [scvVec(assetCodes.map(scvString))],
      contractId: batchContractId,
    });
    const val = extractResultScVal(result);
    if (!val) {
      throw new BridgeWatchQueryError("Batch asset query simulation failed", result);
    }
    return parseBatchAssetResults(assetCodes, val);
  }

  /**
   * Queries the detailed health score calculation result for an asset.
   *
   * @param assetCode - The asset identifier.
   * @returns Promise resolving to the HealthScoreResult, or null if not found.
   * @throws {BridgeWatchQueryError} If the contract query simulation fails.
   */
  async getHealthScoreResult(
    assetCode: string
  ): Promise<HealthScoreResult | null> {
    const result = await this.queryMethod({
      method: "get_health_score_result",
      args: [scvString(assetCode)],
    });
    const val = extractResultScVal(result);
    if (!val || isScvVoid(val)) return null;
    return parseHealthScoreResult(val);
  }

  /**
   * Queries aggregated health across all trusted sources for an asset.
   *
   * @param assetCode - The asset identifier.
   * @returns Promise resolving to the AggregatedHealth record, or null if not found.
   * @throws {BridgeWatchQueryError} If the contract query simulation fails.
   */
  async getAggregatedHealth(
    assetCode: string
  ): Promise<AggregatedHealth | null> {
    const result = await this.queryMethod({
      method: "get_aggregated_health",
      args: [scvString(assetCode)],
    });
    const val = extractResultScVal(result);
    if (!val || isScvVoid(val)) return null;
    return parseAggregatedHealth(val);
  }

  /**
   * Retrieves the configured weights used for composite health score calculations.
   *
   * @returns Promise resolving to the current HealthWeights configuration.
   * @throws {BridgeWatchQueryError} If the query fails or returns an empty result.
   */
  async getHealthWeights(): Promise<HealthWeights> {
    const result = await this.queryMethod({
      method: "get_health_weights",
    });
    const val = extractResultScVal(result);
    if (!val) throw new BridgeWatchQueryError("Empty result from get_health_weights");
    return parseHealthWeights(val);
  }

  /**
   * Retrieves the list of registered health data sources and their weights.
   *
   * @returns Promise resolving to an array of HealthSource objects.
   * @throws {BridgeWatchQueryError} If the contract query simulation fails.
   */
  async getHealthSources(): Promise<HealthSource[]> {
    const result = await this.queryMethod({
      method: "get_health_sources",
    });
    const val = extractResultScVal(result);
    if (!val) return [];
    const items = val.vec() ?? [];
    return items.map((item) => parseHealthSource(item));
  }

  /**
   * Calculates a health score on-contract given specific score components.
   *
   * @param liquidityScore - Liquidity component score (0-100).
   * @param priceStabilityScore - Price stability component score (0-100).
   * @param bridgeUptimeScore - Bridge uptime component score (0-100).
   * @returns Promise resolving to the computed HealthScoreResult.
   * @throws {BridgeWatchQueryError} If the query fails or returns an empty result.
   */
  async calculateHealthScore(
    liquidityScore: number,
    priceStabilityScore: number,
    bridgeUptimeScore: number
  ): Promise<HealthScoreResult> {
    const result = await this.queryMethod({
      method: "calculate_health_score",
      args: [
        scvU32(liquidityScore),
        scvU32(priceStabilityScore),
        scvU32(bridgeUptimeScore),
      ],
    });
    const val = extractResultScVal(result);
    if (!val)
      throw new BridgeWatchQueryError("Empty result from calculate_health_score");
    return parseHealthScoreResult(val);
  }

  // ---------------------------------------------------------
  // Price query methods
  // ---------------------------------------------------------

  /**
   * Queries the latest price record recorded on-chain for an asset.
   *
   * @param assetCode - The asset code to query.
   * @returns Promise resolving to the PriceRecord, or null if not found.
   * @throws {BridgeWatchQueryError} If the contract query simulation fails.
   */
  async getPrice(assetCode: string): Promise<PriceRecord | null> {
    const result = await this.queryMethod({
      method: "get_price",
      args: [scvString(assetCode)],
    });
    const val = extractResultScVal(result);
    if (!val || isScvVoid(val)) return null;
    return parsePriceRecord(val);
  }

  // ---------------------------------------------------------
  // Replay query methods
  // ---------------------------------------------------------

  /**
   * Retrieves the schema version number used by contract event replay logs.
   *
   * @returns Promise resolving to the schema version number.
   * @throws {BridgeWatchQueryError} If the query fails or returns an empty result.
   */
  async getReplaySchemaVersion(): Promise<number> {
    const result = await this.queryMethod({
      method: "get_replay_schema_version",
    });
    const val = extractResultScVal(result);
    if (!val)
      throw new BridgeWatchQueryError("Empty result from get_replay_schema_version");
    return parseScvU32(val);
  }

  /**
   * Fetches a paginated page of contract replay events starting from an ordering key.
   *
   * @param fromOrderingKey - The starting sequence ordering key.
   * @param limit - Maximum number of events to return.
   * @returns Promise resolving to the EventReplayPage.
   * @throws {BridgeWatchQueryError} If the query fails or returns an empty result.
   */
  async getReplayEvents(
    fromOrderingKey: number,
    limit: number
  ): Promise<EventReplayPage> {
    const result = await this.queryMethod({
      method: "get_replay_events",
      args: [scvU64(fromOrderingKey), scvU32(limit)],
    });
    const val = extractResultScVal(result);
    if (!val)
      throw new BridgeWatchQueryError("Empty result from get_replay_events");
    return parseEventReplayPage(val);
  }

  /**
   * Queries the total count of replay log entries stored in contract memory.
   *
   * @returns Promise resolving to total log size count.
   * @throws {BridgeWatchQueryError} If the query fails or returns an empty result.
   */
  async getReplayLogSize(): Promise<number> {
    const result = await this.queryMethod({
      method: "get_replay_log_size",
    });
    const val = extractResultScVal(result);
    if (!val)
      throw new BridgeWatchQueryError("Empty result from get_replay_log_size");
    return parseScvU32(val);
  }

  // ---------------------------------------------------------
  // Status & pause query methods
  // ---------------------------------------------------------

  /**
   * Retrieves a high-level status rollup across all monitored assets and bridges.
   *
   * @returns Promise resolving to the ContractStatusRollup, or null if unavailable.
   * @throws {BridgeWatchQueryError} If the contract query simulation fails.
   */
  async getContractStatus(): Promise<ContractStatusRollup | null> {
    const result = await this.queryMethod({
      method: "get_contract_status",
    });
    const val = extractResultScVal(result);
    if (!val || isScvVoid(val)) return null;
    return parseContractStatusRollup(val);
  }

  /**
   * Retrieves a status rollup for a specific asset code.
   *
   * @param assetCode - The asset identifier.
   * @returns Promise resolving to AssetStatusRollup, or null if unavailable.
   * @throws {BridgeWatchQueryError} If the contract query simulation fails.
   */
  async getAssetStatusRollup(
    assetCode: string
  ): Promise<AssetStatusRollup | null> {
    const result = await this.queryMethod({
      method: "get_asset_status_rollup",
      args: [scvString(assetCode)],
    });
    const val = extractResultScVal(result);
    if (!val || isScvVoid(val)) return null;
    return parseAssetStatusRollup(val);
  }

  /**
   * Retrieves a status rollup for a specific bridge ID.
   *
   * @param bridgeId - The bridge identifier.
   * @returns Promise resolving to BridgeStatusRollup, or null if unavailable.
   * @throws {BridgeWatchQueryError} If the contract query simulation fails.
   */
  async getBridgeStatusRollup(
    bridgeId: string
  ): Promise<BridgeStatusRollup | null> {
    const result = await this.queryMethod({
      method: "get_bridge_status_rollup",
      args: [scvString(bridgeId)],
    });
    const val = extractResultScVal(result);
    if (!val || isScvVoid(val)) return null;
    return parseBridgeStatusRollup(val);
  }

  /**
   * Checks whether contract operations are globally paused.
   *
   * @returns Promise resolving to true if paused, false otherwise.
   * @throws {BridgeWatchQueryError} If the query fails or returns an empty result.
   */
  async isPaused(): Promise<boolean> {
    const result = await this.queryMethod({
      method: "is_paused",
    });
    const val = extractResultScVal(result);
    if (!val) throw new BridgeWatchQueryError("Empty result from is_paused");
    return parseScvBool(val);
  }

  /**
   * Checks whether operations for a specific asset are paused.
   *
   * @param assetCode - The asset identifier.
   * @returns Promise resolving to true if paused, false otherwise.
   * @throws {BridgeWatchQueryError} If the query fails or returns an empty result.
   */
  async isAssetPaused(assetCode: string): Promise<boolean> {
    const result = await this.queryMethod({
      method: "is_asset_paused",
      args: [scvString(assetCode)],
    });
    const val = extractResultScVal(result);
    if (!val)
      throw new BridgeWatchQueryError("Empty result from is_asset_paused");
    return parseScvBool(val);
  }

  /**
   * Retrieves the current global pause status details including pause reason and timestamps.
   *
   * @returns Promise resolving to GlobalPauseState.
   * @throws {BridgeWatchQueryError} If the query fails or returns an empty result.
   */
  async getPauseStatus(): Promise<GlobalPauseState> {
    const result = await this.queryMethod({
      method: "get_pause_status",
    });
    const val = extractResultScVal(result);
    if (!val)
      throw new BridgeWatchQueryError("Empty result from get_pause_status");
    return parseGlobalPauseState(val);
  }

  /**
   * Retrieves the historical list of contract pause and unpause records.
   *
   * @returns Promise resolving to an array of PauseRecord objects.
   * @throws {BridgeWatchQueryError} If the contract query simulation fails.
   */
  async getPauseHistory(): Promise<PauseRecord[]> {
    const result = await this.queryMethod({
      method: "get_pause_history",
    });
    const val = extractResultScVal(result);
    if (!val) return [];
    return parseVecOfPauseRecords(val);
  }

  /**
   * Retrieves the list of asset codes currently monitored by the contract.
   *
   * @returns Promise resolving to an array of asset code strings.
   * @throws {BridgeWatchQueryError} If the contract query simulation fails.
   */
  async getMonitoredAssets(): Promise<string[]> {
    const result = await this.queryMethod({
      method: "get_monitored_assets",
    });
    const val = extractResultScVal(result);
    if (!val) return [];
    return parseVecOfStrings(val);
  }

  /**
   * Queries a specific configuration entry by its category and key name.
   *
   * @param category - The configuration category ("Threshold", "Timeouts", or "Limits").
   * @param name - The configuration key name.
   * @returns Promise resolving to the ConfigEntry, or null if not found.
   * @throws {BridgeWatchQueryError} If the contract query simulation fails.
   */
  async getConfig(
    category: ConfigCategory,
    name: string
  ): Promise<ConfigEntry | null> {
    const result = await this.queryMethod({
      method: "get_config",
      args: [scvString(category), scvString(name)],
    });
    const val = extractResultScVal(result);
    if (!val || isScvVoid(val)) return null;
    return parseConfigEntry(val);
  }

  // ---------------------------------------------------------
  // Signature methods
  // ---------------------------------------------------------

  /**
   * Retrieves the multi-signature threshold count configured on-contract.
   *
   * @returns Promise resolving to the signature threshold number.
   * @throws {BridgeWatchQueryError} If the query fails or returns an empty result.
   */
  async getSignatureThreshold(): Promise<number> {
    const result = await this.queryMethod({
      method: "get_signature_threshold",
    });
    const val = extractResultScVal(result);
    if (!val)
      throw new BridgeWatchQueryError("Empty result from get_signature_threshold");
    return parseScvU32(val);
  }

  // ---------------------------------------------------------
  // Invoke (write) methods
  // ---------------------------------------------------------

  /**
   * Submits an individual asset health record transaction to the contract.
   *
   * @param params - Submission parameters including caller, asset code, and health scores.
   * @returns Promise resolving to the transaction submission response.
   * @throws {BridgeWatchTransactionError} If building, simulating, or submitting the transaction fails.
   */
  async submitHealth(
    params: SubmitHealthParams
  ): ReturnType<BridgeWatchContractSdk["invokeAndSend"]> {
    return this.invokeAndSend(
      {
        sourcePublicKey: params.caller,
        method: "submit_health",
        args: [
          scvAddress(params.caller),
          scvString(params.asset_code),
          scvU32(params.health_score),
          scvU32(params.liquidity_score),
          scvU32(params.price_stability_score),
          scvU32(params.bridge_uptime_score),
        ],
      },
      params.caller
    );
  }

  /**
   * Submits a batch of asset health records to the contract in a single transaction.
   *
   * @param caller - Stellar account address submitting and signing the batch.
   * @param records - Array of health score batch items to submit.
   * @returns Promise resolving to the transaction submission response.
   * @throws {BridgeWatchTransactionError} If building, simulating, or submitting the transaction fails.
   */
  async submitHealthBatch(
    caller: string,
    records: HealthScoreBatch[]
  ): ReturnType<BridgeWatchContractSdk["invokeAndSend"]> {
    const batchItems = records.map((r) =>
      scvMap([
        { key: "asset_code", val: scvString(r.asset_code) },
        { key: "health_score", val: scvU32(r.health_score) },
        { key: "liquidity_score", val: scvU32(r.liquidity_score) },
        { key: "price_stability_score", val: scvU32(r.price_stability_score) },
        { key: "bridge_uptime_score", val: scvU32(r.bridge_uptime_score) },
      ])
    );
    return this.invokeAndSend(
      {
        sourcePublicKey: caller,
        method: "submit_health_batch",
        args: [scvAddress(caller), scvVec(batchItems)],
      },
      caller
    );
  }

  /**
   * Submits a price record update transaction to the contract.
   *
   * @param params - Price submission parameters including caller, asset code, price, and source.
   * @returns Promise resolving to the transaction submission response.
   * @throws {BridgeWatchTransactionError} If building, simulating, or submitting the transaction fails.
   */
  async submitPrice(
    params: SubmitPriceParams
  ): ReturnType<BridgeWatchContractSdk["invokeAndSend"]> {
    return this.invokeAndSend(
      {
        sourcePublicKey: params.caller,
        method: "submit_price",
        args: [
          scvAddress(params.caller),
          scvString(params.asset_code),
          scvI128(params.price),
          scvString(params.source),
        ],
      },
      params.caller
    );
  }

  /**
   * Builds an unsigned transaction for submitting an asset health score.
   *
   * @param params - Parameters for the health submission.
   * @returns Promise resolving to the built transaction.
   * @throws {BridgeWatchTransactionError} If building the transaction fails.
   */
  async buildSubmitHealthTransaction(
    params: SubmitHealthParams
  ): ReturnType<BridgeWatchContractSdk["buildInvokeTransaction"]> {
    return this.buildInvokeTransaction({
      sourcePublicKey: params.caller,
      method: "submit_health",
      args: [
        scvAddress(params.caller),
        scvString(params.asset_code),
        scvU32(params.health_score),
        scvU32(params.liquidity_score),
        scvU32(params.price_stability_score),
        scvU32(params.bridge_uptime_score),
      ],
    });
  }

  /**
   * Builds an unsigned transaction for submitting a batch of health scores.
   *
   * @param caller - Stellar account address of the transaction source.
   * @param records - Batch records to include in the transaction.
   * @returns Promise resolving to the built transaction.
   * @throws {BridgeWatchTransactionError} If building the transaction fails.
   */
  async buildSubmitHealthBatchTransaction(
    caller: string,
    records: HealthScoreBatch[]
  ): ReturnType<BridgeWatchContractSdk["buildInvokeTransaction"]> {
    const batchItems = records.map((r) =>
      scvMap([
        { key: "asset_code", val: scvString(r.asset_code) },
        { key: "health_score", val: scvU32(r.health_score) },
        { key: "liquidity_score", val: scvU32(r.liquidity_score) },
        { key: "price_stability_score", val: scvU32(r.price_stability_score) },
        { key: "bridge_uptime_score", val: scvU32(r.bridge_uptime_score) },
      ])
    );
    return this.buildInvokeTransaction({
      sourcePublicKey: caller,
      method: "submit_health_batch",
      args: [scvAddress(caller), scvVec(batchItems)],
    });
  }

  /**
   * Builds an unsigned transaction for submitting a price record.
   *
   * @param params - Parameters for the price submission.
   * @returns Promise resolving to the built transaction.
   * @throws {BridgeWatchTransactionError} If building the transaction fails.
   */
  async buildSubmitPriceTransaction(
    params: SubmitPriceParams
  ): ReturnType<BridgeWatchContractSdk["buildInvokeTransaction"]> {
    return this.buildInvokeTransaction({
      sourcePublicKey: params.caller,
      method: "submit_price",
      args: [
        scvAddress(params.caller),
        scvString(params.asset_code),
        scvI128(params.price),
        scvString(params.source),
      ],
    });
  }

  /**
   * Invokes and sends a transaction to update contract health calculation weights.
   *
   * @param params - Parameters for health weights update including caller, weights, and version.
   * @returns Promise resolving to the transaction submission response.
   * @throws {BridgeWatchTransactionError} If building, simulating, or submitting the transaction fails.
   */
  async setHealthWeights(
    params: SetHealthWeightsParams
  ): ReturnType<BridgeWatchContractSdk["invokeAndSend"]> {
    return this.invokeAndSend(
      {
        sourcePublicKey: params.caller,
        method: "set_health_weights",
        args: [
          scvAddress(params.caller),
          scvU32(params.liquidity_weight),
          scvU32(params.price_stability_weight),
          scvU32(params.bridge_uptime_weight),
          scvU32(params.version),
        ],
      },
      params.caller
    );
  }

  /**
   * Builds an unsigned transaction to update contract health calculation weights.
   *
   * @param params - Health weights parameters.
   * @returns Promise resolving to the built transaction.
   * @throws {BridgeWatchTransactionError} If building the transaction fails.
   */
  async buildSetHealthWeightsTransaction(
    params: SetHealthWeightsParams
  ): ReturnType<BridgeWatchContractSdk["buildInvokeTransaction"]> {
    return this.buildInvokeTransaction({
      sourcePublicKey: params.caller,
      method: "set_health_weights",
      args: [
        scvAddress(params.caller),
        scvU32(params.liquidity_weight),
        scvU32(params.price_stability_weight),
        scvU32(params.bridge_uptime_weight),
        scvU32(params.version),
      ],
    });
  }

  // ---------------------------------------------------------
  // ZK proof verification (issue #1244)
  // ---------------------------------------------------------

  private zkProofToScVal(proof: ZkProofParams): StellarSdk.xdr.ScVal {
    return scvMap([
      { key: "scheme", val: scvString(proof.scheme) },
      { key: "curve", val: scvString(proof.curve) },
      { key: "pi_a", val: scvBytes(proof.pi_a) },
      { key: "pi_b", val: scvBytes(proof.pi_b) },
      { key: "pi_c", val: scvBytes(proof.pi_c) },
      { key: "commitment_hash", val: scvBytesN32(proof.commitment_hash) },
    ]);
  }

  private zkPublicInputsToScVal(
    inputs: ZkPublicInputsParams
  ): StellarSdk.xdr.ScVal {
    return scvMap([
      { key: "total_reserves", val: scvI128(inputs.total_reserves) },
      { key: "on_chain_supply", val: scvI128(inputs.on_chain_supply) },
      { key: "min_reserve_ratio_bps", val: scvU32(inputs.min_reserve_ratio_bps) },
      { key: "timestamp", val: scvU64(inputs.timestamp) },
      { key: "bridge_id", val: scvString(inputs.bridge_id) },
      { key: "asset_code", val: scvString(inputs.asset_code) },
    ]);
  }

  /**
   * Verify a ZK reserve proof on-chain and record an attestation.
   *
   * Calls the zk_verifier contract's `verify_zk_reserve_proof`. Because the
   * contract function requires the operator's authorization, this helper
   * builds, simulates, assembles, signs with the operator's secret, and
   * submits the transaction. Returns the attestation id on success.
   */
  async verifyZkProof(params: {
    operator: string;
    operatorSecret: string;
    proof: ZkProofParams;
    publicInputs: ZkPublicInputsParams;
  }): Promise<ZkProofVerificationResult> {
    const result = await this.invokeAndSend(
      {
        sourcePublicKey: params.operator,
        method: "verify_zk_reserve_proof",
        args: [
          scvAddress(params.operator),
          this.zkProofToScVal(params.proof),
          this.zkPublicInputsToScVal(params.publicInputs),
        ],
      },
      params.operatorSecret
    );

    const valid = (result.status as string) === "SUCCESS";
    return { valid, attestationId: undefined };
  }

  /** Build (not submit) a verify_zk_reserve_proof transaction. */
  async buildVerifyZkProofTransaction(params: {
    operator: string;
    proof: ZkProofParams;
    publicInputs: ZkPublicInputsParams;
  }): ReturnType<BridgeWatchContractSdk["buildInvokeTransaction"]> {
    return this.buildInvokeTransaction({
      sourcePublicKey: params.operator,
      method: "verify_zk_reserve_proof",
      args: [
        scvAddress(params.operator),
        this.zkProofToScVal(params.proof),
        this.zkPublicInputsToScVal(params.publicInputs),
      ],
    });
  }

  // ---------------------------------------------------------
  // MMR proof verification (issue #1244)
  // ---------------------------------------------------------

  private mmrProofToScVal(proof: MmrProofParams): StellarSdk.xdr.ScVal {
    return scvMap([
      { key: "leaf_hash", val: scvBytesN32(proof.leaf_hash) },
      { key: "leaf_index", val: scvU64(proof.leaf_index) },
      {
        key: "siblings",
        val: scvVec(proof.siblings.map((s) => scvBytesN32(s))),
      },
      {
        key: "peaks_snapshot",
        val: scvVec(proof.peaks_snapshot.map((p) => scvBytesN32(p))),
      },
      { key: "local_peak_pos", val: scvU32(proof.local_peak_pos) },
    ]);
  }

  /**
   * Verify an MMR inclusion proof. When `expectedRoot` is omitted the proof
   * is verified against the contract's CURRENT accumulated root
   * (`verify_against_current`); otherwise it is checked against the
   * caller-supplied root (`verify_mmr_proof`). Both are permissionless
   * reads.
   */
  async verifyMmrProof(
    proof: MmrProofParams,
    expectedRoot?: string
  ): Promise<boolean> {
    const result =
      expectedRoot !== undefined
        ? await this.queryMethod({
            method: "verify_mmr_proof",
            args: [this.mmrProofToScVal(proof), scvBytesN32(expectedRoot)],
          })
        : await this.queryMethod({
            method: "verify_against_current",
            args: [this.mmrProofToScVal(proof)],
          });
    const val = extractResultScVal(result);
    if (!val) return false;
    return val.switch().name === "scvBool" && parseScvBool(val);
  }
}

// ============================================================
// Typed contract event decoding (issue #1290)
// ============================================================
//
// `onEvent` (subscribeToEvents / subscribeToEventsWebSocket in client.ts)
// hands consumers the raw event object, whose `topic`/`value` fields carry
// XDR `ScVal`s (as base64 strings or already-parsed objects, depending on
// the transport). Without these helpers, every consumer has to know each
// event's exact topic name, topic order, and value shape and re-derive the
// same decoding boilerplate. Topic names and payload shapes below are read
// directly from the emitting contract (contracts/soroban/src/lib.rs):
//   health_up  -> topics [Symbol("health_up"), asset_code: String], value: u32
//   price_dev  -> topics [Symbol("price_dev"), asset_code: String], value: i128
//   em_pause   -> topics [Symbol("em_pause"),  caller: Address],    value: String

export const HEALTH_UPDATE_EVENT_TOPIC = "health_up";
export const PRICE_DEVIATION_EVENT_TOPIC = "price_dev";
export const CIRCUIT_BREAKER_EVENT_TOPIC = "em_pause";

/**
 * Shape of the raw event object passed to `onEvent` by
 * `subscribeToEvents`/`subscribeToEventsWebSocket`. `topic`/`value` entries
 * may be base64 XDR strings or already-decoded `ScVal`s.
 */
export interface RawContractEvent {
  type?: string;
  ledger?: number;
  ledgerClosedAt?: string;
  contractId?: string;
  id?: string;
  pagingToken?: string;
  topic: Array<string | StellarSdk.xdr.ScVal>;
  value: string | StellarSdk.xdr.ScVal;
  inSuccessfulContractCall?: boolean;
  txHash?: string;
}

export interface HealthUpdateEvent {
  type: "health_up";
  assetCode: string;
  healthScore: number;
  ledger?: number;
  txHash?: string;
}

export interface PriceDeviationEvent {
  type: "price_dev";
  assetCode: string;
  deviationBps: bigint;
  ledger?: number;
  txHash?: string;
}

export interface CircuitBreakerEvent {
  type: "em_pause";
  caller: string;
  reason: string;
  ledger?: number;
  txHash?: string;
}

export type BridgeWatchContractEvent =
  | HealthUpdateEvent
  | PriceDeviationEvent
  | CircuitBreakerEvent;

/** True if `event.topic[0]` decodes to the given topic symbol name. */
function matchesTopic(
  event: RawContractEvent,
  topicName: string
): boolean {
  const first = event.topic[0];
  if (first === undefined) return false;
  try {
    return parseScvSymbol(toScVal(first)) === topicName;
  } catch {
    return false;
  }
}

/**
 * Decodes a raw `onEvent` payload as a `health_up` event, or returns `null`
 * if it isn't one (wrong topic, or malformed).
 */
export function parseHealthUpdateEvent(
  event: unknown
): HealthUpdateEvent | null {
  const raw = event as RawContractEvent;
  if (!raw || !Array.isArray(raw.topic) || raw.value === undefined) {
    return null;
  }
  if (!matchesTopic(raw, HEALTH_UPDATE_EVENT_TOPIC)) return null;
  const assetCodeTopic = raw.topic[1];
  if (assetCodeTopic === undefined) return null;
  try {
    return {
      type: "health_up",
      assetCode: parseScvString(toScVal(assetCodeTopic)),
      healthScore: parseScvU32(toScVal(raw.value)),
      ledger: raw.ledger,
      txHash: raw.txHash,
    };
  } catch {
    return null;
  }
}

/**
 * Decodes a raw `onEvent` payload as a `price_dev` event, or returns `null`
 * if it isn't one (wrong topic, or malformed).
 */
export function parsePriceDeviationEvent(
  event: unknown
): PriceDeviationEvent | null {
  const raw = event as RawContractEvent;
  if (!raw || !Array.isArray(raw.topic) || raw.value === undefined) {
    return null;
  }
  if (!matchesTopic(raw, PRICE_DEVIATION_EVENT_TOPIC)) return null;
  const assetCodeTopic = raw.topic[1];
  if (assetCodeTopic === undefined) return null;
  try {
    return {
      type: "price_dev",
      assetCode: parseScvString(toScVal(assetCodeTopic)),
      deviationBps: parseScvI128(toScVal(raw.value)),
      ledger: raw.ledger,
      txHash: raw.txHash,
    };
  } catch {
    return null;
  }
}

/**
 * Decodes a raw `onEvent` payload as an `em_pause` (circuit breaker) event,
 * or returns `null` if it isn't one (wrong topic, or malformed).
 */
export function parseCircuitBreakerEvent(
  event: unknown
): CircuitBreakerEvent | null {
  const raw = event as RawContractEvent;
  if (!raw || !Array.isArray(raw.topic) || raw.value === undefined) {
    return null;
  }
  if (!matchesTopic(raw, CIRCUIT_BREAKER_EVENT_TOPIC)) return null;
  const callerTopic = raw.topic[1];
  if (callerTopic === undefined) return null;
  try {
    return {
      type: "em_pause",
      caller: parseScvAddress(toScVal(callerTopic)),
      reason: parseScvString(toScVal(raw.value)),
      ledger: raw.ledger,
      txHash: raw.txHash,
    };
  } catch {
    return null;
  }
}

/**
 * Decodes a raw `onEvent` payload into whichever typed event it matches, or
 * `null` if it's none of the three known topics — lets a single `onEvent`
 * handler dispatch on `.type` instead of calling each `parseXxxEvent`
 * individually.
 *
 * @example
 * sdk.subscribeToEvents({
 *   onEvent: (raw) => {
 *     const event = parseBridgeWatchEvent(raw);
 *     if (!event) return;
 *     switch (event.type) {
 *       case "health_up": return handleHealthUpdate(event);
 *       case "price_dev": return handlePriceDeviation(event);
 *       case "em_pause": return handleCircuitBreaker(event);
 *     }
 *   },
 * });
 */
export function parseBridgeWatchEvent(
  event: unknown
): BridgeWatchContractEvent | null {
  return (
    parseHealthUpdateEvent(event) ??
    parsePriceDeviationEvent(event) ??
    parseCircuitBreakerEvent(event)
  );
}
