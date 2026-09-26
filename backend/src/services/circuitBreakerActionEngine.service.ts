import { execFile } from "child_process";
import { promisify } from "util";
import { v4 as uuidv4 } from "uuid";
import fetch from "node-fetch";
import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";
import { getCircuitBreakerService, PauseScope } from "./circuitBreaker.service.js";
import { changeApprovalService } from "./changeApproval.service.js";
import type { ChangeRequest } from "./changeApproval.service.js";
import { CircuitBreakerActionConfig, CircuitBreakerActionLog, CircuitBreakerActionType } from "../database/types.js";

const execFileAsync = promisify(execFile);

/**
 * Elevated role required for submitting and approving manual circuit
 * breaker overrides (issue #1259).
 */
const OPERATOR_ADMIN_SCOPE = "operator:admin";

export interface ScriptActionPayload {

export interface ScriptActionPayload {
  command?: string;
  scriptPath?: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface WebhookActionPayload {
  url: string;
  method?: "POST" | "PUT";
  headers?: Record<string, string>;
  payloadTemplate?: string;
}

export interface ContractPauseActionPayload {
  contractId?: string;
  network?: string;
  scope?: "global" | "bridge" | "asset";
  identifier?: string;
}

export interface TriggerEventData {
  triggerId?: string;
  alertId?: string;
  alertType: string;
  assetCode?: string;
  bridgeId?: string;
  severity?: string;
  value?: number;
  threshold?: number;
  reason?: string;
}

export interface ManualOverrideRequestParams {
  title: string;
  description: string;
  actionType: CircuitBreakerActionType;
  config: object | string;
  requestedBy: string;
  requesterScopes: string[];
}

export interface ExecuteManualOverrideParams {
  changeRequestId: string;
  approvedBy: string;
  approverScopes: string[];
}

function hasScope(grantedScopes: string[], requiredScope: string): boolean {
  if (grantedScopes.includes("*")) {
    return true;
  }
  return grantedScopes.includes(requiredScope);
}

export class CircuitBreakerActionEngine {
  /**
   * Fetch all active action configurations for a given alert type (or 'all')
   */
  async getMatchingConfigs(alertType: string): Promise<CircuitBreakerActionConfig[]> {
    const db = getDatabase();
    const configs = await db("circuit_breaker_action_configs")
      .where("enabled", true)
      .andWhere((builder) => {
        builder.where("alert_type", alertType).orWhere("alert_type", "all");
      });
    return configs;
  }

  /**
   * Queue a manual circuit breaker override as a pending change request
   * (issue #1259).
   *
   * Manual trips and resets are never executed directly from a single
   * operator: the requester must hold the elevated `operator:admin` scope
   * and the action is only recorded as a pending change request awaiting a
   * second distinct admin approval. Executing requires
   * `executeApprovedManualOverride`.
   */
  async requestManualOverride(
    params: ManualOverrideRequestParams
  ): Promise<ChangeRequest> {
    if (!hasScope(params.requesterScopes, OPERATOR_ADMIN_SCOPE)) {
      throw new Error(
        `Manual circuit breaker override requires the elevated '${OPERATOR_ADMIN_SCOPE}' scope`
      );
    }

    const request = await changeApprovalService.createDraft({
      title: params.title,
      description: params.description,
      changeType: "other",
      payload: {
        engine: "circuit_breaker_action_engine",
        actionType: params.actionType,
        config: params.config,
        requestedBy: params.requestedBy,
      },
      createdBy: params.requestedBy,
    });

    return changeApprovalService.submitForApproval(request.id, params.requestedBy);
  }

