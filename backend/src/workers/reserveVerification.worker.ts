import crypto from "crypto";
import { Worker, Queue, type Job } from "bullmq";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";
import { getEthereumTokenSupply } from "../utils/ethereum.js";
import { ReserveVerificationService } from "../services/reserveVerification.service.js";

const QUEUE_NAME = "reserve-verification";

const redisConnection = {
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
  password: config.REDIS_PASSWORD || undefined,
};

export const reserveVerificationQueue = new Queue(QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 10_000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
});

export interface ReserveLeaf {
  assetId: string;
  amount: bigint;
  chain: string;
  nonce: string;
}

export function hashLeaf(leaf: ReserveLeaf): Buffer {
  const data = `${leaf.assetId}:${leaf.amount.toString()}:${leaf.chain}:${leaf.nonce}`;
  return crypto.createHash("sha256").update(data).digest();
}

function hashPair(left: Buffer, right: Buffer): Buffer {
  return crypto.createHash("sha256").update(left).update(right).digest();
}

export interface MerkleTree {
  root: Buffer;
  layers: Buffer[][];
  leaves: ReserveLeaf[];
}

export function buildMerkleTree(leaves: ReserveLeaf[]): MerkleTree {
  if (leaves.length === 0) {
    throw new Error("Cannot build Merkle tree from empty leaf set");
  }

  const leafHashes = leaves.map(hashLeaf);
  const layers: Buffer[][] = [leafHashes];

  let current = leafHashes;
  while (current.length > 1) {
    if (current.length % 2 !== 0) {
      current = [...current, current[current.length - 1]!];
    }
    const next: Buffer[] = [];
    for (let i = 0; i < current.length; i += 2) {
      next.push(hashPair(current[i]!, current[i + 1]!));
    }
    layers.push(next);
    current = next;
  }

  return { root: current[0]!, layers, leaves };
}

export function generateMerkleProof(
  tree: MerkleTree,
  leafIndex: number
): { leafHash: Buffer; proofPath: Buffer[]; leafIndex: number } {
  const proofPath: Buffer[] = [];
  let index = leafIndex;

  for (let i = 0; i < tree.layers.length - 1; i++) {
    const layer = tree.layers[i]!;
    const siblingIndex = index % 2 === 0 ? index + 1 : index - 1;
    const sibling = layer[siblingIndex] ?? layer[index]!;
    proofPath.push(sibling);
    index = Math.floor(index / 2);
  }

  return { leafHash: tree.layers[0]![leafIndex]!, proofPath, leafIndex };
}

export function verifyMerkleProof(
  leafHash: Buffer,
  proofPath: Buffer[],
  leafIndex: number,
  expectedRoot: Buffer
): boolean {
  let computed = leafHash;
  let index = leafIndex;

  for (const sibling of proofPath) {
    computed = index % 2 === 0
      ? hashPair(computed, sibling)
      : hashPair(sibling, computed);
    index = Math.floor(index / 2);
  }

  return computed.equals(expectedRoot);
}

interface CircleReserveEntry {
  currency: string;
  amount: string;
  chain: string;
  attestationId: string;
}

// Phase-1 Ethereum ERC-20 contract addresses (Circle)
const ETHEREUM_CONTRACTS: Record<string, string> = {
  USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  EURC: "0x1aBaEA1f7C830bD89Acc67eC4af516284b1bC33c",
};

async function fetchEthereumReserveLeaf(assetCode: string): Promise<ReserveLeaf | null> {
  const tokenAddress = ETHEREUM_CONTRACTS[assetCode];
  if (!tokenAddress || !config.ETHEREUM_RPC_URL) return null;

  try {
    const supply = await getEthereumTokenSupply(tokenAddress);
    return {
      assetId: `${assetCode}-Ethereum-onchain`,
      amount: BigInt(Math.round(supply * 1_000_000)),
      chain: "Ethereum",
      nonce: `eth-${Date.now()}`,
    };
  } catch (error) {
    logger.warn({ error, assetCode, tokenAddress }, "Ethereum reserve query failed; skipping leaf");
    return null;
  }
}

