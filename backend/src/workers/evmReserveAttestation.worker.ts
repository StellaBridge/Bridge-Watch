import crypto from "crypto";
import { Worker, Queue, type Job } from "bullmq";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";
import { getDatabase } from "../database/connection.js";
import { getEthereumRpcClient } from "../services/ethereum/client.js";
import type { ChainId } from "../services/ethereum/types.js";
import { getMetricsService } from "../services/metrics.service.js";
import {
  buildMerkleTree,
  generateMerkleProof,
  verifyMerkleProof,
  type ReserveLeaf,
} from "./reserveVerification.worker.js";

/**
 * #1243 — EVM RPC multi-chain reserve attestation worker.
 *
 * Continuously verifies that collateral locked in EVM bridge contracts
 * (per the `evm_lock_contracts` table) still backs the Stellar-side minted
 * assets. For every active lock contract it fetches the on-chain token
 * balance through the multi-provider EVM RPC client (automatic failover),
 * rebuilds the reserve Merkle tree, verifies the leaf proofs, stores an
 * attestation snapshot in `reserve_attestations`, and exposes the reserve
 * ratio as a Prometheus metric so alert rules can fire when it drops below
 * 1.00.
 */

const QUEUE_NAME = "evm-reserve-attestation";

const redisConnection = {
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
  password: config.REDIS_PASSWORD || undefined,
};

/** Chains the shared EVM RPC client can reach (multi-provider fallback). */
const SUPPORTED_CHAINS: readonly string[] = ["ethereum", "polygon", "base"];

export const RESERVE_RATIO_THRESHOLD = 1.0;

export interface EvmLockContractRow {
  id: string;
  bridge_name: string;
  chain_id: string;
  contract_address: string;
  token_address: string;
  asset_symbol: string;
}

export interface EvmReserveLeafInput {
  assetSymbol: string;
  chainId: string;
  balance: number;
}

/**
 * Normalizes a `chain_id` value from `evm_lock_contracts` to a chain the
 * shared RPC client supports. Returns null for unsupported chains (they are
 * skipped with a warning rather than failing the whole run).
 */
export function toSupportedChainId(chainId: string): ChainId | null {
  const normalized = chainId.trim().toLowerCase();
  return SUPPORTED_CHAINS.includes(normalized) ? (normalized as ChainId) : null;
}

/** Computes the reserve ratio: on-chain balances divided by committed reserves. */
export function computeReserveRatio(
  onchainTotal: bigint,
  committedTotal: bigint | null
): number | null {
  if (committedTotal === null || committedTotal <= 0n) return null;
  return Number(onchainTotal) / Number(committedTotal);
}

/** Returns true when the reserve ratio is below the attestation threshold. */
export function isReserveMismatch(ratio: number | null): boolean {
  return ratio !== null && ratio < RESERVE_RATIO_THRESHOLD;
}

/** Builds the attestation reference stored alongside the snapshot. */
export function buildAttestationRef(chainId: string, merkleRootHex: string): string {
  return `evm:${chainId}:${merkleRootHex.slice(0, 16)}`;
}

/** Converts a contract balance row into a Merkle reserve leaf. */
export function toReserveLeaf(input: EvmReserveLeafInput): ReserveLeaf {
  return {
    assetId: `${input.assetSymbol}-${input.chainId}`,
    amount: BigInt(Math.round(input.balance * 1_000_000)),
    chain: input.chainId,
    nonce: `attest-${crypto.randomUUID()}`,
  };
}async function fetchActiveLockContracts(): Promise<EvmLockContractRow[]> {
  const db = getDatabase();
  return db("evm_lock_contracts")
    .where({ is_active: true })
    .select(
      "id",
      "bridge_name",
      "chain_id",
      "contract_address",
      "token_address",
      "asset_symbol"
    );
}

async function fetchLatestCommittedTotal(
  bridgeName: string
): Promise<bigint | null> {
  const db = getDatabase();
  const commitment = await db("reserve_commitments")
    .where({ bridge_id: bridgeName })
    .orderBy("sequence", "desc")
    .first("total_reserves");
  if (!commitment) return null;
  try {
    return BigInt(commitment.total_reserves);
  } catch {
    return null;
  }
}

interface AttestationOutcome {
  bridgeName: string;
  assetSymbol: string;
  chainId: string;
  balance: number;
  ratio: number | null;
  mismatch: boolean;
}

async function attestLockContract(
  contract: EvmLockContractRow
): Promise<AttestationOutcome | null> {
  const chainId = toSupportedChainId(contract.chain_id);
  if (!chainId) {
    logger.warn(
      { chainId: contract.chain_id, contract: contract.contract_address },
      "Skipping lock contract on unsupported chain for EVM attestation"
    );
    return null;
  }

  const client = getEthereumRpcClient();
  // getTokenBalance fails over across all configured providers for the chain.
  const balance = await client.getTokenBalance(
    chainId,
    contract.token_address,
    contract.contract_address
  );

  return {
    bridgeName: contract.bridge_name,
    assetSymbol: contract.asset_symbol,
    chainId,
    balance,
    ratio: null,
    mismatch: false,
  };
}

export interface EvmReserveAttestationJobData {
  dryRun?: boolean;
}

