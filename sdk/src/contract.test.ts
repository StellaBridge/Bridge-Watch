import { describe, expect, it, vi, beforeEach } from "vitest";
import * as StellarSdk from "@stellar/stellar-sdk";
import { TypedBridgeWatchContractSdk } from "./contract";
import type {
  AssetHealth,
  PriceRecord,
  HealthWeights,
  HealthScoreResult,
  AggregatedHealth,
  HealthSource,
  EventReplayPage,
} from "./contract";
import type { BridgeWatchSdkConfig } from "./types";

// Valid Stellar testnet public key for address tests
const TEST_CALLER = "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI";

const testConfig: BridgeWatchSdkConfig = {
  rpcUrl: "https://testnet.sorobanrpc.com",
  contractId: "CCONTRACT123",
  networkPassphrase: StellarSdk.Networks.TESTNET,
};

// ============================================================
// ScVal parsing unit tests
// ============================================================

describe("ScVal utility helpers", () => {
  it("scvVoid is void", () => {
    const val = StellarSdk.xdr.ScVal.scvVoid();
    expect(val.switch().name).toBe("scvVoid");
  });

  it("scvU32 creates a valid u32 ScVal", () => {
    const val = StellarSdk.xdr.ScVal.scvU32(85);
    expect(val.u32()).toBe(85);
  });

  it("scvString creates a valid string ScVal", () => {
    const val = StellarSdk.xdr.ScVal.scvString("USDC");
    expect(typeof val.str()).toBe("string");
  });

  it("scvI128 creates a valid i128 ScVal from bigint", () => {
    const parts = new StellarSdk.xdr.Int128Parts({
      lo: StellarSdk.xdr.Uint64.fromString("1000000"),
      hi: StellarSdk.xdr.Int64.fromString("0"),
    });
    const val = StellarSdk.xdr.ScVal.scvI128(parts);
    expect(val.i128()).toBeDefined();
  });

  it("scvMap creates a ScVal with map entries", () => {
    const val = StellarSdk.xdr.ScVal.scvMap([
      new StellarSdk.xdr.ScMapEntry({
        key: StellarSdk.xdr.ScVal.scvString("name"),
        val: StellarSdk.xdr.ScVal.scvString("test"),
      }),
    ]);
    expect(val.map()).toHaveLength(1);
  });

  it("scvVec creates a ScVal with vec entries", () => {
    const val = StellarSdk.xdr.ScVal.scvVec([
      StellarSdk.xdr.ScVal.scvU32(1),
      StellarSdk.xdr.ScVal.scvU32(2),
    ]);
    const items = val.vec();
    expect(items).toHaveLength(2);
  });
});

// ============================================================
// TypedBridgeWatchContractSdk integration tests
// ============================================================

describe("TypedBridgeWatchContractSdk query wrappers", () => {
  let sdk: TypedBridgeWatchContractSdk;
  let queryMethodSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    sdk = new TypedBridgeWatchContractSdk(testConfig);
    queryMethodSpy = vi
      .spyOn(sdk, "queryMethod" as keyof typeof sdk)
      .mockResolvedValue({} as never);
  });

  it("getContractHealth calls queryMethod with get_health", async () => {
    await sdk.getContractHealth("USDC");
    expect(queryMethodSpy).toHaveBeenCalledWith({
      method: "get_health",
      args: [expect.any(Object)],
    });
  });

  it("getPrice calls queryMethod with get_price", async () => {
    await sdk.getPrice("USDC");
    expect(queryMethodSpy).toHaveBeenCalledWith({
      method: "get_price",
      args: [expect.any(Object)],
    });
  });

  it("getHealthWeights calls queryMethod with get_health_weights", async () => {
    await sdk.getHealthWeights().catch(() => {});
    expect(queryMethodSpy).toHaveBeenCalledWith({
      method: "get_health_weights",
      args: undefined,
    });
  });

  it("getHealthSources calls queryMethod with get_health_sources", async () => {
    await sdk.getHealthSources().catch(() => {});
    expect(queryMethodSpy).toHaveBeenCalledWith({
      method: "get_health_sources",
      args: undefined,
    });
  });

  it("calculateHealthScore calls queryMethod with calculate_health_score", async () => {
    await sdk.calculateHealthScore(90, 80, 95).catch(() => {});
    expect(queryMethodSpy).toHaveBeenCalledWith({
      method: "calculate_health_score",
      args: [expect.any(Object), expect.any(Object), expect.any(Object)],
    });
  });

  it("getAggregatedHealth calls queryMethod with get_aggregated_health", async () => {
    await sdk.getAggregatedHealth("USDC");
    expect(queryMethodSpy).toHaveBeenCalledWith({
      method: "get_aggregated_health",
      args: [expect.any(Object)],
    });
  });

  it("getHealthScoreResult calls queryMethod with get_health_score_result", async () => {
    await sdk.getHealthScoreResult("USDC");
    expect(queryMethodSpy).toHaveBeenCalledWith({
      method: "get_health_score_result",
      args: [expect.any(Object)],
    });
  });

  it("getSignatureThreshold calls queryMethod with get_signature_threshold", async () => {
    await sdk.getSignatureThreshold().catch(() => {});
    expect(queryMethodSpy).toHaveBeenCalledWith({
      method: "get_signature_threshold",
      args: undefined,
    });
  });

  it("getReplaySchemaVersion calls queryMethod with get_replay_schema_version", async () => {
    await sdk.getReplaySchemaVersion().catch(() => {});
    expect(queryMethodSpy).toHaveBeenCalledWith({
      method: "get_replay_schema_version",
      args: undefined,
    });
  });

  it("getReplayEvents calls queryMethod with get_replay_events", async () => {
    await sdk.getReplayEvents(0, 10).catch(() => {});
    expect(queryMethodSpy).toHaveBeenCalledWith({
      method: "get_replay_events",
      args: [expect.any(Object), expect.any(Object)],
    });
  });

  it("getReplayLogSize calls queryMethod with get_replay_log_size", async () => {
    await sdk.getReplayLogSize().catch(() => {});
    expect(queryMethodSpy).toHaveBeenCalledWith({
      method: "get_replay_log_size",
      args: undefined,
    });
  });
});

