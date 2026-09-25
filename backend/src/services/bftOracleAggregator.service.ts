import crypto from "node:crypto";
import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";
import { providerHealthRegistryService } from "./providerHealthRegistry.service.js";

export interface OracleReport {
  providerKey: string;
  price: number;
  healthScore?: number;
  timestamp: string;
  signature?: string;
}

export interface OracleProviderNode {
  providerKey: string;
  displayName: string;
  publicKey: string;
  stakeWeight: number;
  status: "active" | "slashed" | "degraded" | "suspended";
  slashed: boolean;
  slashedAt: string | null;
  slashReason: string | null;
  totalSubmissions: number;
  totalSlashes: number;
}

export interface EvaluatedOracleSample {
  providerKey: string;
  price: number;
  stakeWeight: number;
  zScore: number;
  isOutlier: boolean;
  isSlashed: boolean;
}

export interface BftConsensusResult {
  roundId: string;
  assetCode: string;
  consensusPrice: number;
  medianOfMediansPrice: number;
  weightedMedianPrice: number;
  trimmedMeanPrice: number;
  meanPrice: number;
  stdDev: number;
  totalProviders: number;
  reportingProviders: number;
  validProviders: number;
  quorumReached: boolean;
  requiredQuorum: number;
  maxByzantineTolerance: number;
  samples: EvaluatedOracleSample[];
  slashedProviders: string[];
  aggregateSignature: string;
  timestamp: string;
}

/** Fraction of reports trimmed from each tail before averaging (issue #1261). */
const TRIM_RATIO = 0.2;
/** Observations deviating by more than this many sigma from the median are rejected (issue #1261). */
const OUTLIER_SIGMA_THRESHOLD = 3.0;

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Sorts the reported values, trims the top and bottom `trimRatio` of the
 * submissions and averages the remainder, so a single extreme report can
 * no longer skew the mean (issue #1261).
 */
function trimmedMean(values: number[], trimRatio: number = TRIM_RATIO): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const trimCount = Math.floor(sorted.length * trimRatio);
  if (sorted.length - 2 * trimCount <= 0) {
    return median(sorted);
  }
  return mean(sorted.slice(trimCount, sorted.length - trimCount));
}

function stdDev(values: number[], mu?: number): number {
  if (values.length < 2) return 0;
  const avg = mu ?? mean(values);
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function robustStdDev(values: number[], center: number): number {
  if (values.length < 2) return 0;
  const absDevs = values.map((v) => Math.abs(v - center));
  const mad = median(absDevs);
  const madSigma = 1.4826 * mad;
  if (madSigma > 1e-9) return madSigma;
  return stdDev(values, center);
}


function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function medianOfMedians(values: number[], groupSize = 5): number {
  if (values.length === 0) return 0;
  if (values.length <= groupSize) return median(values);

  const medians: number[] = [];
  for (let i = 0; i < values.length; i += groupSize) {
    const group = values.slice(i, i + groupSize);
    medians.push(median(group));
  }
  return medianOfMedians(medians, groupSize);
}

function weightedStakeMedian(items: { price: number; weight: number }[]): number {
  if (items.length === 0) return 0;
  if (items.length === 1) return items[0].price;

  const sorted = [...items].sort((a, b) => a.price - b.price);
  const totalWeight = sorted.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) return median(sorted.map((i) => i.price));

  let cumulative = 0;
  const halfWeight = totalWeight / 2;

  for (const item of sorted) {
    cumulative += item.weight;
    if (cumulative >= halfWeight) {
      return item.price;
    }
  }
  return sorted[sorted.length - 1].price;
}

export class BftOracleAggregatorService {
  private readonly db = getDatabase();
  private readonly signingSecret: string;

  constructor(secretKey = "bft-oracle-aggregator-secret-key") {
    this.signingSecret = secretKey;
  }