async function processEvmReserveAttestation(
  job: Job<EvmReserveAttestationJobData>
): Promise<{
  success: boolean;
  contractsPolled: number;
  mismatches: number;
}> {
  const { dryRun = false } = job.data;
  const metrics = getMetricsService();
  const contracts = await fetchActiveLockContracts();

  logger.info({ jobId: job.id, contracts: contracts.length, dryRun }, "Starting EVM reserve attestation");

  if (contracts.length === 0) {
    return { success: true, contractsPolled: 0, mismatches: 0 };
  }

  const outcomes: AttestationOutcome[] = [];
  for (const contract of contracts) {
    try {
      const outcome = await attestLockContract(contract);
      if (outcome) outcomes.push(outcome);
    } catch (error) {
      logger.error(
        { error, contract: contract.contract_address, chainId: contract.chain_id },
        "Failed to attest lock contract"
      );
    }
  }

  // Group leaves per bridge/asset to build one Merkle tree per asset across
  // all its chains, then verify the tree integrity and compute the ratio.
  const byBridgeAsset = new Map<string, AttestationOutcome[]>();
  for (const outcome of outcomes) {
    const key = `${outcome.bridgeName}:${outcome.assetSymbol}`;
    const group = byBridgeAsset.get(key) ?? [];
    group.push(outcome);
    byBridgeAsset.set(key, group);
  }

  let mismatches = 0;

  for (const [key, group] of byBridgeAsset) {
    const { bridgeName, assetSymbol } = group[0]!;
    const leaves = group.map((outcome) =>
      toReserveLeaf({
        assetSymbol: outcome.assetSymbol,
        chainId: outcome.chainId,
        balance: outcome.balance,
      })
    );
    if (leaves.length === 0) continue;

    const tree = buildMerkleTree(leaves);
    const onchainTotal = leaves.reduce((sum, leaf) => sum + leaf.amount, 0n);

    // Merkle integrity: every leaf's proof must verify against the root.
    for (let i = 0; i < leaves.length; i++) {
      const proof = generateMerkleProof(tree, i);
      if (!verifyMerkleProof(proof.leafHash, proof.proofPath, proof.leafIndex, tree.root)) {
        logger.error({ bridgeName, assetSymbol, leafIndex: i }, "Reserve Merkle proof verification failed");
        throw new Error("Reserve Merkle tree integrity check failed");
      }
    }

    const committedTotal = dryRun ? null : await fetchLatestCommittedTotal(bridgeName);
    const ratio = computeReserveRatio(onchainTotal, committedTotal);
    const mismatch = isReserveMismatch(ratio);
    if (mismatch) mismatches++;

    const rootHex = tree.root.toString("hex");
    const attestationRef = buildAttestationRef(group[0]!.chainId, rootHex);

    if (!dryRun) {
      const db = getDatabase();
      const now = new Date();
      await db("reserve_attestations").insert({
        bridge_id: bridgeName,
        asset_code: assetSymbol,
        attestor: "evm-reserve-attestation-worker",
        attestation_ref: attestationRef,
        issued_at: now,
        expires_at: new Date(now.getTime() + 3_600_000),
        status: "active",
      });
    }

    for (const outcome of group) {
      if (ratio !== null) {
        metrics.bridgeReserveRatio.set(
          { bridge_id: bridgeName, asset_code: assetSymbol, chain: outcome.chainId },
          ratio
        );
      }
      metrics.bridgeReserveMismatchDetected.set(
        { bridge_id: bridgeName, asset_code: assetSymbol },
        mismatch ? 1 : 0
      );
    }

    if (mismatch) {
      metrics.alertsTriggered.inc({
        alert_type: "reserve_mismatch",
        priority: "critical",
        bridge_id: bridgeName,
      });
      logger.error(
        { bridgeName, assetSymbol, ratio },
        "Reserve ratio below attestation threshold — alert rule triggered"
      );
    }

    logger.info(
      { bridgeName, assetSymbol, rootHex, ratio, mismatch, contracts: group.length },
      "EVM reserve attestation stored"
    );
  }

  return { success: true, contractsPolled: contracts.length, mismatches };
}

export const evmReserveAttestationQueue = new Queue(QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 10_000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
});

export const evmReserveAttestationWorker = new Worker<EvmReserveAttestationJobData>(
  QUEUE_NAME,
  processEvmReserveAttestation,
  { connection: redisConnection, concurrency: 1 }
);

evmReserveAttestationWorker.on("completed", (job, result) => {
  logger.info({ jobId: job?.id, ...result }, "EVM reserve attestation job completed");
});

evmReserveAttestationWorker.on("failed", (job, error) => {
  logger.error({ jobId: job?.id, error: error.message }, "EVM reserve attestation job failed");
});

evmReserveAttestationWorker.on("error", (error) => {
  logger.error({ error: error.message }, "EVM reserve attestation worker error");
});

export async function scheduleEvmReserveAttestations(
  intervalMs = 3_600_000
): Promise<void> {
  const repeatableJobs = await evmReserveAttestationQueue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.key.includes("poll-evm-reserves")) {
      await evmReserveAttestationQueue.removeRepeatableByKey(job.key);
    }
  }

  await evmReserveAttestationQueue.add(
    "poll-evm-reserves",
    {},
    { repeat: { every: intervalMs }, jobId: "poll-evm-reserves" }
  );

  logger.info({ intervalMs }, "Scheduled periodic EVM reserve attestation");
}
