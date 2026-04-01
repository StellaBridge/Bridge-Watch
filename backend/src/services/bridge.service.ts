import { logger } from "../utils/logger.js";
import { ReserveVerificationService } from "./reserveVerification.service.js";
import { BridgeTransactionService } from "./bridgeTransaction.service.js";
import { config, SUPPORTED_ASSETS } from "../config/index.js";
import { getStellarAssetSupply } from "../utils/stellar.js";
import { getEthereumTokenBalance } from "../utils/ethereum.js";
import { withRetry } from "../utils/retry.js";
import { getDatabase } from "../database/connection.js";

export interface BridgeStatus {
  name: string;
  status: "healthy" | "degraded" | "down";
  lastChecked: string;
  totalValueLocked: number;
  supplyOnStellar: number;
  supplyOnSource: number;
  mismatchPercentage: number;
  reserveVerificationStatus?: "pending" | "verified" | "challenged" | "slashed" | "resolved" | "none";
  latestCommitmentSequence?: number;
}

export interface BridgeStats {
  name: string;
  volume24h: number;
  volume7d: number;
  volume30d: number;
  totalTransactions: number;
  averageTransferTime: number;
  uptime30d: number;
}

export interface ReserveVerificationSummary {
  bridgeId: string;
  latestSequence: number | null;
  latestRootHex: string | null;
  totalReserves: string | null;
  status: string;
  lastVerifiedAt: string | null;
  commitmentHistory: unknown[];
}

export interface VerificationResult {
  assetCode: string;
  stellarSupply: number;
  ethereumReserves: number;
  mismatchPercentage: number;
  isFlagged: boolean;
  errorStatus?: string | null;
  match: boolean;
}

export class BridgeService {
  private readonly reserveVerificationService = new ReserveVerificationService();
  private readonly bridgeTransactionService = new BridgeTransactionService();

  async getAllBridgeStatuses(): Promise<{ bridges: BridgeStatus[] }> {
    logger.info("Fetching all bridge statuses");
    // TODO: Query bridge status from database and on-chain data
    return { bridges: [] };
  }

  async getBridgeStats(bridgeName: string): Promise<BridgeStats | null> {
    logger.info({ bridgeName }, "Fetching bridge stats");
    const db = getDatabase();
    const bridge = await db("bridges").select("*").where({ name: bridgeName }).first();
    if (!bridge) return null;

    const summary = await this.bridgeTransactionService.getBridgeTransactionSummary(bridgeName);

    return {
      name: bridge.name,
      volume24h: Number(summary.totalVolume || 0),
      volume7d: Number(summary.totalVolume || 0),
      volume30d: Number(summary.totalVolume || 0),
      totalTransactions: summary.totalTransactions,
      averageTransferTime: summary.averageConfirmationTimeSeconds,
      uptime30d: bridge.status === "healthy" ? 100 : 75,
    };
  }

  /**
   * Fetch total supply on Stellar for a given asset with retry logic.
   * @param {string} assetCode - The asset code (e.g., USDC, EURC)
   */
  async fetchStellarSupply(assetCode: string): Promise<number> {
    const assetConfig = SUPPORTED_ASSETS.find((a) => a.code === assetCode);
    if (!assetConfig) {
      throw new Error(`Asset ${assetCode} not supported on Stellar`);
    }

    return withRetry(
      () => getStellarAssetSupply(assetCode, assetConfig.issuer),
      config.RETRY_MAX,
      1000
    );
  }

  /**
   * Fetch reserve balance from Ethereum bridge contract with retry logic.
   * @param {string} assetCode - The asset code (e.g., USDC, EURC)
   */
  async fetchEthereumReserves(assetCode: string): Promise<number> {
    let bridgeAddress: string | undefined;
    let tokenAddress: string | undefined;

    if (assetCode === "USDC") {
      bridgeAddress = config.USDC_BRIDGE_ADDRESS;
      tokenAddress = config.USDC_TOKEN_ADDRESS;
    } else if (assetCode === "EURC") {
      bridgeAddress = config.EURC_BRIDGE_ADDRESS;
      tokenAddress = config.EURC_TOKEN_ADDRESS;
    }

    if (!bridgeAddress || !tokenAddress) {
      throw new Error(`Bridge or Token address not configured for Ethereum reserves of ${assetCode}`);
    }

    return withRetry(
      () => getEthereumTokenBalance(tokenAddress!, bridgeAddress!),
      config.RETRY_MAX,
      1000
    );
  }