  async registerProviderNode(node: {
    providerKey: string;
    displayName: string;
    publicKey: string;
    stakeWeight?: number;
  }): Promise<OracleProviderNode> {
    const stakeWeight = node.stakeWeight ?? 1.0;
    const now = new Date().toISOString();

    const provider: OracleProviderNode = {
      providerKey: node.providerKey,
      displayName: node.displayName,
      publicKey: node.publicKey,
      stakeWeight,
      status: "active",
      slashed: false,
      slashedAt: null,
      slashReason: null,
      totalSubmissions: 0,
      totalSlashes: 0,
    };

    try {
      const exists = await this.db("bft_oracle_providers").where({ provider_key: node.providerKey }).first();
      if (exists) {
        await this.db("bft_oracle_providers")
          .where({ provider_key: node.providerKey })
          .update({
            display_name: node.displayName,
            public_key: node.publicKey,
            stake_weight: stakeWeight,
            updated_at: this.db.fn.now(),
          });
      } else {
        await this.db("bft_oracle_providers").insert({
          provider_key: node.providerKey,
          display_name: node.displayName,
          public_key: node.publicKey,
          stake_weight: stakeWeight,
          status: "active",
          slashed: false,
          total_submissions: 0,
          total_slashes: 0,
          created_at: this.db.fn.now(),
          updated_at: this.db.fn.now(),
        });
      }
    } catch (err) {
      logger.warn({ err, providerKey: node.providerKey }, "DB insert for bft_oracle_providers failed");
    }

    return provider;
  }

  async getRegisteredProviders(): Promise<OracleProviderNode[]> {
    try {
      const rows = await this.db("bft_oracle_providers").select("*");
      if (rows && rows.length > 0) {
        return rows.map((r) => ({
          providerKey: String(r.provider_key),
          displayName: String(r.display_name),
          publicKey: String(r.public_key),
          stakeWeight: Number(r.stake_weight),
          status: r.status as OracleProviderNode["status"],
          slashed: Boolean(r.slashed),
          slashedAt: r.slashed_at ? new Date(r.slashed_at).toISOString() : null,
          slashReason: r.slash_reason ? String(r.slash_reason) : null,
          totalSubmissions: Number(r.total_submissions),
          totalSlashes: Number(r.total_slashes),
        }));
      }
    } catch (err) {
      logger.warn({ err }, "DB select from bft_oracle_providers failed");
    }
    return [];
  }

