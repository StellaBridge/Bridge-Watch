/**
 * #1207 — OpenAPI Client Generation Workflow
 *
 * Service layer for managing generation configs and job lifecycle.
 * All database mutations emit an event record for observability.
 */
import { getDatabase } from '../database/connection.js';
import { logger } from '../utils/logger.js';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';

// =============================================================================
// TYPES
// =============================================================================

export type GenerationTrigger = 'manual' | 'ci' | 'schedule' | 'webhook';
export type GenerationStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface OpenApiClientConfig {
  id: string;
  name: string;
  language: string;
  generator: string;
  generatorVersion: string | null;
  generatorOptions: Record<string, unknown>;
  outputPath: string;
  openapiSource: string;
  enabled: boolean;
  autoCommit: boolean;
  autoPublish: boolean;
  publishRegistry: string | null;
  publishPackageName: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateConfigInput {
  name: string;
  language: string;
  generator?: string;
  generatorVersion?: string | null;
  generatorOptions?: Record<string, unknown>;
  outputPath: string;
  openapiSource?: string;
  enabled?: boolean;
  autoCommit?: boolean;
  autoPublish?: boolean;
  publishRegistry?: string | null;
  publishPackageName?: string | null;
  createdBy?: string | null;
}

export interface UpdateConfigInput {
  name?: string;
  language?: string;
  generator?: string;
  generatorVersion?: string | null;
  generatorOptions?: Record<string, unknown>;
  outputPath?: string;
  openapiSource?: string;
  enabled?: boolean;
  autoCommit?: boolean;
  autoPublish?: boolean;
  publishRegistry?: string | null;
  publishPackageName?: string | null;
}

export interface GenerationJob {
  id: string;
  configId: string;
  status: GenerationStatus;
  trigger: GenerationTrigger;
  triggeredBy: string | null;
  gitRef: string | null;
  openapiSpecSha: string | null;
  generatorVersionResolved: string | null;
  outputLog: string | null;
  errorMessage: string | null;
  artifactUrls: string[];
  diffSummary: Record<string, unknown>;
  committed: boolean;
  published: boolean;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface GenerationEvent {
  id: string;
  jobId: string;
  eventType: string;
  payload: Record<string, unknown>;
  occurredAt: string;
}

export interface EnqueueJobInput {
  configId: string;
  trigger?: GenerationTrigger;
  triggeredBy?: string | null;
  gitRef?: string | null;
}

interface Row {
  [key: string]: unknown;
}

// =============================================================================
// HELPERS
// =============================================================================

function mapConfigRow(row: Row): OpenApiClientConfig {
  return {
    id: row['id'] as string,
    name: row['name'] as string,
    language: row['language'] as string,
    generator: row['generator'] as string,
    generatorVersion: (row['generator_version'] as string | null) ?? null,
    generatorOptions:
      typeof row['generator_options'] === 'string'
        ? JSON.parse(row['generator_options'] as string)
        : (row['generator_options'] as Record<string, unknown>) ?? {},
    outputPath: row['output_path'] as string,
    openapiSource: row['openapi_source'] as string,
    enabled: Boolean(row['enabled']),
    autoCommit: Boolean(row['auto_commit']),
    autoPublish: Boolean(row['auto_publish']),
    publishRegistry: (row['publish_registry'] as string | null) ?? null,
    publishPackageName: (row['publish_package_name'] as string | null) ?? null,
    createdBy: (row['created_by'] as string | null) ?? null,
    createdAt: String(row['created_at']),
    updatedAt: String(row['updated_at']),
  };
}

function mapJobRow(row: Row): GenerationJob {
  return {
    id: row['id'] as string,
    configId: row['config_id'] as string,
    status: row['status'] as GenerationStatus,
    trigger: (row['trigger'] as GenerationTrigger) ?? 'manual',
    triggeredBy: (row['triggered_by'] as string | null) ?? null,
    gitRef: (row['git_ref'] as string | null) ?? null,
    openapiSpecSha: (row['openapi_spec_sha'] as string | null) ?? null,
    generatorVersionResolved: (row['generator_version_resolved'] as string | null) ?? null,
    outputLog: (row['output_log'] as string | null) ?? null,
    errorMessage: (row['error_message'] as string | null) ?? null,
    artifactUrls:
      typeof row['artifact_urls'] === 'string'
        ? JSON.parse(row['artifact_urls'] as string)
        : (row['artifact_urls'] as string[]) ?? [],
    diffSummary:
      typeof row['diff_summary'] === 'string'
        ? JSON.parse(row['diff_summary'] as string)
        : (row['diff_summary'] as Record<string, unknown>) ?? {},
    committed: Boolean(row['committed']),
    published: Boolean(row['published']),
    startedAt: (row['started_at'] as string | null) ?? null,
    completedAt: (row['completed_at'] as string | null) ?? null,
    createdAt: String(row['created_at']),
  };
}

function computeSpecSha(specPath: string): string | null {
  try {
    const content = readFileSync(specPath);
    return crypto.createHash('sha256').update(content).digest('hex');
  } catch {
    return null;
  }
}

// =============================================================================
// SERVICE CLASS
// =============================================================================

export class OpenApiClientGenerationService {
  // ─── Config CRUD ────────────────────────────────────────────────────────────

  async listConfigs(includeDisabled = false): Promise<OpenApiClientConfig[]> {
    const db = getDatabase();
    const rows = (await db('openapi_client_configs')
      .whereNull('deleted_at')
      .modify((qb) => {
        if (!includeDisabled) qb.where('enabled', true);
      })
      .orderBy('name')) as Row[];
    return rows.map(mapConfigRow);
  }

  async getConfig(id: string): Promise<OpenApiClientConfig | null> {
    const db = getDatabase();
    const row = (await db('openapi_client_configs')
      .where({ id })
      .whereNull('deleted_at')
      .first()) as Row | undefined;
    return row ? mapConfigRow(row) : null;
  }

  async getConfigByName(name: string): Promise<OpenApiClientConfig | null> {
    const db = getDatabase();
    const row = (await db('openapi_client_configs')
      .where({ name })
      .whereNull('deleted_at')
      .first()) as Row | undefined;
    return row ? mapConfigRow(row) : null;
  }

  async createConfig(input: CreateConfigInput): Promise<OpenApiClientConfig> {
    const db = getDatabase();
    const [row] = (await db('openapi_client_configs')
      .insert({
        name: input.name.trim(),
        language: input.language.trim().toLowerCase(),
        generator: input.generator ?? 'openapi-generator-cli',
        generator_version: input.generatorVersion ?? null,
        generator_options: JSON.stringify(input.generatorOptions ?? {}),
        output_path: input.outputPath.trim(),
        openapi_source: input.openapiSource ?? 'backend/docs/openapi.json',
        enabled: input.enabled ?? true,
        auto_commit: input.autoCommit ?? false,
        auto_publish: input.autoPublish ?? false,
        publish_registry: input.publishRegistry ?? null,
        publish_package_name: input.publishPackageName ?? null,
        created_by: input.createdBy ?? null,
      })
      .returning('*')) as Row[];
    logger.info({ configId: row['id'], name: input.name }, 'openapi_client_config.created');
    return mapConfigRow(row);
  }

  async updateConfig(id: string, input: UpdateConfigInput): Promise<OpenApiClientConfig | null> {
    const db = getDatabase();
    const patch: Record<string, unknown> = { updated_at: new Date() };
    if (input.name !== undefined) patch['name'] = input.name.trim();
    if (input.language !== undefined) patch['language'] = input.language.trim().toLowerCase();
    if (input.generator !== undefined) patch['generator'] = input.generator;
    if (input.generatorVersion !== undefined) patch['generator_version'] = input.generatorVersion;
    if (input.generatorOptions !== undefined) patch['generator_options'] = JSON.stringify(input.generatorOptions);
    if (input.outputPath !== undefined) patch['output_path'] = input.outputPath.trim();
    if (input.openapiSource !== undefined) patch['openapi_source'] = input.openapiSource;
    if (input.enabled !== undefined) patch['enabled'] = input.enabled;
    if (input.autoCommit !== undefined) patch['auto_commit'] = input.autoCommit;
    if (input.autoPublish !== undefined) patch['auto_publish'] = input.autoPublish;
    if (input.publishRegistry !== undefined) patch['publish_registry'] = input.publishRegistry;
    if (input.publishPackageName !== undefined) patch['publish_package_name'] = input.publishPackageName;

    const [row] = (await db('openapi_client_configs')
      .where({ id })
      .whereNull('deleted_at')
      .update(patch)
      .returning('*')) as Row[];
    if (!row) return null;
    logger.info({ configId: id }, 'openapi_client_config.updated');
    return mapConfigRow(row);
  }

  async deleteConfig(id: string): Promise<boolean> {
    const db = getDatabase();
    const affected = await db('openapi_client_configs')
      .where({ id })
      .whereNull('deleted_at')
      .update({ deleted_at: new Date() });
    if (affected > 0) logger.info({ configId: id }, 'openapi_client_config.soft_deleted');
    return affected > 0;
  }

  // ─── Job lifecycle ───────────────────────────────────────────────────────────

  async enqueueJob(input: EnqueueJobInput): Promise<GenerationJob> {
    const db = getDatabase();
    const config = await this.getConfig(input.configId);
    if (!config) throw new Error(`Config ${input.configId} not found or disabled`);
    if (!config.enabled) throw new Error(`Config "${config.name}" is disabled`);

    const specSha = computeSpecSha(config.openapiSource);

    const [row] = (await db('openapi_generation_jobs')
      .insert({
        config_id: input.configId,
        status: 'pending',
        trigger: input.trigger ?? 'manual',
        triggered_by: input.triggeredBy ?? null,
        git_ref: input.gitRef ?? null,
        openapi_spec_sha: specSha,
      })
      .returning('*')) as Row[];

    const job = mapJobRow(row);
    await this._emitEvent(job.id, 'queued', { configId: input.configId, trigger: job.trigger });
    logger.info({ jobId: job.id, configId: input.configId }, 'openapi_generation_job.queued');
    return job;
  }

  async startJob(id: string): Promise<GenerationJob | null> {
    const db = getDatabase();
    const [row] = (await db('openapi_generation_jobs')
      .where({ id })
      .update({ status: 'running', started_at: new Date() })
      .returning('*')) as Row[];
    if (!row) return null;
    const job = mapJobRow(row);
    await this._emitEvent(id, 'started', {});
    return job;
  }

  async appendLog(id: string, line: string): Promise<void> {
    const db = getDatabase();
    // Append-only using || operator; safe for concurrent runners
    await db.raw(
      `UPDATE openapi_generation_jobs
       SET output_log = COALESCE(output_log, '') || ?
       WHERE id = ?`,
      [line + '\n', id],
    );
    await this._emitEvent(id, 'log_line', { line });
  }

  async completeJob(
    id: string,
    outcome: {
      status: 'succeeded' | 'failed' | 'cancelled';
      errorMessage?: string | null;
      artifactUrls?: string[];
      diffSummary?: Record<string, unknown>;
      generatorVersionResolved?: string | null;
      committed?: boolean;
      published?: boolean;
    },
  ): Promise<GenerationJob | null> {
    const db = getDatabase();
    const [row] = (await db('openapi_generation_jobs')
      .where({ id })
      .update({
        status: outcome.status,
        error_message: outcome.errorMessage ?? null,
        artifact_urls: JSON.stringify(outcome.artifactUrls ?? []),
        diff_summary: JSON.stringify(outcome.diffSummary ?? {}),
        generator_version_resolved: outcome.generatorVersionResolved ?? null,
        committed: outcome.committed ?? false,
        published: outcome.published ?? false,
        completed_at: new Date(),
      })
      .returning('*')) as Row[];
    if (!row) return null;
    const job = mapJobRow(row);
    await this._emitEvent(id, outcome.status === 'succeeded' ? 'generated' : outcome.status, {
      errorMessage: outcome.errorMessage ?? null,
      diffSummary: outcome.diffSummary ?? {},
    });
    logger.info({ jobId: id, status: outcome.status }, 'openapi_generation_job.completed');
    return job;
  }

  async cancelJob(id: string, cancelledBy: string): Promise<GenerationJob | null> {
    const db = getDatabase();
    const [row] = (await db('openapi_generation_jobs')
      .where({ id })
      .whereIn('status', ['pending', 'running'])
      .update({ status: 'cancelled', completed_at: new Date() })
      .returning('*')) as Row[];
    if (!row) return null;
    await this._emitEvent(id, 'cancelled', { cancelledBy });
    return mapJobRow(row);
  }

  async getJob(id: string): Promise<GenerationJob | null> {
    const db = getDatabase();
    const row = (await db('openapi_generation_jobs').where({ id }).first()) as Row | undefined;
    return row ? mapJobRow(row) : null;
  }

  async listJobs(
    opts: {
      configId?: string;
      status?: GenerationStatus;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<{ jobs: GenerationJob[]; total: number }> {
    const db = getDatabase();
    const limit = Math.min(opts.limit ?? 20, 100);
    const offset = opts.offset ?? 0;

    const query = db('openapi_generation_jobs').modify((qb) => {
      if (opts.configId) qb.where('config_id', opts.configId);
      if (opts.status) qb.where('status', opts.status);
    });

    const [{ count }] = (await query.clone().count('id as count')) as { count: string }[];
    const rows = (await query.orderBy('created_at', 'desc').limit(limit).offset(offset)) as Row[];

    return { jobs: rows.map(mapJobRow), total: parseInt(count, 10) };
  }

  async listJobEvents(jobId: string): Promise<GenerationEvent[]> {
    const db = getDatabase();
    const rows = (await db('openapi_generation_events')
      .where('job_id', jobId)
      .orderBy('occurred_at')) as Row[];
    return rows.map((r) => ({
      id: r['id'] as string,
      jobId: r['job_id'] as string,
      eventType: r['event_type'] as string,
      payload:
        typeof r['payload'] === 'string'
          ? JSON.parse(r['payload'] as string)
          : (r['payload'] as Record<string, unknown>) ?? {},
      occurredAt: String(r['occurred_at']),
    }));
  }

  // ─── Observability ───────────────────────────────────────────────────────────

  async getStats(): Promise<{
    totalConfigs: number;
    enabledConfigs: number;
    totalJobs: number;
    byStatus: Record<GenerationStatus, number>;
    recentFailures: GenerationJob[];
  }> {
    const db = getDatabase();

    const [configStats] = (await db('openapi_client_configs')
      .whereNull('deleted_at')
      .select(
        db.raw('COUNT(*) as total'),
        db.raw("COUNT(*) FILTER (WHERE enabled = true) as enabled"),
      )) as { total: string; enabled: string }[];

    const statusRows = (await db('openapi_generation_jobs')
      .select('status', db.raw('COUNT(*) as cnt'))
      .groupBy('status')) as { status: string; cnt: string }[];

    const byStatus: Record<GenerationStatus, number> = {
      pending: 0,
      running: 0,
      succeeded: 0,
      failed: 0,
      cancelled: 0,
    };
    for (const r of statusRows) {
      byStatus[r.status as GenerationStatus] = parseInt(r.cnt, 10);
    }

    const failureRows = (await db('openapi_generation_jobs')
      .where('status', 'failed')
      .orderBy('created_at', 'desc')
      .limit(5)) as Row[];

    return {
      totalConfigs: parseInt(configStats['total'] as string, 10),
      enabledConfigs: parseInt(configStats['enabled'] as string, 10),
      totalJobs: Object.values(byStatus).reduce((s, n) => s + n, 0),
      byStatus,
      recentFailures: failureRows.map(mapJobRow),
    };
  }

  // ─── Internal helpers ────────────────────────────────────────────────────────

  private async _emitEvent(
    jobId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
      const db = getDatabase();
      await db('openapi_generation_events').insert({
        job_id: jobId,
        event_type: eventType,
        payload: JSON.stringify(payload),
      });
    } catch (err) {
      logger.warn({ err, jobId, eventType }, 'openapi_generation_event.emit_failed');
    }
  }
}

export const openApiClientGenerationService = new OpenApiClientGenerationService();