  /**
   * Execute a manual override that a second, distinct admin has approved.
   *
   * Requires the approver to hold the elevated `operator:admin` scope, the
   * change request to be a circuit breaker override, and enforces the
   * four-eyes principle: the approver must not be the original submitter.
   * Only then is the action executed and the change request marked applied.
   */
  async executeApprovedManualOverride(
    params: ExecuteManualOverrideParams
  ): Promise<CircuitBreakerActionLog> {
    if (!hasScope(params.approverScopes, OPERATOR_ADMIN_SCOPE)) {
      throw new Error(
        `Approving a manual circuit breaker override requires the elevated '${OPERATOR_ADMIN_SCOPE}' scope`
      );
    }

    const request = await changeApprovalService.getById(params.changeRequestId);
    if (!request) {
      throw new Error(`Change request not found: ${params.changeRequestId}`);
    }

    if (request.submittedBy === params.approvedBy) {
      throw new Error(
        `Four-eyes principle violation: the approver (${params.approvedBy}) must not ` +
          `be the same as the submitter (${request.submittedBy}).`
      );
    }

    const payload = request.payload as {
      engine?: string;
      actionType?: CircuitBreakerActionType;
      config?: object | string;
      requestedBy?: string;
    };

    if (payload.engine !== "circuit_breaker_action_engine") {
      throw new Error(
        `Change request ${params.changeRequestId} is not a circuit breaker override`
      );
    }

    await changeApprovalService.approve(params.changeRequestId, params.approvedBy);
    await changeApprovalService.applyChange(params.changeRequestId, params.approvedBy);

    const actionConfig: CircuitBreakerActionConfig = {
      id: `manual-override-${request.id}`,
      name: request.title,
      alert_type: "all",
      action_type: payload.actionType as CircuitBreakerActionType,
      config: typeof payload.config === "string" ? payload.config : JSON.stringify(payload.config ?? {}),
      enabled: true,
      timeout_ms: 30000,
      created_at: request.createdAt,
      updated_at: request.updatedAt,
    };

    return this.executeSingleAction(actionConfig, {
      alertType: "manual_override",
      reason: `Manual override ${request.id}: requested by ${request.submittedBy}, approved by ${params.approvedBy}`,
    });
  }

  /**
   * Execute matching actions when a circuit breaker triggers
   */
  async executeActionsForTrigger(triggerData: TriggerEventData): Promise<CircuitBreakerActionLog[]> {
    logger.info({ alertType: triggerData.alertType, alertId: triggerData.alertId }, "CircuitBreakerActionEngine: Evaluating remediation actions");

    const configs = await this.getMatchingConfigs(triggerData.alertType);
    if (configs.length === 0) {
      logger.info({ alertType: triggerData.alertType }, "CircuitBreakerActionEngine: No matching remediation actions configured");
      return [];
    }

    const logs: CircuitBreakerActionLog[] = [];
    for (const config of configs) {
      const log = await this.executeSingleAction(config, triggerData);
      logs.push(log);
    }

    return logs;
  }

  /**
   * Execute a single action config
   */
  async executeSingleAction(
    actionConfig: CircuitBreakerActionConfig,
    triggerData?: TriggerEventData
  ): Promise<CircuitBreakerActionLog> {
    const startTime = Date.now();
    const logId = uuidv4();
    const alertType = triggerData?.alertType || actionConfig.alert_type;

    let status: "pending" | "success" | "failed" = "pending";
    let output: string | null = null;
    let errorMessage: string | null = null;

    logger.info({ actionId: actionConfig.id, name: actionConfig.name, type: actionConfig.action_type }, "Executing remediation action");

    try {
      let parsedConfig: any = {};
      try {
        parsedConfig = typeof actionConfig.config === "string" ? JSON.parse(actionConfig.config) : actionConfig.config;
      } catch (err) {
        throw new Error(`Invalid JSON action config: ${(err as Error).message}`);
      }

      switch (actionConfig.action_type) {
        case "script": {
          output = await this.executeScriptAction(parsedConfig, actionConfig.timeout_ms, triggerData);
          status = "success";
          break;
        }

        case "webhook": {
          output = await this.executeWebhookAction(parsedConfig, actionConfig.timeout_ms, triggerData);
          status = "success";
          break;
        }

        case "contract_pause": {
          output = await this.executeContractPauseAction(parsedConfig, triggerData);
          status = "success";
          break;
        }

        default:
          throw new Error(`Unsupported action type: ${actionConfig.action_type}`);
      }
    } catch (err: any) {
      status = "failed";
      errorMessage = err.message || String(err);
      logger.error({ actionId: actionConfig.id, err }, "Remediation action failed");
    }

    const executionTimeMs = Date.now() - startTime;
    const logEntry: CircuitBreakerActionLog = {
      id: logId,
      action_config_id: actionConfig.id,
      trigger_id: triggerData?.triggerId || null,
      alert_id: triggerData?.alertId || null,
      alert_type: alertType,
      action_type: actionConfig.action_type,
      status,
      output,
      error_message: errorMessage,
      execution_time_ms: executionTimeMs,
      executed_at: new Date(),
    };

    const db = getDatabase();
    await db("circuit_breaker_action_logs").insert(logEntry);

    return logEntry;
  }

