import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";
import { circuitBreakerQueue } from "../workers/circuitBreaker.worker.js";
import { getMetricsService } from "./metrics.service.js";

export type AlertType =
  | "price_deviation"
  | "supply_mismatch"
  | "bridge_downtime"
  | "health_score_drop"
  | "volume_anomaly"
  | "reserve_ratio_breach";

export type AlertPriority = "critical" | "high" | "medium" | "low";
export type ConditionOp = "AND" | "OR";
export type CompareOp = "gt" | "lt" | "eq";

export interface AlertCondition {
  metric: string;
  alertType: AlertType;
  compareOp: CompareOp;
  threshold: number;
}

export interface AlertRule {
  id: string;
  ownerAddress: string;
  name: string;
  assetCode: string;
  conditions: AlertCondition[];
  conditionOp: ConditionOp;
  priority: AlertPriority;
  cooldownSeconds: number;
  isActive: boolean;
  webhookUrl: string | null;
  onChainRuleId: number | null;
  lastTriggeredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AlertEvent {
  ruleId: string;
  assetCode: string;
  alertType: AlertType;
  priority: AlertPriority;
  triggeredValue: number;
  threshold: number;
  metric: string;
  webhookDelivered: boolean;
  onChainEventId: number | null;
  time: Date;
}

export interface MetricSnapshot {
  assetCode: string;
  metrics: Record<string, number>;
}

export class AlertService {
  async createRule(
    ownerAddress: string,
    name: string,
    assetCode: string,
    conditions: AlertCondition[],
    conditionOp: ConditionOp,
    priority: AlertPriority,
    cooldownSeconds: number,
    webhookUrl?: string
  ): Promise<AlertRule> {
    const db = getDatabase();
    const [row] = await db("alert_rules")
      .insert({
        owner_address: ownerAddress,
        name,
        asset_code: assetCode,
        conditions: JSON.stringify(conditions),
        condition_op: conditionOp,
        priority,
        cooldown_seconds: cooldownSeconds,
        webhook_url: webhookUrl ?? null,
      })
      .returning("*");

    logger.info({ ruleId: row.id, ownerAddress, assetCode }, "Alert rule created");
    return this.mapRule(row);
  }

  async updateRule(
    ruleId: string,
    ownerAddress: string,
    updates: Partial<{
      name: string;
      conditions: AlertCondition[];
      conditionOp: ConditionOp;
      priority: AlertPriority;
      cooldownSeconds: number;
      webhookUrl: string | null;
    }>
  ): Promise<AlertRule | null> {
    const db = getDatabase();
    const patch: Record<string, unknown> = {};
    if (updates.name !== undefined) patch.name = updates.name;
    if (updates.conditions !== undefined)
      patch.conditions = JSON.stringify(updates.conditions);
    if (updates.conditionOp !== undefined) patch.condition_op = updates.conditionOp;
    if (updates.priority !== undefined) patch.priority = updates.priority;
    if (updates.cooldownSeconds !== undefined)
      patch.cooldown_seconds = updates.cooldownSeconds;
    if (updates.webhookUrl !== undefined) patch.webhook_url = updates.webhookUrl;

    const [row] = await db("alert_rules")
      .where({ id: ruleId, owner_address: ownerAddress })
      .update(patch)
      .returning("*");

    if (!row) return null;
    logger.info({ ruleId }, "Alert rule updated");
    return this.mapRule(row);
  }

  async deleteRule(ruleId: string, ownerAddress: string): Promise<boolean> {
    const db = getDatabase();
    const count = await db("alert_rules")
      .where({ id: ruleId, owner_address: ownerAddress })
      .delete();
    return count > 0;
  }

  async bulkCreateRules(
    ownerAddress: string,
    rules: Array<{
      name: string;
      assetCode: string;
      conditions: AlertCondition[];
      conditionOp: ConditionOp;
      priority: AlertPriority;
      cooldownSeconds: number;
      webhookUrl?: string;
    }>
  ): Promise<AlertRule[]> {
    const db = getDatabase();
    const records = rules.map((r) => ({
      owner_address: ownerAddress,
      name: r.name,
      asset_code: r.assetCode,
      conditions: JSON.stringify(r.conditions),
      condition_op: r.conditionOp,
      priority: r.priority,
      cooldown_seconds: r.cooldownSeconds,
      webhook_url: r.webhookUrl ?? null,
    }));

    const rows = await db("alert_rules").insert(records).returning("*");
    logger.info(
      { ownerAddress, count: rows.length },
      "Bulk alert rules created"
    );
    return rows.map(this.mapRule);
  }