describe("TypedBridgeWatchContractSdk invoke wrappers", () => {
  let sdk: TypedBridgeWatchContractSdk;
  let invokeAndSendSpy: ReturnType<typeof vi.spyOn>;
  let buildInvokeTransactionSpy: ReturnType<typeof vi.spyOn>;
  let simulateTransactionSpy: ReturnType<typeof vi.spyOn>;
  let sendTransactionSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    sdk = new TypedBridgeWatchContractSdk(testConfig);
    invokeAndSendSpy = vi
      .spyOn(sdk, "invokeAndSend" as keyof typeof sdk)
      .mockResolvedValue({ status: "SUCCESS" } as never);
    buildInvokeTransactionSpy = vi
      .spyOn(sdk, "buildInvokeTransaction" as keyof typeof sdk)
      .mockResolvedValue({} as never);
    simulateTransactionSpy = vi
      .spyOn(sdk, "simulateTransaction" as keyof typeof sdk)
      .mockResolvedValue({} as never);
    sendTransactionSpy = vi
      .spyOn(sdk, "sendTransaction" as keyof typeof sdk)
      .mockResolvedValue({ status: "SUCCESS" } as never);
  });

  it("submitHealth calls invokeAndSend with submit_health method", async () => {
    await sdk.submitHealth({
      caller: TEST_CALLER,
      asset_code: "USDC",
      health_score: 85,
      liquidity_score: 90,
      price_stability_score: 80,
      bridge_uptime_score: 95,
    });
    expect(invokeAndSendSpy).toHaveBeenCalled();
    const arg = invokeAndSendSpy.mock.calls[0][0];
    expect(arg.method).toBe("submit_health");
    expect(arg.sourcePublicKey).toBe(TEST_CALLER);
  });

  it("submitHealthBatch calls invokeAndSend with submit_health_batch method", async () => {
    await sdk.submitHealthBatch(TEST_CALLER, [
      {
        asset_code: "USDC",
        health_score: 85,
        liquidity_score: 90,
        price_stability_score: 80,
        bridge_uptime_score: 95,
      },
    ]);
    expect(invokeAndSendSpy).toHaveBeenCalled();
    const arg = invokeAndSendSpy.mock.calls[0][0];
    expect(arg.method).toBe("submit_health_batch");
    expect(arg.sourcePublicKey).toBe(TEST_CALLER);
  });

  it("submitPrice calls invokeAndSend with submit_price method", async () => {
    await sdk.submitPrice({
      caller: TEST_CALLER,
      asset_code: "USDC",
      price: 1000000n,
      source: "oracle-1",
    });
    expect(invokeAndSendSpy).toHaveBeenCalled();
    const arg = invokeAndSendSpy.mock.calls[0][0];
    expect(arg.method).toBe("submit_price");
    expect(arg.sourcePublicKey).toBe(TEST_CALLER);
  });

  it("buildSubmitHealthTransaction calls buildInvokeTransaction", async () => {
    await sdk.buildSubmitHealthTransaction({
      caller: TEST_CALLER,
      asset_code: "USDC",
      health_score: 85,
      liquidity_score: 90,
      price_stability_score: 80,
      bridge_uptime_score: 95,
    });
    expect(buildInvokeTransactionSpy).toHaveBeenCalled();
    const arg = buildInvokeTransactionSpy.mock.calls[0][0];
    expect(arg.method).toBe("submit_health");
  });

  it("buildSubmitHealthBatchTransaction calls buildInvokeTransaction", async () => {
    await sdk.buildSubmitHealthBatchTransaction(TEST_CALLER, [
      {
        asset_code: "USDC",
        health_score: 85,
        liquidity_score: 90,
        price_stability_score: 80,
        bridge_uptime_score: 95,
      },
    ]);
    expect(buildInvokeTransactionSpy).toHaveBeenCalled();
    const arg = buildInvokeTransactionSpy.mock.calls[0][0];
    expect(arg.method).toBe("submit_health_batch");
  });

  it("buildSubmitPriceTransaction calls buildInvokeTransaction", async () => {
    await sdk.buildSubmitPriceTransaction({
      caller: TEST_CALLER,
      asset_code: "USDC",
      price: 1000000n,
      source: "oracle-1",
    });
    expect(buildInvokeTransactionSpy).toHaveBeenCalled();
    const arg = buildInvokeTransactionSpy.mock.calls[0][0];
    expect(arg.method).toBe("submit_price");
  });
});