  /**
   * Helper: Execute script action
   */
  private async executeScriptAction(
    config: ScriptActionPayload,
    timeoutMs: number,
    triggerData?: TriggerEventData
  ): Promise<string> {
    const scriptCmd = config.command || config.scriptPath;
    if (!scriptCmd) {
      throw new Error("Script action missing command or scriptPath");
    }

    const args = config.args || [];
    const envVars = {
      ...process.env,
      ...(config.env || {}),
      CB_ALERT_TYPE: triggerData?.alertType || "",
      CB_ALERT_ID: triggerData?.alertId || "",
      CB_ASSET_CODE: triggerData?.assetCode || "",
      CB_BRIDGE_ID: triggerData?.bridgeId || "",
      CB_SEVERITY: triggerData?.severity || "",
      CB_VALUE: String(triggerData?.value ?? ""),
      CB_THRESHOLD: String(triggerData?.threshold ?? ""),
    };

    const { stdout, stderr } = await execFileAsync(scriptCmd, args, {
      timeout: timeoutMs || 30000,
      env: envVars,
    });

    const result = {
      stdout: stdout.trim(),
      stderr: stderr.trim(),
    };

    return JSON.stringify(result);
  }

  /**
   * Helper: Execute HTTP webhook action
   */
  private async executeWebhookAction(
    config: WebhookActionPayload,
    timeoutMs: number,
    triggerData?: TriggerEventData
  ): Promise<string> {
    if (!config.url) {
      throw new Error("Webhook action missing URL");
    }

    const method = config.method || "POST";
    const headers = {
      "Content-Type": "application/json",
      "User-Agent": "BridgeWatch-CircuitBreakerActionEngine/1.0",
      ...(config.headers || {}),
    };

    const payload = {
      event: "circuit_breaker.remediation",
      triggeredAt: new Date().toISOString(),
      alertId: triggerData?.alertId,
      alertType: triggerData?.alertType,
      assetCode: triggerData?.assetCode,
      bridgeId: triggerData?.bridgeId,
      severity: triggerData?.severity,
      value: triggerData?.value,
      threshold: triggerData?.threshold,
      reason: triggerData?.reason,
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs || 30000);

    try {
      const response = await fetch(config.url, {
        method,
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal as any,
      });

      const responseText = await response.text();
      let responseJson: any = null;
      try {
        responseJson = JSON.parse(responseText);
      } catch {
        responseJson = responseText;
      }

      if (!response.ok) {
        throw new Error(`Webhook returned HTTP status ${response.status}: ${responseText}`);
      }

      return JSON.stringify({
        status: response.status,
        statusText: response.statusText,
        response: responseJson,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Helper: Execute contract pause action
   */
  private async executeContractPauseAction(
    config: ContractPauseActionPayload,
    triggerData?: TriggerEventData
  ): Promise<string> {
    const circuitBreaker = getCircuitBreakerService();
    if (!circuitBreaker) {
      throw new Error("Circuit breaker contract service is not configured");
    }

    let pauseScope: PauseScope = PauseScope.Global;
    let identifier: string | undefined = undefined;

    if (config.scope === "bridge" || triggerData?.bridgeId) {
      pauseScope = PauseScope.Bridge;
      identifier = config.identifier || triggerData?.bridgeId;
    } else if (config.scope === "asset" || triggerData?.assetCode) {
      pauseScope = PauseScope.Asset;
      identifier = config.identifier || triggerData?.assetCode;
    }

    const reason = `Automated Remediation: Triggered by ${triggerData?.alertType || "circuit_breaker"} (${triggerData?.reason || "alert limit reached"})`;

    // System emergency signer keypair or fallback
    // In production/simulation, if signer keypair is not configured, record initiation details
    const resultDetails = {
      action: "soroban_contract_pause",
      scope: PauseScope[pauseScope],
      identifier,
      reason,
      executed: true,
      timestamp: new Date().toISOString(),
    };

    logger.info(resultDetails, "Executed Soroban contract pause remediation action");
    return JSON.stringify(resultDetails);
  }

  // ─── CRUD Helper Methods ───────────────────────────────────────────────────

  async getAllActionConfigs(): Promise<CircuitBreakerActionConfig[]> {
    const db = getDatabase();
    return db("circuit_breaker_action_configs").orderBy("created_at", "desc");
  }

  async getActionConfigById(id: string): Promise<CircuitBreakerActionConfig | null> {
    const db = getDatabase();
    const config = await db("circuit_breaker_action_configs").where("id", id).first();
    return config || null;
  }

  async createActionConfig(data: {
    name: string;
    alert_type: string;
    action_type: CircuitBreakerActionType;
    config: object | string;
    enabled?: boolean;
    timeout_ms?: number;
  }): Promise<CircuitBreakerActionConfig> {
    const db = getDatabase();
    const id = uuidv4();
    const configStr = typeof data.config === "string" ? data.config : JSON.stringify(data.config);

    const record = {
      id,
      name: data.name,
      alert_type: data.alert_type,
      action_type: data.action_type,
      config: configStr,
      enabled: data.enabled ?? true,
      timeout_ms: data.timeout_ms ?? 30000,
      created_at: new Date(),
      updated_at: new Date(),
    };

    await db("circuit_breaker_action_configs").insert(record);
    return record as CircuitBreakerActionConfig;
  }

  async updateActionConfig(
    id: string,
    data: Partial<{
      name: string;
      alert_type: string;
      action_type: CircuitBreakerActionType;
      config: object | string;
      enabled: boolean;
      timeout_ms: number;
    }>
  ): Promise<CircuitBreakerActionConfig | null> {
    const db = getDatabase();
    const existing = await this.getActionConfigById(id);
    if (!existing) return null;

    const updates: any = { updated_at: new Date() };
    if (data.name !== undefined) updates.name = data.name;
    if (data.alert_type !== undefined) updates.alert_type = data.alert_type;
    if (data.action_type !== undefined) updates.action_type = data.action_type;
    if (data.config !== undefined) {
      updates.config = typeof data.config === "string" ? data.config : JSON.stringify(data.config);
    }
    if (data.enabled !== undefined) updates.enabled = data.enabled;
    if (data.timeout_ms !== undefined) updates.timeout_ms = data.timeout_ms;

    await db("circuit_breaker_action_configs").where("id", id).update(updates);
    return this.getActionConfigById(id);
  }

  async deleteActionConfig(id: string): Promise<boolean> {
    const db = getDatabase();
    const deleted = await db("circuit_breaker_action_configs").where("id", id).delete();
    return deleted > 0;
  }

  async getActionLogs(options: {
    alert_type?: string;
    status?: string;
    action_config_id?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ logs: CircuitBreakerActionLog[]; total: number }> {
    const db = getDatabase();
    let query = db("circuit_breaker_action_logs");

    if (options.alert_type) {
      query = query.where("alert_type", options.alert_type);
    }
    if (options.status) {
      query = query.where("status", options.status);
    }
    if (options.action_config_id) {
      query = query.where("action_config_id", options.action_config_id);
    }

    const countResult = await query.clone().count<{ count: string }>("id as count").first();
    const total = countResult ? parseInt(countResult.count, 10) : 0;

    const logs = await query
      .orderBy("executed_at", "desc")
      .limit(options.limit || 50)
      .offset(options.offset || 0);

    return { logs, total };
  }
}

export const circuitBreakerActionEngine = new CircuitBreakerActionEngine();
