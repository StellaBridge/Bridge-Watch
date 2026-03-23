import * as StellarSdk from "@stellar/stellar-sdk";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";
import { getDatabase } from "../database/connection.js";

export interface MerkleProofInput {
  leafHash: string;
  proofPath: string[];
  leafIndex: number;
}

export interface VerificationResultInput {
  bridgeId: string;
  sequence: number;
  leafHash: string;
  leafIndex: number;
  isValid: boolean;
  proofDepth?: number;
  metadata?: Record<string, unknown>;
  jobId: string;
}

export interface CommitmentRecord {
  id: string;
  bridge_id: string;
  sequence: number;
  merkle_root: string;
  total_reserves: string;
  committed_at: number;
  committed_ledger: number;
  status: "pending" | "verified" | "challenged" | "slashed" | "resolved";
  challenger_address: string | null;
  tx_hash: string | null;
  created_at: string;
  updated_at: string;
}

function getSorobanServer(): StellarSdk.SorobanRpc.Server {
  return new StellarSdk.SorobanRpc.Server(config.SOROBAN_RPC_URL, {
    allowHttp: config.NODE_ENV === "development",
  });
}

function getNetworkPassphrase(): string {
  return config.STELLAR_NETWORK === "mainnet"
    ? StellarSdk.Networks.PUBLIC
    : StellarSdk.Networks.TESTNET;
}

function hexToBytes32ScVal(hex: string): StellarSdk.xdr.ScVal {
  const buf = Buffer.from(hex, "hex");
  if (buf.length !== 32) throw new Error(`Expected 32 bytes, got ${buf.length}`);
  return StellarSdk.xdr.ScVal.scvBytes(buf);
}

function hexArrayToScVal(hexArray: string[]): StellarSdk.xdr.ScVal {
  return StellarSdk.xdr.ScVal.scvVec(hexArray.map(hexToBytes32ScVal));
}

export class ReserveVerificationService {
  private readonly db = getDatabase();

  async commitReserves(
    bridgeId: string,
    merkleRootHex: string,
    totalReserves: bigint
  ): Promise<number> {
    const contractAddress = await this.getContractAddress(bridgeId);
    if (!contractAddress) {
      throw new Error(`No Soroban contract address configured for bridge ${bridgeId}`);
    }

    const operatorKeypair = this.loadOperatorKeypair(bridgeId);
    const server = getSorobanServer();
    const contract = new StellarSdk.Contract(contractAddress);
    const account = await server.getAccount(operatorKeypair.publicKey());

    const tx = new StellarSdk.TransactionBuilder(account, {
      fee: "100000",
      networkPassphrase: getNetworkPassphrase(),
    })
      .addOperation(
        contract.call(
          "commit_reserves",
          StellarSdk.xdr.ScVal.scvString(bridgeId),
          hexToBytes32ScVal(merkleRootHex),
          StellarSdk.xdr.ScVal.scvI128(
            new StellarSdk.xdr.Int128Parts({
              hi: StellarSdk.xdr.Int64.fromString("0"),
              lo: StellarSdk.xdr.Uint64.fromString(totalReserves.toString()),
            })
          )
        )
      )
      .setTimeout(30)
      .build();

    const simResult = await server.simulateTransaction(tx);
    if (StellarSdk.SorobanRpc.Api.isSimulationError(simResult)) {
      throw new Error(`Simulation failed: ${simResult.error}`);
    }

    const preparedTx = StellarSdk.SorobanRpc.assembleTransaction(tx, simResult).build();
    preparedTx.sign(operatorKeypair);

    const sendResult = await server.sendTransaction(preparedTx);
    if (sendResult.status === "ERROR") {
      throw new Error(`Transaction submission failed: ${JSON.stringify(sendResult.errorResult)}`);
    }

    const sequence = await this.pollTransactionResult(server, sendResult.hash);
    logger.info({ bridgeId, sequence, txHash: sendResult.hash, merkleRootHex }, "Reserve commitment confirmed on-chain");

    await this.saveCommitment({ bridgeId, sequence, merkleRootHex, totalReserves, txHash: sendResult.hash });
    return sequence;
  }

  async verifyProofOnChain(
    bridgeId: string,
    sequence: number,
    proof: MerkleProofInput
  ): Promise<boolean> {
    const contractAddress = await this.getContractAddress(bridgeId);
    if (!contractAddress) throw new Error(`No contract address for bridge ${bridgeId}`);

    const server = getSorobanServer();
    const contract = new StellarSdk.Contract(contractAddress);
    const dummyKeypair = StellarSdk.Keypair.random();

    const proofScVal = StellarSdk.xdr.ScVal.scvMap([
      new StellarSdk.xdr.ScMapEntry({
        key: StellarSdk.xdr.ScVal.scvSymbol("leaf_hash"),
        val: hexToBytes32ScVal(proof.leafHash),
      }),
      new StellarSdk.xdr.ScMapEntry({
        key: StellarSdk.xdr.ScVal.scvSymbol("proof_path"),
        val: hexArrayToScVal(proof.proofPath),
      }),
      new StellarSdk.xdr.ScMapEntry({
        key: StellarSdk.xdr.ScVal.scvSymbol("leaf_index"),
        val: StellarSdk.xdr.ScVal.scvU64(
          StellarSdk.xdr.Uint64.fromString(proof.leafIndex.toString())
        ),
      }),
    ]);

    try {
      const account = new StellarSdk.Account(dummyKeypair.publicKey(), "0");
      const tx = new StellarSdk.TransactionBuilder(account, {
        fee: "100",
        networkPassphrase: getNetworkPassphrase(),
      })
        .addOperation(
          contract.call(
            "verify_proof",
            StellarSdk.xdr.ScVal.scvString(bridgeId),
            StellarSdk.xdr.ScVal.scvU64(StellarSdk.xdr.Uint64.fromString(sequence.toString())),
            proofScVal
          )
        )
        .setTimeout(10)
        .build();

      const simResult = await server.simulateTransaction(tx);
      if (StellarSdk.SorobanRpc.Api.isSimulationError(simResult)) {
        logger.warn({ bridgeId, sequence, error: simResult.error }, "Proof simulation error");
        return false;
      }

      const returnVal = simResult.result?.retval;
      if (!returnVal) return false;

      return returnVal.switch() === StellarSdk.xdr.ScValType.scvBool() && returnVal.b() === true;
    } catch (error) {
      logger.error({ error, bridgeId, sequence }, "On-chain proof verification threw");
      return false;
    }
  }

