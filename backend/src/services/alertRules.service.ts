import crypto from "crypto";
import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";
import { compareTemporalPoints, createTemporalPoint, nowAsTemporalPoint } from "../temporal/temporalUtils.js";
import type { ComparisonOptions, TemporalPoint } from "../temporal/types.js";

// =============================================================================
// TYPES
// =============================================================================

export type ThresholdOperator =
  | "gt"     // greater than
  | "gte"    // greater than or equal
  | "lt"     // less than
  | "lte"    // less than or equal
  | "eq"     // equal
  | "ne"     // not equal
  | "between"          // value in [low, high]
  | "changes_by_pct";  // absolute % change exceeds threshold

export type LogicOperator = "AND" | "OR";

export type RulePriority = "critical" | "high" | "medium" | "low";

export type AlertRuleStatus = "active" | "disabled" | "testing";

export interface TimeWindow {
  /** UTC hour 0-23 */
  startHour: number;
  /** UTC hour 0-23 */
  endHour: number;
  /** Days of week: 0=Sun … 6=Sat; omit for all days */
  daysOfWeek?: number[];
}

export interface RuleCondition {
  metric: string;
  operator: ThresholdOperator;
  threshold: number;
  /** Required for "between" operator */
  thresholdHigh?: number;
  /** Label for display and audit purposes */
  label?: string;
  /** Temporal comparison mode for time-based metrics */
  temporalMode?: ComparisonOptions["mode"];
  /** Whether this condition uses temporal semantics */
  useTemporal?: boolean;
}