describe("TypedBridgeWatchContractSdk status & pause wrappers", () => {
  let sdk: TypedBridgeWatchContractSdk;
  let queryMethodSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    sdk = new TypedBridgeWatchContractSdk(testConfig);
    queryMethodSpy = vi
      .spyOn(sdk, "queryMethod" as keyof typeof sdk)
      .mockResolvedValue({} as never);
  });

  it("getContractStatus calls queryMethod with get_contract_status", async () => {
    await sdk.getContractStatus();
    expect(queryMethodSpy).toHaveBeenCalledWith({
      method: "get_contract_status",
      args: undefined,
    });
  });

  it("getAssetStatusRollup calls queryMethod with get_asset_status_rollup", async () => {
    await sdk.getAssetStatusRollup("USDC");
    expect(queryMethodSpy).toHaveBeenCalledWith({
      method: "get_asset_status_rollup",
      args: [expect.any(Object)],
    });
  });

  it("getBridgeStatusRollup calls queryMethod with get_bridge_status_rollup", async () => {
    await sdk.getBridgeStatusRollup("bridge-1");
    expect(queryMethodSpy).toHaveBeenCalledWith({
      method: "get_bridge_status_rollup",
      args: [expect.any(Object)],
    });
  });

  it("isPaused calls queryMethod with is_paused", async () => {
    await sdk.isPaused().catch(() => {});
    expect(queryMethodSpy).toHaveBeenCalledWith({
      method: "is_paused",
      args: undefined,
    });
  });

  it("isAssetPaused calls queryMethod with is_asset_paused", async () => {
    await sdk.isAssetPaused("USDC").catch(() => {});
    expect(queryMethodSpy).toHaveBeenCalledWith({
      method: "is_asset_paused",
      args: [expect.any(Object)],
    });
  });

  it("getPauseStatus calls queryMethod with get_pause_status", async () => {
    await sdk.getPauseStatus().catch(() => {});
    expect(queryMethodSpy).toHaveBeenCalledWith({
      method: "get_pause_status",
      args: undefined,
    });
  });

  it("getPauseHistory calls queryMethod with get_pause_history", async () => {
    await sdk.getPauseHistory();
    expect(queryMethodSpy).toHaveBeenCalledWith({
      method: "get_pause_history",
      args: undefined,
    });
  });

  it("getMonitoredAssets calls queryMethod with get_monitored_assets", async () => {
    await sdk.getMonitoredAssets();
    expect(queryMethodSpy).toHaveBeenCalledWith({
      method: "get_monitored_assets",
      args: undefined,
    });
  });

  it("getConfig calls queryMethod with get_config", async () => {
    await sdk.getConfig("Threshold", "min_health").catch(() => {});
    expect(queryMethodSpy).toHaveBeenCalledWith({
      method: "get_config",
      args: [expect.any(Object), expect.any(Object)],
    });
  });
});

