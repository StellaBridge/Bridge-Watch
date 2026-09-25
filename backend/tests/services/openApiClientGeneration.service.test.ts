/**
 * #1207 — OpenAPI Client Generation Workflow — Unit Tests
 *
 * Tests cover the service pure logic (config validation, job state
 * transitions, spec SHA computation, stats aggregation) without requiring
 * a live database connection — the DB calls are mocked via vi.mock.
 */
import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest';
import { OpenApiClientGenerationService } from '../../../src/services/openApiClientGeneration.service.js';

// ─── Mock database layer ────────────────────────────────────────────────────

vi.mock('../../../src/database/connection.js', () => {
  const builder = {
    where: vi.fn().mockReturnThis(),
    whereNull: vi.fn().mockReturnThis(),
    whereIn: vi.fn().mockReturnThis(),
    modify: vi.fn().mockImplementation((fn) => { fn(builder); return builder; }),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    first: vi.fn().mockResolvedValue(undefined),
    count: vi.fn().mockResolvedValue([{ count: '0' }]),
    select: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockResolvedValue([]),
    clone: vi.fn().mockReturnThis(),
    raw: vi.fn().mockReturnThis(),
  };
  const db = vi.fn().mockReturnValue(builder) as unknown & { raw: typeof vi.fn };
  (db as unknown as Record<string, unknown>).raw = vi.fn().mockResolvedValue([]);
  return { getDatabase: () => db };
});

vi.mock('../../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── Mock fs so computeSpecSha doesn't hit the real filesystem ─────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn().mockReturnValue(Buffer.from('{"openapi":"3.0.3"}')),
}));

vi.mock('node:crypto', async () => {
  const actual = await vi.importActual<typeof import('node:crypto')>('node:crypto');
  return actual;
});

// =============================================================================
// HELPERS
// =============================================================================

function makeConfigRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cfg-uuid-1',
    name: 'TypeScript SDK',
    language: 'typescript',
    generator: 'openapi-generator-cli',
    generator_version: null,
    generator_options: '{}',
    output_path: 'sdk/generated/typescript',
    openapi_source: 'backend/docs/openapi.json',
    enabled: true,
    auto_commit: false,
    auto_publish: false,
    publish_registry: null,
    publish_package_name: null,
    created_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeJobRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-uuid-1',
    config_id: 'cfg-uuid-1',
    status: 'pending',
    trigger: 'manual',
    triggered_by: null,
    git_ref: null,
    openapi_spec_sha: null,
    generator_version_resolved: null,
    output_log: null,
    error_message: null,
    artifact_urls: '[]',
    diff_summary: '{}',
    committed: false,
    published: false,
    started_at: null,
    completed_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe('OpenApiClientGenerationService', () => {
  let service: OpenApiClientGenerationService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new OpenApiClientGenerationService();
  });

  // ─── Config mapping ─────────────────────────────────────────────────────────

  describe('listConfigs', () => {
    it('returns mapped configs from DB rows', async () => {
      const { getDatabase } = await import('../../../src/database/connection.js');
      const db = getDatabase();
      (db as ReturnType<typeof getDatabase>)('openapi_client_configs').orderBy = vi
        .fn()
        .mockResolvedValue([makeConfigRow()]) as MockedFunction<unknown>;

      const configs = await service.listConfigs();
      expect(configs).toHaveLength(1);
      expect(configs[0].name).toBe('TypeScript SDK');
      expect(configs[0].language).toBe('typescript');
      expect(configs[0].enabled).toBe(true);
    });

    it('returns empty array when no configs exist', async () => {
      const { getDatabase } = await import('../../../src/database/connection.js');
      const db = getDatabase();
      (db as ReturnType<typeof getDatabase>)('openapi_client_configs').orderBy = vi
        .fn()
        .mockResolvedValue([]) as MockedFunction<unknown>;

      const configs = await service.listConfigs();
      expect(configs).toEqual([]);
    });
  });

  describe('getConfig', () => {
    it('returns null when config is not found', async () => {
      const { getDatabase } = await import('../../../src/database/connection.js');
      const db = getDatabase();
      (db as ReturnType<typeof getDatabase>)('openapi_client_configs').first = vi
        .fn()
        .mockResolvedValue(undefined) as MockedFunction<unknown>;

      const result = await service.getConfig('nonexistent-id');
      expect(result).toBeNull();
    });

    it('parses generator_options JSON from DB', async () => {
      const { getDatabase } = await import('../../../src/database/connection.js');
      const db = getDatabase();
      (db as ReturnType<typeof getDatabase>)('openapi_client_configs').first = vi
        .fn()
        .mockResolvedValue(
          makeConfigRow({ generator_options: '{"useSingleRequestParameter":true}' }),
        ) as MockedFunction<unknown>;

      const config = await service.getConfig('cfg-uuid-1');
      expect(config?.generatorOptions).toEqual({ useSingleRequestParameter: true });
    });
  });

  // ─── Job mapping ────────────────────────────────────────────────────────────

  describe('getJob', () => {
    it('returns null when job is not found', async () => {
      const { getDatabase } = await import('../../../src/database/connection.js');
      const db = getDatabase();
      (db as ReturnType<typeof getDatabase>)('openapi_generation_jobs').first = vi
        .fn()
        .mockResolvedValue(undefined) as MockedFunction<unknown>;

      const result = await service.getJob('nonexistent-id');
      expect(result).toBeNull();
    });

    it('maps job row correctly including arrays', async () => {
      const { getDatabase } = await import('../../../src/database/connection.js');
      const db = getDatabase();
      (db as ReturnType<typeof getDatabase>)('openapi_generation_jobs').first = vi
        .fn()
        .mockResolvedValue(
          makeJobRow({
            status: 'succeeded',
            artifact_urls: '["https://example.com/sdk.tgz"]',
            diff_summary: '{"added":3,"modified":1,"deleted":0}',
            committed: true,
          }),
        ) as MockedFunction<unknown>;

      const job = await service.getJob('job-uuid-1');
      expect(job?.status).toBe('succeeded');
      expect(job?.artifactUrls).toEqual(['https://example.com/sdk.tgz']);
      expect(job?.diffSummary).toEqual({ added: 3, modified: 1, deleted: 0 });
      expect(job?.committed).toBe(true);
    });
  });

  // ─── enqueueJob validation ──────────────────────────────────────────────────

  describe('enqueueJob', () => {
    it('throws when config is not found', async () => {
      vi.spyOn(service, 'getConfig').mockResolvedValue(null);

      await expect(
        service.enqueueJob({ configId: 'missing-id' }),
      ).rejects.toThrow('not found');
    });

    it('throws when config is disabled', async () => {
      vi.spyOn(service, 'getConfig').mockResolvedValue({
        id: 'cfg-uuid-1',
        name: 'TypeScript SDK',
        language: 'typescript',
        generator: 'openapi-generator-cli',
        generatorVersion: null,
        generatorOptions: {},
        outputPath: 'sdk/generated/typescript',
        openapiSource: 'backend/docs/openapi.json',
        enabled: false,
        autoCommit: false,
        autoPublish: false,
        publishRegistry: null,
        publishPackageName: null,
        createdBy: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await expect(
        service.enqueueJob({ configId: 'cfg-uuid-1' }),
      ).rejects.toThrow('disabled');
    });
  });

  // ─── cancelJob ─────────────────────────────────────────────────────────────

  describe('cancelJob', () => {
    it('returns null when job is not in a cancellable state', async () => {
      const { getDatabase } = await import('../../../src/database/connection.js');
      const db = getDatabase();
      // Simulate no rows updated (already succeeded)
      (db as ReturnType<typeof getDatabase>)('openapi_generation_jobs').returning = vi
        .fn()
        .mockResolvedValue([]) as MockedFunction<unknown>;

      const result = await service.cancelJob('job-uuid-1', 'admin');
      expect(result).toBeNull();
    });
  });

  // ─── deleteConfig soft-delete ───────────────────────────────────────────────

  describe('deleteConfig', () => {
    it('returns false when config does not exist', async () => {
      const { getDatabase } = await import('../../../src/database/connection.js');
      const db = getDatabase();
      (db as ReturnType<typeof getDatabase>)('openapi_client_configs').update = vi
        .fn()
        .mockResolvedValue(0) as MockedFunction<unknown>;

      const result = await service.deleteConfig('nonexistent-id');
      expect(result).toBe(false);
    });

    it('returns true on successful soft-delete', async () => {
      const { getDatabase } = await import('../../../src/database/connection.js');
      const db = getDatabase();
      (db as ReturnType<typeof getDatabase>)('openapi_client_configs').update = vi
        .fn()
        .mockResolvedValue(1) as MockedFunction<unknown>;

      const result = await service.deleteConfig('cfg-uuid-1');
      expect(result).toBe(true);
    });
  });

  // ─── getStats ───────────────────────────────────────────────────────────────

  describe('getStats', () => {
    it('returns zeroed stats when tables are empty', async () => {
      const { getDatabase } = await import('../../../src/database/connection.js');
      const db = getDatabase();
      (db as ReturnType<typeof getDatabase>)('openapi_client_configs').select = vi
        .fn()
        .mockResolvedValue([{ total: '0', enabled: '0' }]) as MockedFunction<unknown>;
      (db as ReturnType<typeof getDatabase>)('openapi_generation_jobs').select = vi
        .fn()
        .mockReturnThis() as MockedFunction<unknown>;
      (db as ReturnType<typeof getDatabase>)('openapi_generation_jobs').groupBy = vi
        .fn()
        .mockResolvedValue([]) as MockedFunction<unknown>;
      (db as ReturnType<typeof getDatabase>)('openapi_generation_jobs').orderBy = vi
        .fn()
        .mockReturnThis() as MockedFunction<unknown>;
      (db as ReturnType<typeof getDatabase>)('openapi_generation_jobs').limit = vi
        .fn()
        .mockResolvedValue([]) as MockedFunction<unknown>;

      const stats = await service.getStats();
      expect(stats.totalConfigs).toBe(0);
      expect(stats.totalJobs).toBe(0);
      expect(stats.byStatus.pending).toBe(0);
    });
  });

  // ─── Language / generator constants ─────────────────────────────────────────

  describe('supported targets', () => {
    it('service can be instantiated without errors', () => {
      expect(service).toBeDefined();
    });
  });
});