export interface AlertRule {
  id: string;
  ownerAddress: string;
  name: string;
  description: string | null;
  assetCode: string;
  conditions: RuleCondition[];
  logicOperator: LogicOperator;
  priority: RulePriority;
  status: AlertRuleStatus;
  cooldownSeconds: number;
  timeWindow: TimeWindow | null;
  version: number;
  templateId: string | null;
  webhookUrl: string | null;
  lastTriggeredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RuleVersion {
  id: string;
  ruleId: string;
  version: number;
  snapshot: Omit<AlertRule, "id" | "createdAt" | "updatedAt">;
  changedBy: string;
  createdAt: Date;
}

export interface RuleTemplate {
  id: string;
  name: string;
  description: string;
  conditions: RuleCondition[];
  logicOperator: LogicOperator;
  priority: RulePriority;
  cooldownSeconds: number;
}

export interface EvaluationResult {
  ruleId: string;
  ruleName: string;
  assetCode: string;
  priority: RulePriority;
  triggered: boolean;
  conditionResults: Array<{
    metric: string;
    operator: ThresholdOperator;
    threshold: number;
    actualValue: number;
    passed: boolean;
    /** Temporal comparison result if applicable */
    temporalComparison?: ReturnType<typeof compareTemporalPoints>;
    /** Confidence in the condition evaluation (0-1) */
    confidence?: number;
  }>;
  logicOperator: LogicOperator;
  timeWindowActive: boolean;
  testMode: boolean;
  /** Overall confidence in the evaluation (0-1) */
  overallConfidence: number;
}

// =============================================================================
// BUILT-IN TEMPLATES
// =============================================================================

const BUILT_IN_TEMPLATES: RuleTemplate[] = [
  {
    id: "tpl:price-deviation",
    name: "Price Deviation Alert",
    description: "Fires when price deviates more than a threshold from the reference price",
    conditions: [{ metric: "price_deviation_bps", operator: "gt", threshold: 200, label: "Price deviation > 2%" }],
    logicOperator: "AND",
    priority: "high",
    cooldownSeconds: 1800,
  },
  {
    id: "tpl:supply-mismatch",
    name: "Supply Mismatch Alert",
    description: "Fires when issued supply diverges from on-chain reserves",
    conditions: [{ metric: "supply_mismatch_pct", operator: "gt", threshold: 1, label: "Supply mismatch > 1%" }],
    logicOperator: "AND",
    priority: "critical",
    cooldownSeconds: 3600,
  },
  {
    id: "tpl:health-score-drop",
    name: "Health Score Drop",
    description: "Fires when bridge health score falls below a floor",
    conditions: [{ metric: "health_score", operator: "lt", threshold: 70, label: "Health score < 70" }],
    logicOperator: "AND",
    priority: "medium",
    cooldownSeconds: 3600,
  },
  {
    id: "tpl:liquidity-critical",
    name: "Liquidity Critically Low",
    description: "Fires when available liquidity drops below minimum AND health score is low",
    conditions: [
      { metric: "liquidity_usd", operator: "lt", threshold: 100_000, label: "Liquidity < $100k" },
      { metric: "health_score", operator: "lt", threshold: 60, label: "Health score < 60" },
    ],
    logicOperator: "AND",
    priority: "critical",
    cooldownSeconds: 900,
  },
  {
    id: "tpl:volume-anomaly",
    name: "Volume Anomaly",
    description: "Fires when 24h volume changes by more than 50% from the previous period",
    conditions: [{ metric: "volume_24h_usd", operator: "changes_by_pct", threshold: 50, label: "Volume ±50%" }],
    logicOperator: "AND",
    priority: "medium",
    cooldownSeconds: 7200,
  },
];

// =============================================================================
// EVALUATION ENGINE
// =============================================================================

function evaluateCondition(
  condition: RuleCondition,
  value: number,
  previousValue?: number,
  temporalPoint?: TemporalPoint,
  previousTemporalPoint?: TemporalPoint
): { passed: boolean; temporalComparison?: ReturnType<typeof compareTemporalPoints>; confidence: number } {
  const { operator, threshold, thresholdHigh, useTemporal, temporalMode } = condition;

  // Use temporal comparison if enabled and temporal points are available
  if (useTemporal && temporalPoint && previousTemporalPoint) {
    const comparison = compareTemporalPoints(previousTemporalPoint, temporalPoint, {
      mode: temporalMode || "approximate",
    });

    // For temporal conditions, we check if the comparison matches the expected operator
    let temporalPassed = false;
    if (comparison.result === "before" && (operator === "lt" || operator === "lte")) {
      temporalPassed = true;
    } else if (comparison.result === "after" && (operator === "gt" || operator === "gte")) {
      temporalPassed = true;
    } else if (comparison.result === "concurrent" && operator === "eq") {
      temporalPassed = true;
    }

    return {
      passed: temporalPassed,
      temporalComparison: comparison,
      confidence: comparison.confidence,
    };
  }

  // Fall back to standard numeric comparison
  let passed = false;
  switch (operator) {
    case "gt":   passed = value > threshold; break;
    case "gte":  passed = value >= threshold; break;
    case "lt":   passed = value < threshold; break;
    case "lte":  passed = value <= threshold; break;
    case "eq":   passed = value === threshold; break;
    case "ne":   passed = value !== threshold; break;
    case "between":
      passed = thresholdHigh !== undefined && value >= threshold && value <= thresholdHigh;
      break;
    case "changes_by_pct":
      if (previousValue === undefined || previousValue === 0) {
        passed = false;
      } else {
        passed = Math.abs((value - previousValue) / previousValue) * 100 >= threshold;
      }
      break;
    default:
      passed = false;
  }

  return { passed, confidence: 1.0 };
}

function isTimeWindowActive(window: TimeWindow | null): boolean {
  if (!window) return true;
  const now = new Date();
  const hour = now.getUTCHours();
  const day = now.getUTCDay();

  if (window.daysOfWeek && !window.daysOfWeek.includes(day)) return false;

  // Handle windows that cross midnight (e.g. 22:00–06:00)
  if (window.startHour <= window.endHour) {
    return hour >= window.startHour && hour < window.endHour;
  }
  return hour >= window.startHour || hour < window.endHour;
}

// =============================================================================
// SERVICE
// =============================================================================

export class AlertRulesService {
  private static instance: AlertRulesService;

  private constructor() {}

  public static getInstance(): AlertRulesService {
    if (!AlertRulesService.instance) {
      AlertRulesService.instance = new AlertRulesService();
    }
    return AlertRulesService.instance;
  }

  // ---------------------------------------------------------------------------
  // TEMPLATES
  // ---------------------------------------------------------------------------

  public listTemplates(): RuleTemplate[] {
    return BUILT_IN_TEMPLATES;
  }