describe("TypedBridgeWatchContractSdk setHealthWeights", () => {
  let sdk: TypedBridgeWatchContractSdk;
  let invokeAndSendSpy: ReturnType<typeof vi.spyOn>;
  let buildInvokeTransactionSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    sdk = new TypedBridgeWatchContractSdk(testConfig);
    invokeAndSendSpy = vi
      .spyOn(sdk, "invokeAndSend" as keyof typeof sdk)
      .mockResolvedValue({ status: "SUCCESS" } as never);
    buildInvokeTransactionSpy = vi
      .spyOn(sdk, "buildInvokeTransaction" as keyof typeof sdk)
      .mockResolvedValue({} as never);
  });

  it("setHealthWeights calls invokeAndSend with set_health_weights method", async () => {
    await sdk.setHealthWeights({
      caller: TEST_CALLER,
      liquidity_weight: 30,
      price_stability_weight: 40,
      bridge_uptime_weight: 30,
      version: 2,
    });
    expect(invokeAndSendSpy).toHaveBeenCalled();
    const arg = invokeAndSendSpy.mock.calls[0][0];
    expect(arg.method).toBe("set_health_weights");
    expect(arg.sourcePublicKey).toBe(TEST_CALLER);
  });

  it("buildSetHealthWeightsTransaction calls buildInvokeTransaction", async () => {
    await sdk.buildSetHealthWeightsTransaction({
      caller: TEST_CALLER,
      liquidity_weight: 30,
      price_stability_weight: 40,
      bridge_uptime_weight: 30,
      version: 2,
    });
    expect(buildInvokeTransactionSpy).toHaveBeenCalled();
    const arg = buildInvokeTransactionSpy.mock.calls[0][0];
    expect(arg.method).toBe("set_health_weights");
  });
});

// ── ZK/MMR verification helpers (issue #1244) ────────────────────────────────

describe("TypedBridgeWatchContractSdk zk/mmr verification helpers", () => {
  let sdk: TypedBridgeWatchContractSdk;
  let queryMethodSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    sdk = new TypedBridgeWatchContractSdk(testConfig);
    queryMethodSpy = vi
      .spyOn(sdk, "queryMethod" as keyof typeof sdk)
      .mockResolvedValue({} as never);
  });

  const zkParams = {
    operator: TEST_CALLER,
    operatorSecret: "SCCOPERAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    proof: {
      scheme: "Groth16",
      curve: "Bn254",
      pi_a: "AAAA",
      pi_b: "AAAA",
      pi_c: "AAAA",
      commitment_hash: "ab".repeat(32),
    },
    publicInputs: {
      total_reserves: 1_000_000n,
      on_chain_supply: 900_000n,
      min_reserve_ratio_bps: 10_000,
      timestamp: 1_700_000_000,
      bridge_id: "bridge-1",
      asset_code: "USDC",
    },
  };

  const mmrProof = {
    leaf_hash: "ab".repeat(32),
    leaf_index: 7,
    siblings: ["cd".repeat(32), "ef".repeat(32)],
    peaks_snapshot: ["12".repeat(32), "34".repeat(32)],
    local_peak_pos: 0,
  };

  it("verifyZkProof invokes verify_zk_reserve_proof with structured args", async () => {
    const invokeSpy = vi
      .spyOn(sdk, "invokeAndSend" as keyof typeof sdk)
      .mockResolvedValue({ status: "SUCCESS" } as never);

    const result = await sdk.verifyZkProof(zkParams);

    expect(invokeSpy).toHaveBeenCalled();
    const call = (invokeSpy as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.method).toBe("verify_zk_reserve_proof");
    expect(call.args).toHaveLength(3);
    expect(result.valid).toBe(true);
  });

  it("buildVerifyZkProofTransaction builds the invoke transaction", async () => {
    const buildSpy = vi
      .spyOn(sdk, "buildInvokeTransaction" as keyof typeof sdk)
      .mockResolvedValue({} as never);

    await sdk.buildVerifyZkProofTransaction({
      operator: zkParams.operator,
      proof: zkParams.proof,
      publicInputs: zkParams.publicInputs,
    });

    const call = (buildSpy as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.method).toBe("verify_zk_reserve_proof");
    expect(call.sourcePublicKey).toBe(zkParams.operator);
  });

  it("verifyMmrProof without expected root uses verify_against_current", async () => {
    queryMethodSpy.mockResolvedValue({
      result: { retval: StellarSdk.xdr.ScVal.scvBool(true) },
    } as never);

    const valid = await sdk.verifyMmrProof(mmrProof);

    const call = (queryMethodSpy as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.method).toBe("verify_against_current");
    expect(call.args).toHaveLength(1);
    expect(valid).toBe(true);
  });

  it("verifyMmrProof with expected root uses verify_mmr_proof", async () => {
    queryMethodSpy.mockResolvedValue({
      result: { retval: StellarSdk.xdr.ScVal.scvBool(false) },
    } as never);

    const valid = await sdk.verifyMmrProof(mmrProof, "ff".repeat(32));

    const call = (queryMethodSpy as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.method).toBe("verify_mmr_proof");
    expect(call.args).toHaveLength(2);
    expect(valid).toBe(false);
  });

  it("verifyMmrProof returns false on an empty simulation result", async () => {
    queryMethodSpy.mockResolvedValue({} as never);
    expect(await sdk.verifyMmrProof(mmrProof)).toBe(false);
  });
});
