/**
 * #1207 — OpenAPI Client Generation Workflow — API Routes
 *
 * Admin-only routes for managing generation configs and triggering jobs.
 * All endpoints require the "admin:openapi-client-gen" scope.
 *
 * Route prefix: /api/v1/admin/openapi-client-gen
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { openApiClientGenerationService, type GenerationStatus } from '../../services/openApiClientGeneration.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { sendApiError } from '../utils/response.js';

const SUPPORTED_LANGUAGES = [
  'typescript', 'javascript', 'python', 'go', 'java', 'kotlin',
  'ruby', 'rust', 'csharp', 'php', 'swift',
] as const;

const SUPPORTED_GENERATORS = [
  'openapi-generator-cli',
  'swagger-codegen',
  'oapi-codegen',
  'openapi-typescript',
] as const;

const STATUS_VALUES: GenerationStatus[] = ['pending', 'running', 'succeeded', 'failed', 'cancelled'];

// ─── Validation helpers ──────────────────────────────────────────────────────

function validateCreateConfig(body: Record<string, unknown>): string | null {
  if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
    return '`name` is required';
  }
  if (!body.language || !SUPPORTED_LANGUAGES.includes(body.language as typeof SUPPORTED_LANGUAGES[number])) {
    return `\`language\` must be one of: ${SUPPORTED_LANGUAGES.join(', ')}`;
  }
  if (!body.outputPath || typeof body.outputPath !== 'string' || !body.outputPath.trim()) {
    return '`outputPath` is required';
  }
  if (body.generator && !SUPPORTED_GENERATORS.includes(body.generator as typeof SUPPORTED_GENERATORS[number])) {
    return `\`generator\` must be one of: ${SUPPORTED_GENERATORS.join(', ')}`;
  }
  return null;
}

// =============================================================================
// ROUTE HANDLER
// =============================================================================

export async function openApiClientGenRoutes(server: FastifyInstance) {
  // All routes in this plugin require admin scope
  server.addHook('preHandler', authMiddleware({ requiredScopes: ['admin:openapi-client-gen'] }));

  // ─── Config endpoints ──────────────────────────────────────────────────────

  /**
   * GET /   — List all configs
   */
  server.get(
    '/',
    {
      schema: {
        tags: ['OpenAPI Client Gen'],
        summary: 'List client generation configs',
        description: 'Returns all OpenAPI client generation configurations, optionally including disabled ones.',
        security: [{ ApiKeyAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            includeDisabled: { type: 'string', enum: ['true', 'false'], description: 'Include disabled configs' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              configs: { type: 'array', items: { type: 'object' } },
              total: { type: 'integer' },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Querystring: { includeDisabled?: string } }>,
      reply: FastifyReply,
    ) => {
      const includeDisabled = request.query.includeDisabled === 'true';
      const configs = await openApiClientGenerationService.listConfigs(includeDisabled);
      return reply.send({ configs, total: configs.length });
    },
  );

  /**
   * GET /:id  — Get a single config
   */
  server.get(
    '/configs/:id',
    {
      schema: {
        tags: ['OpenAPI Client Gen'],
        summary: 'Get a generation config',
        security: [{ ApiKeyAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        response: {
          200: { type: 'object', properties: { config: { type: 'object' } } },
          404: { type: 'object' },
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const config = await openApiClientGenerationService.getConfig(request.params.id);
      if (!config) return sendApiError(reply, 404, 'Config not found');
      return reply.send({ config });
    },
  );

  /**
   * POST /configs  — Create a new config
   */
  server.post(
    '/configs',
    {
      schema: {
        tags: ['OpenAPI Client Gen'],
        summary: 'Create a client generation config',
        security: [{ ApiKeyAuth: [] }],
        body: {
          type: 'object',
          required: ['name', 'language', 'outputPath'],
          properties: {
            name: { type: 'string', description: 'Human-readable label, e.g. "TypeScript SDK"' },
            language: { type: 'string', enum: SUPPORTED_LANGUAGES as unknown as string[], description: 'Target language' },
            generator: { type: 'string', enum: SUPPORTED_GENERATORS as unknown as string[], description: 'Generator tool' },
            generatorVersion: { type: 'string', nullable: true, description: 'Pin a specific generator version' },
            generatorOptions: { type: 'object', additionalProperties: true },
            outputPath: { type: 'string', description: 'Relative output path, e.g. sdk/generated/typescript' },
            openapiSource: { type: 'string', description: 'Path to OpenAPI spec file' },
            enabled: { type: 'boolean' },
            autoCommit: { type: 'boolean', description: 'Auto-commit generated files to the branch' },
            autoPublish: { type: 'boolean', description: 'Publish package after generation' },
            publishRegistry: { type: 'string', nullable: true },
            publishPackageName: { type: 'string', nullable: true },
          },
        },
        response: {
          201: { type: 'object', properties: { config: { type: 'object' } } },
          400: { type: 'object' },
          409: { type: 'object' },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: Record<string, unknown> }>,
      reply: FastifyReply,
    ) => {
      const validationError = validateCreateConfig(request.body);
      if (validationError) return sendApiError(reply, 400, validationError);

      const existing = await openApiClientGenerationService.getConfigByName(request.body.name as string);
      if (existing) return sendApiError(reply, 409, `A config named "${request.body.name}" already exists`);

      const config = await openApiClientGenerationService.createConfig({
        name: request.body.name as string,
        language: request.body.language as string,
        generator: request.body.generator as string | undefined,
        generatorVersion: request.body.generatorVersion as string | null | undefined,
        generatorOptions: request.body.generatorOptions as Record<string, unknown> | undefined,
        outputPath: request.body.outputPath as string,
        openapiSource: request.body.openapiSource as string | undefined,
        enabled: request.body.enabled as boolean | undefined,
        autoCommit: request.body.autoCommit as boolean | undefined,
        autoPublish: request.body.autoPublish as boolean | undefined,
        publishRegistry: request.body.publishRegistry as string | null | undefined,
        publishPackageName: request.body.publishPackageName as string | null | undefined,
        createdBy: (request as { user?: { id?: string } }).user?.id ?? null,
      });

      return reply.status(201).send({ config });
    },
  );

  /**
   * PATCH /configs/:id  — Update a config
   */
  server.patch(
    '/configs/:id',
    {
      schema: {
        tags: ['OpenAPI Client Gen'],
        summary: 'Update a client generation config',
        security: [{ ApiKeyAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            language: { type: 'string', enum: SUPPORTED_LANGUAGES as unknown as string[] },
            generator: { type: 'string', enum: SUPPORTED_GENERATORS as unknown as string[] },
            generatorVersion: { type: 'string', nullable: true },
            generatorOptions: { type: 'object', additionalProperties: true },
            outputPath: { type: 'string' },
            openapiSource: { type: 'string' },
            enabled: { type: 'boolean' },
            autoCommit: { type: 'boolean' },
            autoPublish: { type: 'boolean' },
            publishRegistry: { type: 'string', nullable: true },
            publishPackageName: { type: 'string', nullable: true },
          },
        },
        response: {
          200: { type: 'object', properties: { config: { type: 'object' } } },
          404: { type: 'object' },
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: Record<string, unknown> }>,
      reply: FastifyReply,
    ) => {
      const updated = await openApiClientGenerationService.updateConfig(
        request.params.id,
        request.body as Parameters<typeof openApiClientGenerationService.updateConfig>[1],
      );
      if (!updated) return sendApiError(reply, 404, 'Config not found');
      return reply.send({ config: updated });
    },
  );

  /**
   * DELETE /configs/:id  — Soft-delete a config
   */
  server.delete(
    '/configs/:id',
    {
      schema: {
        tags: ['OpenAPI Client Gen'],
        summary: 'Delete a client generation config',
        security: [{ ApiKeyAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        response: {
          200: { type: 'object', properties: { ok: { type: 'boolean' } } },
          404: { type: 'object' },
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const deleted = await openApiClientGenerationService.deleteConfig(request.params.id);
      if (!deleted) return sendApiError(reply, 404, 'Config not found');
      return reply.send({ ok: true });
    },
  );

  // ─── Job endpoints ─────────────────────────────────────────────────────────

  /**
   * GET /jobs  — List generation jobs
   */
  server.get(
    '/jobs',
    {
      schema: {
        tags: ['OpenAPI Client Gen'],
        summary: 'List client generation jobs',
        security: [{ ApiKeyAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            configId: { type: 'string', format: 'uuid' },
            status: { type: 'string', enum: STATUS_VALUES },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            offset: { type: 'integer', minimum: 0, default: 0 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              jobs: { type: 'array', items: { type: 'object' } },
              total: { type: 'integer' },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Querystring: { configId?: string; status?: GenerationStatus; limit?: number; offset?: number };
      }>,
      reply: FastifyReply,
    ) => {
      const result = await openApiClientGenerationService.listJobs({
        configId: request.query.configId,
        status: request.query.status,
        limit: request.query.limit,
        offset: request.query.offset,
      });
      return reply.send(result);
    },
  );

  /**
   * GET /jobs/:id  — Get a single job with its events
   */
  server.get(
    '/jobs/:id',
    {
      schema: {
        tags: ['OpenAPI Client Gen'],
        summary: 'Get a generation job and its audit events',
        security: [{ ApiKeyAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              job: { type: 'object' },
              events: { type: 'array', items: { type: 'object' } },
            },
          },
          404: { type: 'object' },
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const [job, events] = await Promise.all([
        openApiClientGenerationService.getJob(request.params.id),
        openApiClientGenerationService.listJobEvents(request.params.id),
      ]);
      if (!job) return sendApiError(reply, 404, 'Job not found');
      return reply.send({ job, events });
    },
  );

  /**
   * POST /jobs  — Enqueue a new generation job
   */
  server.post(
    '/jobs',
    {
      schema: {
        tags: ['OpenAPI Client Gen'],
        summary: 'Enqueue a client generation job',
        description: 'Queues a new generation job for the given config. The CI workflow picks it up on the next run, or operators can trigger it via the Actions workflow dispatch.',
        security: [{ ApiKeyAuth: [] }],
        body: {
          type: 'object',
          required: ['configId'],
          properties: {
            configId: { type: 'string', format: 'uuid' },
            trigger: { type: 'string', enum: ['manual', 'ci', 'schedule', 'webhook'], default: 'manual' },
            gitRef: { type: 'string', nullable: true, description: 'Branch or commit SHA' },
          },
        },
        response: {
          201: { type: 'object', properties: { job: { type: 'object' } } },
          400: { type: 'object' },
          404: { type: 'object' },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: { configId: string; trigger?: string; gitRef?: string | null } }>,
      reply: FastifyReply,
    ) => {
      const { configId, trigger, gitRef } = request.body;
      if (!configId) return sendApiError(reply, 400, '`configId` is required');

      try {
        const job = await openApiClientGenerationService.enqueueJob({
          configId,
          trigger: (trigger ?? 'manual') as 'manual' | 'ci' | 'schedule' | 'webhook',
          triggeredBy: (request as { user?: { id?: string } }).user?.id ?? null,
          gitRef: gitRef ?? null,
        });
        return reply.status(201).send({ job });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to enqueue job';
        if (msg.includes('not found') || msg.includes('not found or disabled')) {
          return sendApiError(reply, 404, msg);
        }
        return sendApiError(reply, 400, msg);
      }
    },
  );

  /**
   * POST /jobs/:id/cancel  — Cancel a pending or running job
   */
  server.post(
    '/jobs/:id/cancel',
    {
      schema: {
        tags: ['OpenAPI Client Gen'],
        summary: 'Cancel a generation job',
        security: [{ ApiKeyAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        response: {
          200: { type: 'object', properties: { job: { type: 'object' } } },
          404: { type: 'object' },
          409: { type: 'object' },
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const cancelledBy = (request as { user?: { id?: string } }).user?.id ?? 'unknown';
      const job = await openApiClientGenerationService.cancelJob(request.params.id, cancelledBy);
      if (!job) return sendApiError(reply, 404, 'Job not found or not cancellable');
      return reply.send({ job });
    },
  );

  // ─── Stats & health ────────────────────────────────────────────────────────

  /**
   * GET /stats  — Observability summary
   */
  server.get(
    '/stats',
    {
      schema: {
        tags: ['OpenAPI Client Gen'],
        summary: 'Get generation workflow statistics',
        security: [{ ApiKeyAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              totalConfigs: { type: 'integer' },
              enabledConfigs: { type: 'integer' },
              totalJobs: { type: 'integer' },
              byStatus: { type: 'object', additionalProperties: true },
              recentFailures: { type: 'array', items: { type: 'object' } },
            },
          },
        },
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const stats = await openApiClientGenerationService.getStats();
      return reply.send(stats);
    },
  );

  /**
   * GET /supported-languages  — Discovery endpoint (no auth required within scope)
   */
  server.get(
    '/supported-languages',
    {
      schema: {
        tags: ['OpenAPI Client Gen'],
        summary: 'List supported target languages and generators',
        security: [{ ApiKeyAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              languages: { type: 'array', items: { type: 'string' } },
              generators: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.send({
        languages: SUPPORTED_LANGUAGES,
        generators: SUPPORTED_GENERATORS,
      });
    },
  );
}
