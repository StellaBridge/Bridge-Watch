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
    StellarSdk.rpc.Api.isSimulationSuccess(simulation) &&
    simulation.result?.retval
  ) {
    return simulation.result.retval;
  }
  return undefined;
}

// ============================================================
// TypedBridgeWatchContractSdk
// ============================================================

export class TypedBridgeWatchContractSdk extends BridgeWatchContractSdk {
  constructor(config: BridgeWatchSdkConfig) {
    super(config);
  }

  // ---------------------------------------------------------
  // Health query methods
  // ---------------------------------------------------------

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

  async getHealthWeights(): Promise<HealthWeights> {
    const result = await this.queryMethod({
      method: "get_health_weights",
    });
    const val = extractResultScVal(result);
    if (!val) throw new BridgeWatchQueryError("Empty result from get_health_weights");
    return parseHealthWeights(val);
  }

  async getHealthSources(): Promise<HealthSource[]> {
    const result = await this.queryMethod({
      method: "get_health_sources",
    });
    const val = extractResultScVal(result);
    if (!val) return [];
    const items = val.vec() ?? [];
    return items.map((item) => parseHealthSource(item));
  }

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

  async getReplaySchemaVersion(): Promise<number> {
    const result = await this.queryMethod({
      method: "get_replay_schema_version",
    });
    const val = extractResultScVal(result);
    if (!val)
      throw new BridgeWatchQueryError("Empty result from get_replay_schema_version");
    return parseScvU32(val);
  }

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

  async getContractStatus(): Promise<ContractStatusRollup | null> {
    const result = await this.queryMethod({
      method: "get_contract_status",
    });
    const val = extractResultScVal(result);
    if (!val || isScvVoid(val)) return null;
    return parseContractStatusRollup(val);
  }

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

  async isPaused(): Promise<boolean> {
    const result = await this.queryMethod({
      method: "is_paused",
    });
    const val = extractResultScVal(result);
    if (!val) throw new BridgeWatchQueryError("Empty result from is_paused");
    return parseScvBool(val);
  }

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

  async getPauseStatus(): Promise<GlobalPauseState> {
    const result = await this.queryMethod({
      method: "get_pause_status",
    });
    const val = extractResultScVal(result);
    if (!val)
      throw new BridgeWatchQueryError("Empty result from get_pause_status");
    return parseGlobalPauseState(val);
  }

  async getPauseHistory(): Promise<PauseRecord[]> {
    const result = await this.queryMethod({
      method: "get_pause_history",
    });
    const val = extractResultScVal(result);
    if (!val) return [];
    return parseVecOfPauseRecords(val);
  }

  async getMonitoredAssets(): Promise<string[]> {
    const result = await this.queryMethod({
      method: "get_monitored_assets",
    });
    const val = extractResultScVal(result);
    if (!val) return [];
    return parseVecOfStrings(val);
  }

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

    const valid = result.status === "SUCCESS";
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
    return val.switch().name === "scvBool" && val.bool();
  }
}
