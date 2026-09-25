import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";

export type FailureMode =
  | "timeout"
  | "error"
  | "latency"
  | "partial_failure"
  | "connection_refused";

export type SimulatorRunStatus =
  | "pending"
  | "running"
  | "completed"
  | "cancelled"
  | "failed";

export interface FailureScenario {
  id: string;
  name: string;
  description: string | null;
  targetService: string;
  failureMode: FailureMode;
  latencyMs: number | null;
  errorRate: number | null;
  timeoutMs: number | null;
  errorMessage: string | null;
  enabled: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SimulatorRun {
  id: string;
  scenarioId: string;
  status: SimulatorRunStatus;
  triggeredBy: string | null;
  trigger: string;
  durationMs: number | null;
  requestsInjected: number;
  requestsSucceeded: number;
  requestsFailed: number;
  observations: Record<string, unknown>;
  cancellationReason: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface SimulatorEvent {
  id: string;
  runId: string;
  eventType: string;
  payload: Record<string, unknown>;
  occurredAt: string;
}

export interface CreateScenarioInput {
  name: string;
  description?: string | null;
  targetService: string;
  failureMode: FailureMode;
  latencyMs?: number | null;
  errorRate?: number | null;
  timeoutMs?: number | null;
  errorMessage?: string | null;
  createdBy?: string | null;
}

export interface UpdateScenarioInput {
  name?: string;
  description?: string | null;
  targetService?: string;
  failureMode?: FailureMode;
  latencyMs?: number | null;
  errorRate?: number | null;
  timeoutMs?: number | null;
  errorMessage?: string | null;
  enabled?: boolean;
}

export interface StartRunInput {
  triggeredBy?: string | null;
  trigger?: string;
  durationMs?: number | null;
}

const VALID_FAILURE_MODES: ReadonlySet<string> = new Set([
  "timeout",
  "error",
  "latency",
  "partial_failure",
  "connection_refused",
]);

export class FailureSimulatorService {
  private readonly db = getDatabase();

  // Scenarios

  async listScenarios(options: {
    targetService?: string;
    enabledOnly?: boolean;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ scenarios: FailureScenario[]; total: number }> {
    let query = this.db("failure_simulator_scenarios")
      .whereNull("deleted_at");

    if (options.targetService) {
      query = query.where("target_service", options.targetService);
    }
    if (options.enabledOnly) {
      query = query.where("enabled", true);
    }

    const [{ count }] = await query.clone().count("id as count");
    const total = Number(count);

    const rows = await query
      .orderBy("created_at", "desc")
      .limit(options.limit ?? 50)
      .offset(options.offset ?? 0);

    return { scenarios: rows.map((row) => this.mapScenario(row)), total };
  }

  async getScenario(id: string): Promise<FailureScenario | null> {
    const row = await this.db("failure_simulator_scenarios")
      .where({ id })
      .whereNull("deleted_at")
      .first();
    return row ? this.mapScenario(row) : null;
  }

  async createScenario(input: CreateScenarioInput): Promise<FailureScenario> {
    this.validateFailureMode(input.failureMode);
    this.validateScenarioParams(input);

    const [row] = await this.db("failure_simulator_scenarios")
      .insert({
        name: input.name,
        description: input.description ?? null,
        target_service: input.targetService,
        failure_mode: input.failureMode,
        latency_ms: input.latencyMs ?? null,
        error_rate: input.errorRate ?? null,
        timeout_ms: input.timeoutMs ?? null,
        error_message: input.errorMessage ?? null,
        enabled: false,
        created_by: input.createdBy ?? null,
      })
      .returning("*");

    logger.info({ scenarioId: row.id, name: input.name }, "Failure scenario created");
    return this.mapScenario(row);
  }

  async updateScenario(
    id: string,
    input: UpdateScenarioInput
  ): Promise<FailureScenario | null> {
    if (input.failureMode) {
      this.validateFailureMode(input.failureMode);
    }

    const updates: Record<string, unknown> = { updated_at: new Date() };
    if (input.name !== undefined) updates.name = input.name;
    if (input.description !== undefined) updates.description = input.description;
    if (input.targetService !== undefined) updates.target_service = input.targetService;
    if (input.failureMode !== undefined) updates.failure_mode = input.failureMode;
    if (input.latencyMs !== undefined) updates.latency_ms = input.latencyMs;
    if (input.errorRate !== undefined) updates.error_rate = input.errorRate;
    if (input.timeoutMs !== undefined) updates.timeout_ms = input.timeoutMs;
    if (input.errorMessage !== undefined) updates.error_message = input.errorMessage;
    if (input.enabled !== undefined) updates.enabled = input.enabled;

    const [row] = await this.db("failure_simulator_scenarios")
      .where({ id })
      .whereNull("deleted_at")
      .update(updates)
      .returning("*");

    return row ? this.mapScenario(row) : null;
  }

  async deleteScenario(id: string): Promise<boolean> {
    const affected = await this.db("failure_simulator_scenarios")
      .where({ id })
      .whereNull("deleted_at")
      .update({ deleted_at: new Date(), updated_at: new Date() });
    return affected > 0;
  }

  async setEnabled(id: string, enabled: boolean): Promise<FailureScenario | null> {
    const [row] = await this.db("failure_simulator_scenarios")
      .where({ id })
      .whereNull("deleted_at")
      .update({ enabled, updated_at: new Date() })
      .returning("*");
    return row ? this.mapScenario(row) : null;
  }

  // Runs

  async listRuns(options: {
    scenarioId?: string;
    status?: SimulatorRunStatus;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ runs: SimulatorRun[]; total: number }> {
    let query = this.db("failure_simulator_runs");

    if (options.scenarioId) {
      query = query.where("scenario_id", options.scenarioId);
    }
    if (options.status) {
      query = query.where("status", options.status);
    }

    const [{ count }] = await query.clone().count("id as count");
    const total = Number(count);

    const rows = await query
      .orderBy("created_at", "desc")
      .limit(options.limit ?? 50)
      .offset(options.offset ?? 0);

    return { runs: rows.map((row) => this.mapRun(row)), total };
  }

  async getRun(id: string): Promise<SimulatorRun | null> {
    const row = await this.db("failure_simulator_runs").where({ id }).first();
    return row ? this.mapRun(row) : null;
  }

  async startRun(
    scenarioId: string,
    input: StartRunInput = {}
  ): Promise<SimulatorRun | null> {
    const scenario = await this.getScenario(scenarioId);
    if (!scenario) {
      return null;
    }

    const now = new Date();

    return this.db.transaction(async (trx) => {
      const [run] = await trx("failure_simulator_runs")
        .insert({
          scenario_id: scenarioId,
          status: "running",
          triggered_by: input.triggeredBy ?? null,
          trigger: input.trigger ?? "manual",
          duration_ms: input.durationMs ?? null,
          started_at: now,
        })
        .returning("*");

      await trx("failure_simulator_events").insert({
        run_id: run.id,
        event_type: "started",
        payload: JSON.stringify({
          scenarioId,
          targetService: scenario.targetService,
          failureMode: scenario.failureMode,
          triggeredBy: input.triggeredBy ?? null,
        }),
        occurred_at: now,
      });

      logger.info(
        { runId: run.id, scenarioId, failureMode: scenario.failureMode },
        "Failure simulation run started"
      );

      return this.mapRun(run);
    });
  }

  async recordInjection(
    runId: string,
    result: { succeeded: boolean; latencyMs?: number; error?: string }
  ): Promise<void> {
    await this.db.transaction(async (trx) => {
      const run = await trx("failure_simulator_runs").where({ id: runId }).first();
      if (!run || run.status !== "running") {
        return;
      }

      await trx("failure_simulator_runs")
        .where({ id: runId })
        .update({
          requests_injected: run.requests_injected + 1,
          requests_succeeded: result.succeeded
            ? run.requests_succeeded + 1
            : run.requests_succeeded,
          requests_failed: !result.succeeded
            ? run.requests_failed + 1
            : run.requests_failed,
        });

      await trx("failure_simulator_events").insert({
        run_id: runId,
        event_type: "injected",
        payload: JSON.stringify({
          succeeded: result.succeeded,
          latencyMs: result.latencyMs ?? null,
          error: result.error ?? null,
        }),
      });
    });
  }

  async completeRun(
    runId: string,
    observations: Record<string, unknown> = {}
  ): Promise<SimulatorRun | null> {
    const now = new Date();

    return this.db.transaction(async (trx) => {
      const [run] = await trx("failure_simulator_runs")
        .where({ id: runId, status: "running" })
        .update({
          status: "completed",
          completed_at: now,
          observations: JSON.stringify(observations),
        })
        .returning("*");

      if (!run) {
        return null;
      }

      await trx("failure_simulator_events").insert({
        run_id: runId,
        event_type: "completed",
        payload: JSON.stringify({ observations }),
        occurred_at: now,
      });

      logger.info({ runId }, "Failure simulation run completed");
      return this.mapRun(run);
    });
  }

  async cancelRun(runId: string, reason?: string): Promise<SimulatorRun | null> {
    const now = new Date();

    return this.db.transaction(async (trx) => {
      const [run] = await trx("failure_simulator_runs")
        .where({ id: runId })
        .whereIn("status", ["pending", "running"])
        .update({
          status: "cancelled",
          completed_at: now,
          cancellation_reason: reason ?? null,
        })
        .returning("*");

      if (!run) {
        return null;
      }

      await trx("failure_simulator_events").insert({
        run_id: runId,
        event_type: "cancelled",
        payload: JSON.stringify({ reason: reason ?? null }),
        occurred_at: now,
      });

      logger.info({ runId, reason }, "Failure simulation run cancelled");
      return this.mapRun(run);
    });
  }

  async getRunEvents(runId: string, limit = 100): Promise<SimulatorEvent[]> {
    const rows = await this.db("failure_simulator_events")
      .where({ run_id: runId })
      .orderBy("occurred_at", "asc")
      .limit(limit);
    return rows.map((row) => this.mapEvent(row));
  }

  // Private helpers

  private validateFailureMode(mode: string): void {
    if (!VALID_FAILURE_MODES.has(mode)) {
      throw new Error(`Invalid failure mode: ${mode}`);
    }
  }

  private validateScenarioParams(input: CreateScenarioInput): void {
    if (input.failureMode === "latency" && !input.latencyMs) {
      throw new Error("latencyMs is required for failure_mode=latency");
    }
    if (input.failureMode === "partial_failure") {
      if (input.errorRate === null || input.errorRate === undefined) {
        throw new Error("errorRate is required for failure_mode=partial_failure");
      }
      if (input.errorRate < 0 || input.errorRate > 1) {
        throw new Error("errorRate must be between 0.0 and 1.0");
      }
    }
    if (input.failureMode === "timeout" && !input.timeoutMs) {
      throw new Error("timeoutMs is required for failure_mode=timeout");
    }
  }

  private mapScenario(row: Record<string, unknown>): FailureScenario {
    return {
      id: String(row.id),
      name: String(row.name),
      description: row.description ? String(row.description) : null,
      targetService: String(row.target_service),
      failureMode: String(row.failure_mode) as FailureMode,
      latencyMs: row.latency_ms !== null && row.latency_ms !== undefined
        ? Number(row.latency_ms)
        : null,
      errorRate: row.error_rate !== null && row.error_rate !== undefined
        ? Number(row.error_rate)
        : null,
      timeoutMs: row.timeout_ms !== null && row.timeout_ms !== undefined
        ? Number(row.timeout_ms)
        : null,
      errorMessage: row.error_message ? String(row.error_message) : null,
      enabled: Boolean(row.enabled),
      createdBy: row.created_by ? String(row.created_by) : null,
      createdAt: new Date(String(row.created_at)).toISOString(),
      updatedAt: new Date(String(row.updated_at)).toISOString(),
    };
  }

  private mapRun(row: Record<string, unknown>): SimulatorRun {
    const observations =
      typeof row.observations === "string"
        ? (JSON.parse(row.observations) as Record<string, unknown>)
        : ((row.observations as Record<string, unknown>) ?? {});

    return {
      id: String(row.id),
      scenarioId: String(row.scenario_id),
      status: String(row.status) as SimulatorRunStatus,
      triggeredBy: row.triggered_by ? String(row.triggered_by) : null,
      trigger: String(row.trigger),
      durationMs: row.duration_ms !== null && row.duration_ms !== undefined
        ? Number(row.duration_ms)
        : null,
      requestsInjected: Number(row.requests_injected ?? 0),
      requestsSucceeded: Number(row.requests_succeeded ?? 0),
      requestsFailed: Number(row.requests_failed ?? 0),
      observations,
      cancellationReason: row.cancellation_reason
        ? String(row.cancellation_reason)
        : null,
      startedAt: row.started_at
        ? new Date(String(row.started_at)).toISOString()
        : null,
      completedAt: row.completed_at
        ? new Date(String(row.completed_at)).toISOString()
        : null,
      createdAt: new Date(String(row.created_at)).toISOString(),
    };
  }

  private mapEvent(row: Record<string, unknown>): SimulatorEvent {
    const payload =
      typeof row.payload === "string"
        ? (JSON.parse(row.payload) as Record<string, unknown>)
        : ((row.payload as Record<string, unknown>) ?? {});

    return {
      id: String(row.id),
      runId: String(row.run_id),
      eventType: String(row.event_type),
      payload,
      occurredAt: new Date(String(row.occurred_at)).toISOString(),
    };
  }
}