  async aggregateBftState(
    assetCode: string,
    reports: OracleReport[],
    registeredNodes?: OracleProviderNode[]
  ): Promise<BftConsensusResult> {
    const roundId = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    const nodes = registeredNodes ?? (await this.getRegisteredProviders());
    const nodeMap = new Map<string, OracleProviderNode>();
    for (const node of nodes) {
      nodeMap.set(node.providerKey, node);
    }

    const seenProviders = new Set<string>();
    const validReports: { report: OracleReport; node: OracleProviderNode }[] = [];
    for (const report of reports) {
      if (seenProviders.has(report.providerKey)) {
        continue;
      }
      seenProviders.add(report.providerKey);

      const node = nodeMap.get(report.providerKey) ?? {
        providerKey: report.providerKey,
        displayName: report.providerKey,
        publicKey: `pubkey_${report.providerKey}`,
        stakeWeight: 1.0,
        status: "active",
        slashed: false,
        slashedAt: null,
        slashReason: null,
        totalSubmissions: 0,
        totalSlashes: 0,
      };

      if (!node.slashed && node.status !== "slashed") {
        validReports.push({ report, node });
      }
    }


    const totalN = Math.max(nodes.length, reports.length);
    const f = Math.floor((totalN - 1) / 3);
    const requiredQuorum = 2 * f + 1;
    const reportingCount = validReports.length;

    if (reportingCount < requiredQuorum || reportingCount === 0) {
      const emptyResult: BftConsensusResult = {
        roundId,
        assetCode,
        consensusPrice: 0,
        medianOfMediansPrice: 0,
        weightedMedianPrice: 0,
        trimmedMeanPrice: 0,
        meanPrice: 0,
        stdDev: 0,
        totalProviders: totalN,
        reportingProviders: reportingCount,
        validProviders: 0,
        quorumReached: false,
        requiredQuorum,
        maxByzantineTolerance: f,
        samples: [],
        slashedProviders: [],
        aggregateSignature: "",
        timestamp,
      };
      emptyResult.aggregateSignature = this.signAggregatePayload(emptyResult);
      return emptyResult;
    }

    const initialPrices = validReports.map((item) => item.report.price);
    const initialMedMed = medianOfMedians(initialPrices);
    const initialWeightedMed = weightedStakeMedian(
      validReports.map((item) => ({ price: item.report.price, weight: item.node.stakeWeight }))
    );

    const initialConsensus = (initialMedMed + initialWeightedMed) / 2;
    const initialSigma = robustStdDev(initialPrices, initialConsensus);
    // Outliers are measured against the median, not the mean, so a single
    // extreme submission cannot drag the rejection boundary with it
    // (issue #1261).
    const initialCenter = median(initialPrices);


    const evaluatedSamples: EvaluatedOracleSample[] = [];
    const slashedProviders: string[] = [];

    for (const item of validReports) {
      const p = item.report.price;
      const z = initialSigma > 0 ? Math.abs((p - initialCenter) / initialSigma) : 0;
      const isOutlier = initialPrices.length >= 3 && z > OUTLIER_SIGMA_THRESHOLD;

      if (isOutlier) {
        slashedProviders.push(item.report.providerKey);
        await providerHealthRegistryService.flagAndSlashProvider(
          item.report.providerKey,
          z,
          `Byzantine outlier detected: ${z.toFixed(2)} sigma from consensus`,
          item.node.stakeWeight,
          roundId,
          assetCode,
          p,
          initialConsensus
        );
      }

      evaluatedSamples.push({
        providerKey: item.report.providerKey,
        price: p,
        stakeWeight: item.node.stakeWeight,
        zScore: z,
        isOutlier,
        isSlashed: isOutlier,
      });
    }

    const nonOutliers = evaluatedSamples.filter((s) => !s.isOutlier);
    const finalPrices = nonOutliers.map((s) => s.price);

    const finalMedMed = medianOfMedians(finalPrices);
    const finalWeightedMed = weightedStakeMedian(
      nonOutliers.map((s) => ({ price: s.price, weight: s.stakeWeight }))
    );
    // 20% trimmed mean of the surviving reports (issue #1261)
    const finalTrimmedMean = trimmedMean(finalPrices);
    const finalConsensus = nonOutliers.length > 0 ? (finalMedMed + finalWeightedMed + finalTrimmedMean) / 3 : initialConsensus;
    const finalMean = mean(finalPrices);
    const finalSigma = stdDev(finalPrices, finalMean);

    const validCount = nonOutliers.length;
    const quorumReached = validCount >= requiredQuorum;

    const result: BftConsensusResult = {
      roundId,
      assetCode,
      consensusPrice: finalConsensus,
      medianOfMediansPrice: finalMedMed,
      weightedMedianPrice: finalWeightedMed,
      trimmedMeanPrice: finalTrimmedMean,
      meanPrice: finalMean,
      stdDev: finalSigma,
      totalProviders: totalN,
      reportingProviders: reportingCount,
      validProviders: validCount,
      quorumReached,
      requiredQuorum,
      maxByzantineTolerance: f,
      samples: evaluatedSamples,
      slashedProviders,
      aggregateSignature: "",
      timestamp,
    };

    result.aggregateSignature = this.signAggregatePayload(result);

    try {
      await this.db("bft_consensus_rounds").insert({
        id: roundId,
        asset_code: assetCode,
        consensus_price: finalConsensus,
        median_of_medians: finalMedMed,
        mean: finalMean,
        std_dev: finalSigma,
        total_providers: totalN,
        valid_providers: validCount,
        quorum_reached: quorumReached,
        aggregate_signature: result.aggregateSignature,
        created_at: this.db.fn.now(),
      });
    } catch (err) {
      logger.warn({ err, roundId }, "Failed to persist bft_consensus_rounds in DB");
    }

    return result;
  }

  signAggregatePayload(result: Omit<BftConsensusResult, "aggregateSignature">): string {
    const payload = `${result.roundId}:${result.assetCode}:${result.consensusPrice}:${result.quorumReached}:${result.validProviders}:${result.timestamp}`;
    return crypto.createHmac("sha256", this.signingSecret).update(payload).digest("hex");
  }

  verifyAggregatePayload(result: BftConsensusResult): boolean {
    const expectedSig = this.signAggregatePayload(result);
    return crypto.timingSafeEqual(Buffer.from(result.aggregateSignature), Buffer.from(expectedSig));
  }

  async getPastRounds(assetCode: string, limit = 20): Promise<Record<string, unknown>[]> {
    try {
      return await this.db("bft_consensus_rounds")
        .where({ asset_code: assetCode })
        .orderBy("created_at", "desc")
        .limit(limit);
    } catch {
      return [];
    }
  }

  async getSlashingHistory(limit = 50): Promise<Record<string, unknown>[]> {
    try {
      return await this.db("bft_slashing_events").orderBy("created_at", "desc").limit(limit);
    } catch {
      return [];
    }
  }
}

export const bftOracleAggregatorService = new BftOracleAggregatorService();