  public getTemplate(templateId: string): RuleTemplate | null {
    return BUILT_IN_TEMPLATES.find((t) => t.id === templateId) ?? null;
  }

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  public async createRule(params: {
    ownerAddress: string;
    name: string;
    description?: string;
    assetCode: string;
    conditions: RuleCondition[];
    logicOperator?: LogicOperator;
    priority?: RulePriority;
    cooldownSeconds?: number;
    timeWindow?: TimeWindow;
    webhookUrl?: string;
    templateId?: string;
    status?: AlertRuleStatus;
  }): Promise<AlertRule> {
    const db = getDatabase();
    this.validateConditions(params.conditions);

    const [row] = await db("alert_rules_v2")
      .insert({
        id: crypto.randomUUID(),
        owner_address: params.ownerAddress,
        name: params.name,
        description: params.description ?? null,
        asset_code: params.assetCode,
        conditions: JSON.stringify(params.conditions),
        logic_operator: params.logicOperator ?? "AND",
        priority: params.priority ?? "medium",
        status: params.status ?? "active",
        cooldown_seconds: params.cooldownSeconds ?? 3600,
        time_window: params.timeWindow ? JSON.stringify(params.timeWindow) : null,
        version: 1,
        template_id: params.templateId ?? null,
        webhook_url: params.webhookUrl ?? null,
        last_triggered_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning("*");

    await this.saveVersion(row.id, 1, this.mapRow(row), params.ownerAddress);
    logger.info({ ruleId: row.id, name: params.name }, "Alert rule created");
    return this.mapRow(row);
  }

  public async updateRule(
    ruleId: string,
    changedBy: string,
    updates: Partial<{
      name: string;
      description: string;
      conditions: RuleCondition[];
      logicOperator: LogicOperator;
      priority: RulePriority;
      status: AlertRuleStatus;
      cooldownSeconds: number;
      timeWindow: TimeWindow | null;
      webhookUrl: string | null;
    }>
  ): Promise<AlertRule | null> {
    const db = getDatabase();
    if (updates.conditions) this.validateConditions(updates.conditions);

    const updateData: Record<string, unknown> = { updated_at: new Date() };
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.conditions !== undefined) updateData.conditions = JSON.stringify(updates.conditions);
    if (updates.logicOperator !== undefined) updateData.logic_operator = updates.logicOperator;
    if (updates.priority !== undefined) updateData.priority = updates.priority;
    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.cooldownSeconds !== undefined) updateData.cooldown_seconds = updates.cooldownSeconds;
    if (updates.webhookUrl !== undefined) updateData.webhook_url = updates.webhookUrl;
    if ("timeWindow" in updates) {
      updateData.time_window = updates.timeWindow ? JSON.stringify(updates.timeWindow) : null;
    }
    // Bump version
    updateData.version = db.raw("version + 1");

    const [row] = await db("alert_rules_v2")
      .where("id", ruleId)
      .update(updateData)
      .returning("*");

    if (!row) return null;

    const mapped = this.mapRow(row);
    await this.saveVersion(ruleId, mapped.version, mapped, changedBy);
    logger.info({ ruleId, version: mapped.version }, "Alert rule updated");
    return mapped;
  }

  public async setStatus(ruleId: string, status: AlertRuleStatus): Promise<boolean> {
    const db = getDatabase();
    const count = await db("alert_rules_v2")
      .where("id", ruleId)
      .update({ status, updated_at: new Date() });
    return count > 0;
  }

  public async deleteRule(ruleId: string): Promise<boolean> {
    const db = getDatabase();
    const count = await db("alert_rules_v2").where("id", ruleId).delete();
    if (count > 0) logger.info({ ruleId }, "Alert rule deleted");
    return count > 0;
  }

  public async getRule(ruleId: string): Promise<AlertRule | null> {
    const db = getDatabase();
    const row = await db("alert_rules_v2").where("id", ruleId).first();
    return row ? this.mapRow(row) : null;
  }

  public async listRules(params: {
    ownerAddress?: string;
    assetCode?: string;
    status?: AlertRuleStatus;
    priority?: RulePriority;
  } = {}): Promise<AlertRule[]> {
    const db = getDatabase();
    let query = db("alert_rules_v2").orderBy("created_at", "desc");
    if (params.ownerAddress) query = query.where("owner_address", params.ownerAddress);
    if (params.assetCode) query = query.where("asset_code", params.assetCode);
    if (params.status) query = query.where("status", params.status);
    if (params.priority) query = query.where("priority", params.priority);
    const rows = await query;
    return rows.map((r: Record<string, unknown>) => this.mapRow(r));
  }

  // ---------------------------------------------------------------------------
  // VERSIONING
  // ---------------------------------------------------------------------------

  private async saveVersion(
    ruleId: string,
    version: number,
    snapshot: AlertRule,
    changedBy: string
  ): Promise<void> {
    const db = getDatabase();
    await db("alert_rule_versions").insert({
      id: crypto.randomUUID(),
      rule_id: ruleId,
      version,
      snapshot: JSON.stringify(snapshot),
      changed_by: changedBy,
      created_at: new Date(),
    });
  }