  async bulkUpdateRules(
    ownerAddress: string,
    updates: Array<{
      id: string;
      name?: string;
      conditions?: AlertCondition[];
      conditionOp?: ConditionOp;
      priority?: AlertPriority;
      cooldownSeconds?: number;
      webhookUrl?: string | null;
    }>
  ): Promise<AlertRule[]> {
    const db = getDatabase();
    const results: AlertRule[] = [];

    await db.transaction(async (trx) => {
      for (const update of updates) {
        const patch: Record<string, unknown> = {};
        if (update.name !== undefined) patch.name = update.name;
        if (update.conditions !== undefined)
          patch.conditions = JSON.stringify(update.conditions);
        if (update.conditionOp !== undefined)
          patch.condition_op = update.conditionOp;
        if (update.priority !== undefined) patch.priority = update.priority;
        if (update.cooldownSeconds !== undefined)
          patch.cooldown_seconds = update.cooldownSeconds;
        if (update.webhookUrl !== undefined)
          patch.webhook_url = update.webhookUrl;

        const [row] = await trx("alert_rules")
          .where({ id: update.id, owner_address: ownerAddress })
          .update(patch)
          .returning("*");

        if (row) {
          results.push(this.mapRule(row));
        }
      }
    });

    logger.info(
      { ownerAddress, count: results.length },
      "Bulk alert rules updated"
    );
    return results;
  }

  async bulkDeleteRules(
    ownerAddress: string,
    ruleIds: string[]
  ): Promise<number> {
    const db = getDatabase();
    const count = await db("alert_rules")
      .where({ owner_address: ownerAddress })
      .whereIn("id", ruleIds)
      .delete();

    logger.info({ ownerAddress, count }, "Bulk alert rules deleted");
    return count;
  }

  async setRuleActive(
    ruleId: string,
    ownerAddress: string,
    isActive: boolean
  ): Promise<boolean> {
    const db = getDatabase();
    const count = await db("alert_rules")
      .where({ id: ruleId, owner_address: ownerAddress })
      .update({ is_active: isActive });
    return count > 0;
  }

  async getRule(ruleId: string): Promise<AlertRule | null> {
    const db = getDatabase();
    const row = await db("alert_rules").where({ id: ruleId }).first();
    return row ? this.mapRule(row) : null;
  }

  async getRulesForOwner(ownerAddress: string): Promise<AlertRule[]> {
    const db = getDatabase();
    const rows = await db("alert_rules")
      .where({ owner_address: ownerAddress })
      .orderBy("created_at", "desc");
    return rows.map(this.mapRule);
  }

  async getActiveRulesForAsset(assetCode: string): Promise<AlertRule[]> {
    const db = getDatabase();
    const rows = await db("alert_rules").where({
      asset_code: assetCode,
      is_active: true,
    });
    return rows.map(this.mapRule);
  }

  async getAllActiveRules(): Promise<AlertRule[]> {
    const db = getDatabase();
    const rows = await db("alert_rules").where({ is_active: true });
    return rows.map(this.mapRule);
  }

  async evaluateAsset(snapshot: MetricSnapshot): Promise<AlertEvent[]> {
    const rules = await this.getActiveRulesForAsset(snapshot.assetCode);
    const now = new Date();
    const triggered: AlertEvent[] = [];

    for (const rule of rules) {
      if (rule.lastTriggeredAt && rule.cooldownSeconds > 0) {
        const elapsed = (now.getTime() - rule.lastTriggeredAt.getTime()) / 1000;
        if (elapsed < rule.cooldownSeconds) {
          continue;
        }
      }

      const { fires, triggeredValue, threshold, metric, alertType } =
        this.evaluateConditions(rule, snapshot.metrics);

      if (fires) {
        const event: AlertEvent = {
          ruleId: rule.id,
          assetCode: snapshot.assetCode,
          alertType,
          priority: rule.priority,
          triggeredValue,
          threshold,
          metric,
          webhookDelivered: false,
          onChainEventId: null,
          time: now,
        };

        await this.persistEvent(event);
        await this.markRuleTriggered(rule.id, now);
        triggered.push(event);

        // Trigger circuit breaker if configured
        await this.triggerCircuitBreaker(event, rule).catch((err) =>
          logger.error({ ruleId: rule.id, err }, "Circuit breaker trigger failed")
        );

        if (rule.webhookUrl) {
          await this.dispatchWebhook(rule.webhookUrl, event, rule).catch(
            (err) =>
              logger.warn({ ruleId: rule.id, err }, "Webhook dispatch failed")
          );
        }
      }
    }

    if (triggered.length > 0) {
      logger.info(
        { assetCode: snapshot.assetCode, count: triggered.length },
        "Alerts triggered"
      );
    }

    return triggered;
  }

  async batchEvaluate(snapshots: MetricSnapshot[]): Promise<AlertEvent[]> {
    const results: AlertEvent[] = [];
    for (const snapshot of snapshots) {
      const events = await this.evaluateAsset(snapshot);
      results.push(...events);
    }
    return results;
  }

