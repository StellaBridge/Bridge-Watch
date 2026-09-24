import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";

/**
 * #1184 — Queue Priority Fairness.
 *
 * Deficit Round Robin (DRR) scheduler with minimum share guarantees.
 * Pure core logic separated for unit testing without database.
 */

export type LaneName = "critical" | "high" | "medium" | "low";
export type FairnessStatus = "healthy" | "degraded" | "unfair" | "starved";

export const LANE_ORDER: LaneName[] = ["critical", "high", "medium", "low"];

export interface LanePolicy {
  laneName: LaneName;
  weight: number; // DRR quantum weight
  minSharePct: number; // 0-100 minimum guaranteed share
  enabled: boolean;
}

export interface LaneSample {
  laneName: LaneName;
  depth: number; // jobs waiting
  servedCount: number; // jobs completed in window
  servedBytes?: number; // optional work volume
  sampledAt: string;
}

export interface FairnessAssessment {
  laneName: LaneName;
  status: FairnessStatus;
  reason: string;
  sharePct: number; // actual share of capacity
  minSharePct: number; // configured minimum
  depth: number;
  servedCount: number;
}

export interface DRRState {
  deficits: Record<LaneName, number>;
  quantum: number;
}

/**
 * Default lane policies (matching migration seed)
 */
export const DEFAULT_LANE_POLICIES: Record<LaneName, LanePolicy> = {
  critical: { laneName: "critical", weight: 8, minSharePct: 10, enabled: true },
  high: { laneName: "high", weight: 4, minSharePct: 5, enabled: true },
  medium: { laneName: "medium", weight: 2, minSharePct: 5, enabled: true },
  low: { laneName: "low", weight: 1, minSharePct: 10, enabled: true },
};

/**
 * Compute the total weight of enabled lanes.
 */
export function totalEnabledWeight(policies: Record<LaneName, LanePolicy>): number {
  return LANE_ORDER.reduce((sum, lane) => sum + (policies[lane]?.enabled ? policies[lane].weight : 0), 0);
}

/**
 * Compute ideal share percentage for each lane based on weights.
 */
export function computeIdealShares(policies: Record<LaneName, LanePolicy>): Record<LaneName, number> {
  const total = totalEnabledWeight(policies);
  const shares: Record<LaneName, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  if (total === 0) return shares;
  for (const lane of LANE_ORDER) {
    shares[lane] = policies[lane]?.enabled ? Math.round((policies[lane].weight / total) * 10000) / 100 : 0;
  }
  return shares;
}

/**
 * Deficit Round Robin: pick the next lane to serve.
 * Returns the lane name that should be served next.
 *
 * Pure function — no side effects, fully testable.
 */
export function drrNextLane(
  state: DRRState,
  depths: Record<LaneName, number>,
  policies: Record<LaneName, LanePolicy>,
): LaneName {
  const enabledLanes = LANE_ORDER.filter((l) => policies[l]?.enabled && (depths[l] ?? 0) > 0);
  if (enabledLanes.length === 0) return "critical"; // no work anywhere

  // Add quantum to each enabled lane's deficit
  for (const lane of enabledLanes) {
    state.deficits[lane] += policies[lane].weight;
  }

  // Pick lane with highest deficit (break ties by priority order)
  let bestLane: LaneName = enabledLanes[0];
  let bestDeficit = state.deficits[bestLane];
  for (const lane of enabledLanes.slice(1)) {
    if (state.deficits[lane] > bestDeficit) {
      bestDeficit = state.deficits[lane];
      bestLane = lane;
    }
  }

  // Serve one job from bestLane
  state.deficits[bestLane] -= state.quantum;
  return bestLane;
}

/**
 * Initialize DRR state.
 */
export function initDRRState(quantum: number = 1): DRRState {
  return {
    deficits: { critical: 0, high: 0, medium: 0, low: 0 },
    quantum,
  };
}

/**
 * Assess fairness for a lane given its sample and policy.
 * Pure function.
 */
export function assessLaneFairness(
  sample: LaneSample,
  policy: LanePolicy,
  idealSharePct: number,
): FairnessAssessment {
  const served = sample.servedCount;
  const depth = sample.depth;
  const sharePct = served > 0 ? Math.round((served / (served + depth)) * 10000) / 100 : 0;

  let status: FairnessStatus = "healthy";
  let reason = "within thresholds";

  if (!policy.enabled) {
    status = "healthy";
    reason = "lane disabled";
  } else if (depth === 0) {
    status = "healthy";
    reason = "no backlog";
  } else if (served === 0) {
    status = "starved";
    reason = "backlog present but nothing served";
  } else if (sharePct < policy.minSharePct) {
    status = "unfair";
    reason = `served share ${sharePct}% below minimum ${policy.minSharePct}%`;
  } else if (sharePct < idealSharePct * 0.5) {
    status = "degraded";
    reason = `served share ${sharePct}% significantly below ideal ${idealSharePct}%`;
  }

  return {
    laneName: sample.laneName,
    status,
    reason,
    sharePct,
    minSharePct: policy.minSharePct,
    depth,
    servedCount: served,
  };
}