  public async getVersionHistory(ruleId: string): Promise<RuleVersion[]> {
    const db = getDatabase();
    const rows = await db("alert_rule_versions")
      .where("rule_id", ruleId)
      .orderBy("version", "desc");
    return rows.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      ruleId: r.rule_id as string,
      version: r.version as number,
      snapshot: typeof r.snapshot === "string" ? JSON.parse(r.snapshot as string) : r.snapshot,
      changedBy: r.changed_by as string,
      createdAt: r.created_at as Date,
    }));
  }

  // ---------------------------------------------------------------------------
  // EVALUATION ENGINE
  // ---------------------------------------------------------------------------

  public evaluateRule(
    rule: AlertRule,
    metrics: Record<string, number>,
    previousMetrics?: Record<string, number>,
    testMode = false,
    temporalMetrics?: Record<string, TemporalPoint>,
    previousTemporalMetrics?: Record<string, TemporalPoint>
  ): EvaluationResult {
    const timeWindowActive = isTimeWindowActive(rule.timeWindow);

    const conditionResults = rule.conditions.map((cond) => {
      const value = metrics[cond.metric] ?? 0;
      const previousValue = previousMetrics?.[cond.metric];
      const temporalPoint = temporalMetrics?.[cond.metric];
      const previousTemporalPoint = previousTemporalMetrics?.[cond.metric];
      
      const result = evaluateCondition(cond, value, previousValue, temporalPoint, previousTemporalPoint);
      
      return {
        metric: cond.metric,
        operator: cond.operator,
        threshold: cond.threshold,
        actualValue: value,
        passed: result.passed,
        temporalComparison: result.temporalComparison,
        confidence: result.confidence,
      };
    });

    const triggered =
      timeWindowActive &&
      (rule.status === "active" || testMode) &&
      (rule.logicOperator === "AND"
        ? conditionResults.every((r) => r.passed)
        : conditionResults.some((r) => r.passed));

    // Calculate overall confidence based on condition confidences
    const overallConfidence = conditionResults.length > 0
      ? conditionResults.reduce((sum, r) => sum + (r.confidence || 1.0), 0) / conditionResults.length
      : 1.0;

    return {
      ruleId: rule.id,
      ruleName: rule.name,
      assetCode: rule.assetCode,
      priority: rule.priority,
      triggered,
      conditionResults,
      logicOperator: rule.logicOperator,
      timeWindowActive,
      testMode,
      overallConfidence,
    };
  }

  public async evaluateAllActiveRules(
    assetCode: string,
    metrics: Record<string, number>,
    previousMetrics?: Record<string, number>
  ): Promise<EvaluationResult[]> {
    const rules = await this.listRules({ assetCode, status: "active" });
    return rules.map((rule) =>
      this.evaluateRule(rule, metrics, previousMetrics)
    );
  }

  public async testRule(
    ruleId: string,
    metrics: Record<string, number>,
    previousMetrics?: Record<string, number>
  ): Promise<EvaluationResult> {
    const rule = await this.getRule(ruleId);
    if (!rule) throw new Error(`Rule not found: ${ruleId}`);
    return this.evaluateRule(rule, metrics, previousMetrics, true);
  }

  public async markTriggered(ruleId: string): Promise<void> {
    const db = getDatabase();
    await db("alert_rules_v2")
      .where("id", ruleId)
      .update({ last_triggered_at: new Date() });
  }

  // ---------------------------------------------------------------------------
  // VALIDATION
  // ---------------------------------------------------------------------------

  private validateConditions(conditions: RuleCondition[]): void {
    if (!conditions.length) {
      throw new Error("At least one condition is required");
    }
    for (const cond of conditions) {
      if (!cond.metric?.trim()) throw new Error("Condition metric cannot be empty");
      if (cond.operator === "between" && cond.thresholdHigh === undefined) {
        throw new Error(`Condition using "between" requires thresholdHigh`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // MAPPER
  // ---------------------------------------------------------------------------

  private mapRow(row: Record<string, unknown>): AlertRule {
    const parse = <T>(v: unknown): T => {
      if (typeof v === "string") return JSON.parse(v) as T;
      return v as T;
    };
    return {
      id: row.id as string,
      ownerAddress: row.owner_address as string,
      name: row.name as string,
      description: (row.description as string) ?? null,
      assetCode: row.asset_code as string,
      conditions: parse<RuleCondition[]>(row.conditions),
      logicOperator: row.logic_operator as LogicOperator,
      priority: row.priority as RulePriority,
      status: row.status as AlertRuleStatus,
      cooldownSeconds: row.cooldown_seconds as number,
      timeWindow: row.time_window ? parse<TimeWindow>(row.time_window) : null,
      version: row.version as number,
      templateId: (row.template_id as string) ?? null,
      webhookUrl: (row.webhook_url as string) ?? null,
      lastTriggeredAt: (row.last_triggered_at as Date) ?? null,
      createdAt: row.created_at as Date,
      updatedAt: row.updated_at as Date,
    };
  }
}

export const alertRulesService = AlertRulesService.getInstance();