async function fetchCircleReserves(assetCode: string): Promise<ReserveLeaf[]> {
  const ethLeafPromise = fetchEthereumReserveLeaf(assetCode);
  let leaves: ReserveLeaf[];

  if (!config.CIRCLE_API_KEY) {
    logger.warn({ assetCode }, "CIRCLE_API_KEY not set – using mock reserve data");
    leaves = generateMockReserves(assetCode);
  } else {
    try {
      const response = await fetch("https://api.circle.com/v1/stablecoins", {
        headers: {
          Authorization: `Bearer ${config.CIRCLE_API_KEY}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) throw new Error(`Circle API returned ${response.status}`);

      const data = (await response.json()) as { data?: CircleReserveEntry[] };
      leaves = (data.data ?? [])
        .filter((e) => e.currency === assetCode)
        .map((e, i) => ({
          assetId: `${e.currency}-${e.chain}`,
          amount: BigInt(Math.round(parseFloat(e.amount) * 1_000_000)),
          chain: e.chain,
          nonce: e.attestationId ?? `${Date.now()}-${i}`,
        }));
    } catch (error) {
      logger.error({ error, assetCode }, "Circle API failed; using mock");
      leaves = generateMockReserves(assetCode);
    }
  }

  const ethLeaf = await ethLeafPromise;
  if (ethLeaf) {
    logger.info({ assetCode, amount: ethLeaf.amount.toString() }, "Ethereum on-chain reserve leaf fetched");
    leaves = [ethLeaf, ...leaves];
  }

  return leaves;
}

function generateMockReserves(assetCode: string): ReserveLeaf[] {
  return ["Ethereum", "Solana", "Avalanche", "Polygon"].map((chain, i) => ({
    assetId: `${assetCode}-${chain}`,
    amount: BigInt(1_000_000_000 * (i + 1)),
    chain,
    nonce: `mock-${Date.now()}-${i}`,
  }));
}

export interface ReserveVerificationJobData {
  bridgeId: string;
  assetCode: string;
  dryRun?: boolean;
}

async function processReserveVerification(
  job: Job<ReserveVerificationJobData>
): Promise<{ success: boolean; sequence?: number; rootHex?: string; leafCount?: number }> {
  const { bridgeId, assetCode, dryRun = false } = job.data;
  const svc = new ReserveVerificationService();

  logger.info({ jobId: job.id, bridgeId, assetCode, dryRun }, "Starting reserve verification");

  const reserveLeaves = await fetchCircleReserves(assetCode);
  if (reserveLeaves.length === 0) throw new Error(`No reserve leaves fetched for ${assetCode}`);

  const tree = buildMerkleTree(reserveLeaves);
  const rootHex = tree.root.toString("hex");
  const totalReserves = reserveLeaves.reduce((sum, l) => sum + l.amount, 0n);

  logger.info({ rootHex, totalReserves: totalReserves.toString(), bridgeId }, "Merkle tree built");

  let sequence: number | undefined;
  if (!dryRun) {
    try {
      sequence = await svc.commitReserves(bridgeId, rootHex, totalReserves);
      logger.info({ sequence, bridgeId }, "Reserve commitment submitted to Soroban");
    } catch (err) {
      logger.error({ err, bridgeId }, "Failed to submit commitment to Soroban");
      throw err;
    }
  }

  const sampleCount = Math.min(4, reserveLeaves.length);
  const verificationResults: boolean[] = [];

  for (let i = 0; i < sampleCount; i++) {
    const proof = generateMerkleProof(tree, i);
    const offChainValid = verifyMerkleProof(proof.leafHash, proof.proofPath, proof.leafIndex, tree.root);

    if (!offChainValid) {
      logger.error({ leafIndex: i, bridgeId }, "Off-chain proof verification failed — tree corrupt");
      throw new Error("Merkle tree integrity check failed");
    }

    verificationResults.push(offChainValid);

    if (!dryRun && sequence !== undefined) {
      try {
        const onChainValid = await svc.verifyProofOnChain(bridgeId, sequence, {
          leafHash: proof.leafHash.toString("hex"),
          proofPath: proof.proofPath.map((b) => b.toString("hex")),
          leafIndex: proof.leafIndex,
        });

        if (!onChainValid) {
          logger.warn({ leafIndex: i, bridgeId, sequence }, "On-chain proof verification returned false");
        }

        await svc.saveVerificationResult({
          bridgeId,
          sequence,
          leafHash: proof.leafHash.toString("hex"),
          leafIndex: proof.leafIndex,
          isValid: onChainValid,
          proofDepth: proof.proofPath.length,
          metadata: {
            assetId: reserveLeaves[i]!.assetId,
            amount: reserveLeaves[i]!.amount.toString(),
            chain: reserveLeaves[i]!.chain,
          },
          jobId: job.id ?? "unknown",
        });
      } catch (err) {
        logger.error({ err, leafIndex: i }, "On-chain proof verification failed");
      }
    }
  }

  logger.info(
    { bridgeId, sequence, leafCount: reserveLeaves.length, sampleCount, verificationResults },
    "Reserve verification complete"
  );

  return { success: true, sequence, rootHex, leafCount: reserveLeaves.length };
}

export const reserveVerificationWorker = new Worker<ReserveVerificationJobData>(
  QUEUE_NAME,
  processReserveVerification,
  { connection: redisConnection, concurrency: 1 }
);

reserveVerificationWorker.on("completed", (job, result) => {
  logger.info({ jobId: job?.id, bridgeId: job?.data.bridgeId, ...result }, "Reserve verification job completed");
});

reserveVerificationWorker.on("failed", (job, error) => {
  logger.error({ jobId: job?.id, bridgeId: job?.data.bridgeId, error: error.message }, "Reserve verification job failed");
});

reserveVerificationWorker.on("error", (error) => {
  logger.error({ error: error.message }, "Reserve verification worker error");
});

export async function scheduleReserveVerifications(
  bridgeConfigs: Array<{ bridgeId: string; assetCode: string }>,
  intervalMs = 3_600_000
): Promise<void> {
  for (const { bridgeId, assetCode } of bridgeConfigs) {
    const repeatableKey = `${bridgeId}:${assetCode}`;

    const repeatableJobs = await reserveVerificationQueue.getRepeatableJobs();
    for (const job of repeatableJobs) {
      if (job.key.includes(repeatableKey)) {
        await reserveVerificationQueue.removeRepeatableByKey(job.key);
      }
    }

    await reserveVerificationQueue.add(
      "periodic-verify",
      { bridgeId, assetCode },
      { repeat: { every: intervalMs }, jobId: repeatableKey }
    );

    logger.info({ bridgeId, assetCode, intervalMs }, "Scheduled periodic reserve verification");
  }
}