  async saveCommitment(params: {
    bridgeId: string;
    sequence: number;
    merkleRootHex: string;
    totalReserves: bigint;
    txHash?: string;
    committedAt?: number;
    committedLedger?: number;
  }): Promise<void> {
    await this.db("reserve_commitments")
      .insert({
        bridge_id: params.bridgeId,
        sequence: params.sequence,
        merkle_root: params.merkleRootHex,
        total_reserves: params.totalReserves.toString(),
        committed_at: params.committedAt ?? Math.floor(Date.now() / 1000),
        committed_ledger: params.committedLedger ?? 0,
        status: "pending",
        tx_hash: params.txHash ?? null,
      })
      .onConflict(["bridge_id", "sequence"])
      .merge(["tx_hash", "updated_at"]);
  }

  async saveVerificationResult(input: VerificationResultInput): Promise<void> {
    await this.db("verification_results").insert({
      verified_at: new Date(),
      bridge_id: input.bridgeId,
      sequence: input.sequence,
      leaf_hash: input.leafHash,
      leaf_index: input.leafIndex,
      is_valid: input.isValid,
      proof_depth: input.proofDepth ?? null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      job_id: input.jobId,
    });
  }

  async updateCommitmentStatus(
    bridgeId: string,
    sequence: number,
    status: CommitmentRecord["status"]
  ): Promise<void> {
    await this.db("reserve_commitments")
      .where({ bridge_id: bridgeId, sequence })
      .update({ status, updated_at: new Date() });
  }

  async getCommitment(bridgeId: string, sequence: number): Promise<CommitmentRecord | undefined> {
    return this.db<CommitmentRecord>("reserve_commitments")
      .where({ bridge_id: bridgeId, sequence })
      .first();
  }

  async getLatestCommitment(bridgeId: string): Promise<CommitmentRecord | undefined> {
    return this.db<CommitmentRecord>("reserve_commitments")
      .where({ bridge_id: bridgeId })
      .orderBy("sequence", "desc")
      .first();
  }

  async getCommitmentHistory(bridgeId: string, limit = 50): Promise<CommitmentRecord[]> {
    return this.db<CommitmentRecord>("reserve_commitments")
      .where({ bridge_id: bridgeId })
      .orderBy("sequence", "desc")
      .limit(limit);
  }

  async getVerificationResults(bridgeId: string, sequence?: number, limit = 100): Promise<unknown[]> {
    const query = this.db("verification_results")
      .where({ bridge_id: bridgeId })
      .orderBy("verified_at", "desc")
      .limit(limit);

    if (sequence !== undefined) query.andWhere({ sequence });
    return query;
  }

  async getActiveBridgeOperators(): Promise<
    Array<{ bridgeId: string; assetCode: string; contractAddress: string | null }>
  > {
    return this.db("bridge_operators")
      .where({ is_active: true })
      .select("bridge_id as bridgeId", "asset_code as assetCode", "contract_address as contractAddress");
  }

  private async getContractAddress(bridgeId: string): Promise<string | null> {
    const row = await this.db("bridge_operators")
      .where({ bridge_id: bridgeId })
      .select("contract_address")
      .first();
    return row?.contract_address ?? null;
  }

  private loadOperatorKeypair(bridgeId: string): StellarSdk.Keypair {
    const envKey = `OPERATOR_SECRET_${bridgeId.toUpperCase().replace(/-/g, "_")}`;
    const secret = process.env[envKey];
    if (!secret) {
      throw new Error(`Operator signing key not found: set ${envKey} environment variable`);
    }
    return StellarSdk.Keypair.fromSecret(secret);
  }

  private async pollTransactionResult(
    server: StellarSdk.SorobanRpc.Server,
    txHash: string,
    maxAttempts = 20,
    delayMs = 2000
  ): Promise<number> {
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, delayMs));
      const result = await server.getTransaction(txHash);

      if (result.status === StellarSdk.SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
        const retval = result.returnValue;
        if (!retval) throw new Error("Transaction succeeded but returned no value");
        if (retval.switch() === StellarSdk.xdr.ScValType.scvU64()) {
          return Number(retval.u64().toBigInt());
        }
        throw new Error(`Unexpected return type: ${retval.switch().name}`);
      }

      if (result.status === StellarSdk.SorobanRpc.Api.GetTransactionStatus.FAILED) {
        throw new Error(`Transaction failed: ${JSON.stringify(result)}`);
      }
    }

    throw new Error(`Transaction ${txHash} not confirmed after ${maxAttempts} attempts`);
  }
}
