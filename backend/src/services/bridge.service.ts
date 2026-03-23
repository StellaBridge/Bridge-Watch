import { logger } from "../utils/logger.js";
import { ReserveVerificationService } from "./reserveVerification.service.js";

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

export class BridgeService {
  private readonly reserveVerificationService = new ReserveVerificationService();

  async getAllBridgeStatuses(): Promise<{ bridges: BridgeStatus[] }> {
    logger.info("Fetching all bridge statuses");
    // TODO: Query bridge status from database and on-chain data
    return { bridges: [] };
  }

  async getBridgeStats(bridgeName: string): Promise<BridgeStats | null> {
    logger.info({ bridgeName }, "Fetching bridge stats");
    // TODO: Aggregate bridge statistics from time-series data
    return null;
  }

  async verifySupply(
    assetCode: string
  ): Promise<{ stellarSupply: number; sourceSupply: number; match: boolean }> {
    logger.info({ assetCode }, "Verifying supply for asset");
    // TODO: Compare on-chain supplies across Stellar and source chain
    return { stellarSupply: 0, sourceSupply: 0, match: true };
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