  async getAlertHistory(
    assetCode: string,
    limit = 50
  ): Promise<AlertEvent[]> {
    const db = getDatabase();
    const rows = await db("alert_events")
      .where({ asset_code: assetCode })
      .orderBy("time", "desc")
      .limit(limit);
    return rows.map(this.mapEvent);
  }

  async getRecentAlerts(limit = 100): Promise<AlertEvent[]> {
    const db = getDatabase();
    const rows = await db("alert_events")
      .orderBy("time", "desc")
      .limit(limit);
    return rows.map(this.mapEvent);
  }

  async getAlertsForRule(ruleId: string, limit = 50): Promise<AlertEvent[]> {
    const db = getDatabase();
    const rows = await db("alert_events")
      .where({ rule_id: ruleId })
      .orderBy("time", "desc")
      .limit(limit);
    return rows.map(this.mapEvent);
  }

  async getAlertStats(ownerAddress: string): Promise<{
    totalRules: number;
    activeRules: number;
    totalAlerts24h: number;
    alertsByPriority: Record<AlertPriority, number>;
    alertsByType: Record<AlertType, number>;
  }> {
    const db = getDatabase();
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [rulesCount] = await db("alert_rules")
      .where({ owner_address: ownerAddress })
      .count({ total: "*", active: db.raw("CASE WHEN is_active THEN 1 END") });

    const alerts24h = await db("alert_events")
      .join("alert_rules", "alert_events.rule_id", "alert_rules.id")
      .where("alert_rules.owner_address", ownerAddress)
      .where("alert_events.time", ">=", last24h)
      .select("alert_events.priority", "alert_events.alert_type");

    const stats = {
      totalRules: parseInt(rulesCount.total as string) || 0,
      activeRules: parseInt(rulesCount.active as string) || 0,
      totalAlerts24h: alerts24h.length,
      alertsByPriority: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
      } as Record<AlertPriority, number>,
      alertsByType: {
        price_deviation: 0,
        supply_mismatch: 0,
        bridge_downtime: 0,
        health_score_drop: 0,
        volume_anomaly: 0,
        reserve_ratio_breach: 0,
      } as Record<AlertType, number>,
    };

    for (const alert of alerts24h) {
      const priority = alert.priority as AlertPriority;
      const alertType = alert.alert_type as AlertType;

      if (stats.alertsByPriority[priority] !== undefined) {
        stats.alertsByPriority[priority]++;
      }
      if (stats.alertsByType[alertType] !== undefined) {
        stats.alertsByType[alertType]++;
      }
    }

    return stats;
  }

  async dryRunAlert(
    rule: Omit<AlertRule, "id" | "isActive" | "createdAt" | "updatedAt" | "lastTriggeredAt" | "onChainRuleId">,
    metrics: Record<string, number>
  ): Promise<{ fires: boolean; event?: Omit<AlertEvent, "webhookDelivered" | "onChainEventId" | "time"> }> {
    const { fires, triggeredValue, threshold, metric, alertType } =
      this.evaluateConditions(rule as AlertRule, metrics);

    if (fires) {
      return {
        fires: true,
        event: {
          ruleId: "dry-run",
          assetCode: rule.assetCode,
          alertType,
          priority: rule.priority,
          triggeredValue,
          threshold,
          metric,
        },
      };
    }

    return { fires: false };
  }

  private evaluateConditions(
    rule: AlertRule,
    metrics: Record<string, number>
  ): {
    fires: boolean;
    triggeredValue: number;
    threshold: number;
    metric: string;
    alertType: AlertType;
  } {
    if (rule.conditions.length === 0) {
      return {
        fires: false,
        triggeredValue: 0,
        threshold: 0,
        metric: "",
        alertType: "price_deviation",
      };
    }

    let fires = rule.conditionOp === "AND";
    let firstTriggered = {
      triggeredValue: 0,
      threshold: 0,
      metric: "",
      alertType: "price_deviation" as AlertType,
      set: false,
    };

    for (const cond of rule.conditions) {
      const value = metrics[cond.metric] ?? 0;
      let result: boolean;
      switch (cond.compareOp) {
        case "gt":
          result = value > cond.threshold;
          break;
        case "lt":
          result = value < cond.threshold;
          break;
        case "eq":
          result = value === cond.threshold;
          break;
      }

      if (result && !firstTriggered.set) {
        firstTriggered = {
          triggeredValue: value,
          threshold: cond.threshold,
          metric: cond.metric,
          alertType: cond.alertType,
          set: true,
        };
      }

      fires =
        rule.conditionOp === "AND" ? fires && result : fires || result;
    }

    return {
      fires,
      triggeredValue: firstTriggered.triggeredValue,
      threshold: firstTriggered.threshold,
      metric: firstTriggered.metric,
      alertType: firstTriggered.alertType,
    };
  }