  /**
   * Verify supply consistency across chains for a bridged asset
   */
  async verifySupply(
    assetCode: string
  ): Promise<VerificationResult> {
    logger.info({ assetCode }, "Verifying supply for asset");

    let stellarSupply = 0;
    let ethereumReserves = 0;
    let errorStatus: string | null = null;
    let fetchFailed = false;

    try {
      stellarSupply = await this.fetchStellarSupply(assetCode);
      ethereumReserves = await this.fetchEthereumReserves(assetCode);
    } catch (error: any) {
      logger.error({ error, assetCode }, "Failed to fetch supplies for verification");
      errorStatus = error?.message || String(error);
      fetchFailed = true;
    }

    let mismatchPercentage = 0;
    if (!fetchFailed && ethereumReserves > 0) {
      mismatchPercentage = (Math.abs(stellarSupply - ethereumReserves) / ethereumReserves) * 100;
    } else if (!fetchFailed && ethereumReserves === 0 && stellarSupply > 0) {
      mismatchPercentage = 100;
    }

    const isFlagged = !fetchFailed && mismatchPercentage > config.BRIDGE_SUPPLY_MISMATCH_THRESHOLD;

    if (isFlagged) {
      logger.warn(
        { assetCode, stellarSupply, ethereumReserves, mismatchPercentage },
        "Supply mismatch flagged across chains exceeds threshold"
      );
    }

    const result: VerificationResult = {
      assetCode,
      stellarSupply,
      ethereumReserves,
      mismatchPercentage,
      isFlagged,
      errorStatus,
      match: !isFlagged && !fetchFailed,
    };

    try {
      const db = getDatabase();
      await db("verification_results").insert({
        asset_code: assetCode,
        stellar_supply: stellarSupply,
        ethereum_reserves: ethereumReserves,
        mismatch_percentage: mismatchPercentage,
        is_flagged: isFlagged,
        error_status: errorStatus,
      });
      logger.debug({ assetCode }, "Saved verification result to database");
    } catch (dbError) {
      logger.error({ error: dbError, assetCode }, "Failed to write verification result to database");
      // Intentionally not modifying `result` or throwing here
    }

    return result;
  }

  async getReserveVerificationSummary(bridgeId: string): Promise<ReserveVerificationSummary> {
    logger.info({ bridgeId }, "Fetching reserve verification summary");

    const latest = await this.reserveVerificationService.getLatestCommitment(bridgeId);

    if (!latest) {
      return {
        bridgeId,
        latestSequence: null,
        latestRootHex: null,
        totalReserves: null,
        status: "none",
        lastVerifiedAt: null,
        commitmentHistory: [],
      };
    }

    const history = await this.reserveVerificationService.getCommitmentHistory(bridgeId, 10);

    return {
      bridgeId,
      latestSequence: latest.sequence,
      latestRootHex: latest.merkle_root,
      totalReserves: latest.total_reserves,
      status: latest.status,
      lastVerifiedAt: latest.updated_at,
      commitmentHistory: history,
    };
  }

  async getVerificationAuditTrail(bridgeId: string, sequence?: number, limit = 50): Promise<unknown[]> {
    logger.info({ bridgeId, sequence }, "Fetching verification audit trail");
    return this.reserveVerificationService.getVerificationResults(bridgeId, sequence, limit);
  }

  async getActiveBridgeOperators(): Promise<
    Array<{ bridgeId: string; assetCode: string; contractAddress: string | null }>
  > {
    return this.reserveVerificationService.getActiveBridgeOperators();
  }
}