/**
 * Aggregate lane assessments into overall fairness status.
 */
export function aggregateFairness(assessments: FairnessAssessment[]): FairnessStatus {
  if (assessments.some((a) => a.status === "starved")) return "starved";
  if (assessments.some((a) => a.status === "unfair")) return "unfair";
  if (assessments.some((a) => a.status === "degraded")) return "degraded";
  return "healthy";
}

const mapPolicy = (r: any): LanePolicy => ({
  laneName: r.lane_name as LaneName,
  weight: Number(r.weight),
  minSharePct: Number(r.min_share_pct),
  enabled: Boolean(r.enabled),
});

const mapAssessment = (r: any): FairnessAssessment => ({
  laneName: r.lane_name as LaneName,
  status: r.status as FairnessStatus,
  reason: r.reason,
  sharePct: Number(r.share_pct),
  minSharePct: Number(r.min_share_pct),
  depth: Number(r.depth),
  servedCount: Number(r.served_count),
});

export class QueueFairnessService {
  constructor(private readonly db = getDatabase()) {}

  async getPolicy(laneName: LaneName): Promise<LanePolicy> {
    const row = await this.db("queue_fairness_policies").where({ lane_name: laneName }).first();
    return row ? mapPolicy(row) : DEFAULT_LANE_POLICIES[laneName];
  }

  async getAllPolicies(): Promise<Record<LaneName, LanePolicy>> {
    const rows = await this.db("queue_fairness_policies").select("*");
    const result: Record<LaneName, LanePolicy> = { ...DEFAULT_LANE_POLICIES };
    for (const row of rows) {
      result[row.lane_name as LaneName] = mapPolicy(row);
    }
    return result;
  }

  async upsertPolicy(policy: LanePolicy): Promise<LanePolicy> {
    const values = {
      lane_name: policy.laneName,
      weight: policy.weight,
      min_share_pct: policy.minSharePct,
      enabled: policy.enabled,
      updated_at: new Date(),
    };
    const [row] = await this.db("queue_fairness_policies")
      .insert(values)
      .onConflict("lane_name")
      .merge()
      .returning("*");
    return mapPolicy(row);
  }

  async recordSample(sample: LaneSample): Promise<FairnessAssessment> {
    const policies = await this.getAllPolicies();
    const idealShares = computeIdealShares(policies);
    const policy = policies[sample.laneName];
    const assessment = assessLaneFairness(sample, policy, idealShares[sample.laneName]);

    await this.db("queue_fairness_samples").insert({
      lane_name: sample.laneName,
      depth: sample.depth,
      served_count: sample.servedCount,
      served_bytes: sample.servedBytes ?? null,
      sampled_at: sample.sampledAt,
    });

    await this.db("queue_fairness_assessments").insert({
      lane_name: sample.laneName,
      status: assessment.status,
      reason: assessment.reason,
      share_pct: assessment.sharePct,
      min_share_pct: assessment.minSharePct,
      depth: assessment.depth,
      served_count: assessment.servedCount,
    });

    return assessment;
  }

  async getRecentSamples(laneName: LaneName, limit = 60): Promise<LaneSample[]> {
    const rows = await this.db("queue_fairness_samples")
      .where({ lane_name: laneName })
      .orderBy("sampled_at", "desc")
      .limit(limit);
    return rows.map((r: any) => ({
      laneName: r.lane_name as LaneName,
      depth: Number(r.depth),
      servedCount: Number(r.served_count),
      servedBytes: r.served_bytes ? Number(r.served_bytes) : undefined,
      sampledAt: r.sampled_at instanceof Date ? r.sampled_at.toISOString() : String(r.sampled_at),
    }));
  }

  async getRecentAssessments(laneName: LaneName, limit = 60): Promise<FairnessAssessment[]> {
    const rows = await this.db("queue_fairness_assessments")
      .where({ lane_name: laneName })
      .orderBy("assessed_at", "desc")
      .limit(limit);
    return rows.map(mapAssessment);
  }

  async getOverallFairness(): Promise<{ overall: FairnessStatus; byLane: FairnessAssessment[] }> {
    const policies = await this.getAllPolicies();
    const idealShares = computeIdealShares(policies);
    const assessments: FairnessAssessment[] = [];

    for (const lane of LANE_ORDER) {
      const latestSample = await this.db("queue_fairness_samples")
        .where({ lane_name: lane })
        .orderBy("sampled_at", "desc")
        .first();
      if (latestSample) {
        const assessment = assessLaneFairness(
          { laneName: lane, depth: Number(latestSample.depth), servedCount: Number(latestSample.served_count), sampledAt: String(latestSample.sampled_at) },
          policies[lane],
          idealShares[lane],
        );
        assessments.push(assessment);
      }
    }

    return { overall: aggregateFairness(assessments), byLane: assessments };
  }
}

export const queueFairnessService = new QueueFairnessService();