  private async persistEvent(event: AlertEvent): Promise<void> {
    const db = getDatabase();
    await db("alert_events").insert({
      time: event.time,
      rule_id: event.ruleId,
      asset_code: event.assetCode,
      alert_type: event.alertType,
      priority: event.priority,
      triggered_value: event.triggeredValue,
      threshold: event.threshold,
      metric: event.metric,
      webhook_delivered: false,
      on_chain_event_id: event.onChainEventId,
    });
    
    // Record alert metric
    const metricsService = getMetricsService();
    metricsService.alertsTriggered.inc({
      alert_type: event.alertType,
      priority: event.priority,
      bridge_id: 'unknown', // AlertEvent doesn't have bridgeId, could be extracted from metric or rule
    });
  }

  private async markRuleTriggered(ruleId: string, at: Date): Promise<void> {
    const db = getDatabase();
    await db("alert_rules")
      .where({ id: ruleId })
      .update({ last_triggered_at: at });
  }

  async dispatchWebhook(
    url: string,
    event: AlertEvent,
    rule: AlertRule
  ): Promise<void> {
    const payload = {
      ruleId: rule.id,
      ruleName: rule.name,
      assetCode: event.assetCode,
      alertType: event.alertType,
      priority: event.priority,
      metric: event.metric,
      triggeredValue: event.triggeredValue,
      threshold: event.threshold,
      timestamp: event.time.toISOString(),
    };

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });

    const db = getDatabase();
    if (response.ok) {
      await db("alert_events")
        .where({ rule_id: event.ruleId, time: event.time })
        .update({
          webhook_delivered: true,
          webhook_delivered_at: new Date(),
          webhook_attempts: db.raw("webhook_attempts + 1"),
        });
    } else {
      await db("alert_events")
        .where({ rule_id: event.ruleId, time: event.time })
        .update({ webhook_attempts: db.raw("webhook_attempts + 1") });
      throw new Error(`Webhook responded ${response.status}`);
    }
  }

  private async triggerCircuitBreaker(
    event: AlertEvent,
    _rule: AlertRule
  ): Promise<void> {
    // Map alert types to circuit breaker trigger data
    const severity = event.priority === "critical" ? "high" :
                    event.priority === "high" ? "medium" : "low";

    const triggerData: any = {
      alertId: `${event.ruleId}-${event.time.getTime()}`,
      alertType: event.alertType.replace(/_/g, "_"), // Convert to snake_case
      assetCode: event.assetCode,
      severity,
      value: event.triggeredValue,
      threshold: event.threshold,
    };

    // Add bridge ID for bridge-related alerts
    if (event.alertType.includes("supply") || event.alertType.includes("bridge")) {
      // For bridge alerts, we might need to derive bridge ID from asset or rule
      // This is a simplified version - in production, you'd have bridge mapping
      triggerData.bridgeId = `bridge-${event.assetCode}`;
    }

    await circuitBreakerQueue.add("circuit-breaker-trigger", triggerData, {
      priority: event.priority === "critical" ? 1 : 2,
      delay: 0, // Process immediately
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
    });

    logger.info({
      alertId: triggerData.alertId,
      alertType: event.alertType,
      severity
    }, "Circuit breaker trigger queued");
  }

  private mapRule(row: Record<string, unknown>): AlertRule {
    return {
      id: row.id as string,
      ownerAddress: row.owner_address as string,
      name: row.name as string,
      assetCode: row.asset_code as string,
      conditions:
        typeof row.conditions === "string"
          ? JSON.parse(row.conditions)
          : (row.conditions as AlertCondition[]),
      conditionOp: row.condition_op as ConditionOp,
      priority: row.priority as AlertPriority,
      cooldownSeconds: row.cooldown_seconds as number,
      isActive: row.is_active as boolean,
      webhookUrl: row.webhook_url as string | null,
      onChainRuleId: row.on_chain_rule_id as number | null,
      lastTriggeredAt: row.last_triggered_at
        ? new Date(row.last_triggered_at as string)
        : null,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }

  private mapEvent(row: Record<string, unknown>): AlertEvent {
    return {
      ruleId: row.rule_id as string,
      assetCode: row.asset_code as string,
      alertType: row.alert_type as AlertType,
      priority: row.priority as AlertPriority,
      triggeredValue: parseFloat(row.triggered_value as string),
      threshold: parseFloat(row.threshold as string),
      metric: row.metric as string,
      webhookDelivered: row.webhook_delivered as boolean,
      onChainEventId: row.on_chain_event_id as number | null,
      time: new Date(row.time as string),
    };
  }
}
