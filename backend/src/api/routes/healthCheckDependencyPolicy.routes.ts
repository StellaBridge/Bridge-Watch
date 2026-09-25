import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { HealthCheckDependencyPolicyService } from '../../services/healthCheckDependencyPolicy.service.js';
import { authMiddleware } from '../middleware/auth.js';

const DependencyPolicyCreateSchema = {
  type: 'object',
  required: ['health_check_id', 'dependent_check_id', 'dependency_type', 'failure_impact'],
  properties: {
    health_check_id: { type: 'string' },
    dependent_check_id: { type: 'string' },
    dependency_type: { type: 'string', enum: ['blocking', 'informational'] },
    failure_impact: { type: 'string' },
  },
};

export async function healthCheckDependencyPolicyRoutes(server: FastifyInstance) {
  const service = new HealthCheckDependencyPolicyService();

  server.addHook('preHandler', authMiddleware());

  server.post<{ Body: any }>(
    '/api/v1/health-checks/dependencies',
    { schema: { body: DependencyPolicyCreateSchema } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { health_check_id, dependent_check_id, dependency_type, failure_impact } = request.body;
        const dependency = await service.createDependency({
          health_check_id,
          dependent_check_id,
          dependency_type,
          failure_impact,
        });
        reply.code(201).send({ data: dependency });
      } catch (error) {
        reply.code(400).send({
          error: error instanceof Error ? error.message : 'Failed to create dependency',
        });
      }
    }
  );

  server.get<{ Params: { id: string } }>(
    '/api/v1/health-checks/:id/dependencies',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params;
        const dependencies = await service.getDependencies(id);
        reply.send({ data: dependencies });
      } catch (error) {
        reply.code(400).send({
          error: error instanceof Error ? error.message : 'Failed to get dependencies',
        });
      }
    }
  );

  server.get<{ Params: { id: string } }>(
    '/api/v1/health-checks/:id/dependents',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params;
        const dependents = await service.getDependents(id);
        reply.send({ data: dependents });
      } catch (error) {
        reply.code(400).send({
          error: error instanceof Error ? error.message : 'Failed to get dependents',
        });
      }
    }
  );

  server.post<{ Params: { id: string } }>(
    '/api/v1/health-checks/:id/validate-chain',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params;
        const validation = await service.validateDependencyChain(id);
        reply.send({ data: validation });
      } catch (error) {
        reply.code(400).send({
          error: error instanceof Error ? error.message : 'Failed to validate dependency chain',
        });
      }
    }
  );

  server.post<{ Params: { id: string } }>(
    '/api/v1/health-checks/:id/impact-analysis',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params;
        const analysis = await service.getImpactAnalysis(id);
        reply.send({ data: analysis });
      } catch (error) {
        reply.code(400).send({
          error: error instanceof Error ? error.message : 'Failed to get impact analysis',
        });
      }
    }
  );

  server.get(
    '/api/v1/health-checks/dependency-graph',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const graph = await service.getFullGraph();
        const graphData = Object.fromEntries(graph);
        reply.send({ data: graphData });
      } catch (error) {
        reply.code(400).send({
          error: error instanceof Error ? error.message : 'Failed to get dependency graph',
        });
      }
    }
  );

  server.delete<{ Params: { id: string } }>(
    '/api/v1/health-checks/dependencies/:id',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params;
        await service.deleteDependency(id);
        reply.code(204).send();
      } catch (error) {
        reply.code(400).send({
          error: error instanceof Error ? error.message : 'Failed to delete dependency',
        });
      }
    }
  );
}
