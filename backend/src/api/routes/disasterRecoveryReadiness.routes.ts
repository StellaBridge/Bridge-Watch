import type { FastifyInstance } from "fastify";
import { disasterRecoveryReadinessService } from "../../services/disasterRecoveryReadiness.service.js";

interface CreateAssessmentBody {
  bridgeId: string;
  factors: {
    backupCoverage?: number;
    rtoReadiness?: number;
    rpoReadiness?: number;
    runbookCompleteness?: number;
    failoverTestScore?: number;
  };
  checks?: Array<{
    checkName: string;
    category: string;
    passed: boolean;
    score: number;
    notes?: string;
  }>;
  assessedBy?: string;
}

export async function disasterRecoveryReadinessRoutes(app: FastifyInstance) {
  // POST /api/v1/dr-readiness/assessments — create a new assessment
  app.post<{ Body: CreateAssessmentBody }>(
    "/assessments",
    {
      schema: {
        tags: ["DR Readiness"],
        summary: "Create a disaster recovery readiness assessment for a bridge",
        body: {
          type: "object",
          required: ["bridgeId", "factors"],
          properties: {
            bridgeId: { type: "string" },
            factors: {
              type: "object",
              properties: {
                backupCoverage: { type: "number", minimum: 0, maximum: 100 },
                rtoReadiness: { type: "number", minimum: 0, maximum: 100 },
                rpoReadiness: { type: "number", minimum: 0, maximum: 100 },
                runbookCompleteness: { type: "number", minimum: 0, maximum: 100 },
                failoverTestScore: { type: "number", minimum: 0, maximum: 100 },
              },
            },
            checks: {
              type: "array",
              items: {
                type: "object",
                required: ["checkName", "category", "passed", "score"],
                properties: {
                  checkName: { type: "string" },
                  category: { type: "string" },
                  passed: { type: "boolean" },
                  score: { type: "number", minimum: 0, maximum: 100 },
                  notes: { type: "string" },
                },
              },
            },
            assessedBy: { type: "string" },
          },
        },
        response: { 201: { type: "object", additionalProperties: true } },
      },
    },
    async (request, reply) => {
      try {
        const assessment = await disasterRecoveryReadinessService.createAssessment(request.body);
        return reply.code(201).send(assessment);
      } catch (error) {
        return reply.code(400).send({ error: String(error) });
      }
    }
  );

  // GET /api/v1/dr-readiness/bridges/:bridgeId/latest — latest assessment
  app.get<{ Params: { bridgeId: string } }>(
    "/bridges/:bridgeId/latest",
    {
      schema: {
        tags: ["DR Readiness"],
        summary: "Get the latest DR readiness assessment for a bridge",
        params: {
          type: "object",
          properties: { bridgeId: { type: "string" } },
          required: ["bridgeId"],
        },
        response: { 200: { type: "object", additionalProperties: true } },
      },
    },
    async (request, reply) => {
      try {
        const assessment = await disasterRecoveryReadinessService.getLatestAssessment(
          request.params.bridgeId
        );
        if (!assessment) {
          return reply.code(404).send({ error: "No assessment found for this bridge" });
        }
        return reply.send(assessment);
      } catch (error) {
        return reply.code(400).send({ error: String(error) });
      }
    }
  );

  // GET /api/v1/dr-readiness/bridges/:bridgeId/history — assessment history
  app.get<{ Params: { bridgeId: string }; Querystring: { limit?: string } }>(
    "/bridges/:bridgeId/history",
    {
      schema: {
        tags: ["DR Readiness"],
        summary: "Get DR readiness assessment history for a bridge",
        params: {
          type: "object",
          properties: { bridgeId: { type: "string" } },
          required: ["bridgeId"],
        },
        querystring: {
          type: "object",
          properties: { limit: { type: "string" } },
        },
        response: { 200: { type: "object", additionalProperties: true } },
      },
    },
    async (request, reply) => {
      try {
        const limit = request.query.limit ? Number(request.query.limit) : 50;
        const history = await disasterRecoveryReadinessService.getAssessmentHistory(
          request.params.bridgeId,
          limit
        );
        return reply.send({ bridgeId: request.params.bridgeId, assessments: history, count: history.length });
      } catch (error) {
        return reply.code(400).send({ error: String(error) });
      }
    }
  );

  // GET /api/v1/dr-readiness/assessments/:id — fetch single assessment
  app.get<{ Params: { id: string } }>(
    "/assessments/:id",
    {
      schema: {
        tags: ["DR Readiness"],
        summary: "Get a DR readiness assessment by ID",
        params: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
        response: { 200: { type: "object", additionalProperties: true } },
      },
    },
    async (request, reply) => {
      try {
        const assessment = await disasterRecoveryReadinessService.getAssessmentById(
          request.params.id
        );
        if (!assessment) {
          return reply.code(404).send({ error: "Assessment not found" });
        }
        return reply.send(assessment);
      } catch (error) {
        return reply.code(400).send({ error: String(error) });
      }
    }
  );

  // GET /api/v1/dr-readiness/assessments/:id/checks — checks for an assessment
  app.get<{ Params: { id: string } }>(
    "/assessments/:id/checks",
    {
      schema: {
        tags: ["DR Readiness"],
        summary: "Get individual checks for a DR readiness assessment",
        params: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
        response: { 200: { type: "object", additionalProperties: true } },
      },
    },
    async (request, reply) => {
      try {
        const checks = await disasterRecoveryReadinessService.getChecksForAssessment(
          request.params.id
        );
        return reply.send({ assessmentId: request.params.id, checks, count: checks.length });
      } catch (error) {
        return reply.code(400).send({ error: String(error) });
      }
    }
  );

  // POST /api/v1/dr-readiness/score — stateless score computation (no persistence)
  app.post<{
    Body: {
      factors: {
        backupCoverage?: number;
        rtoReadiness?: number;
        rpoReadiness?: number;
        runbookCompleteness?: number;
        failoverTestScore?: number;
      };
    };
  }>(
    "/score",
    {
      schema: {
        tags: ["DR Readiness"],
        summary: "Compute a DR readiness score without persisting",
        body: {
          type: "object",
          required: ["factors"],
          properties: {
            factors: {
              type: "object",
              properties: {
                backupCoverage: { type: "number", minimum: 0, maximum: 100 },
                rtoReadiness: { type: "number", minimum: 0, maximum: 100 },
                rpoReadiness: { type: "number", minimum: 0, maximum: 100 },
                runbookCompleteness: { type: "number", minimum: 0, maximum: 100 },
                failoverTestScore: { type: "number", minimum: 0, maximum: 100 },
              },
            },
          },
        },
        response: { 200: { type: "object", additionalProperties: true } },
      },
    },
    async (request, reply) => {
      try {
        const result = disasterRecoveryReadinessService.computeDRScore(request.body.factors);
        return reply.send({
          score: result.score,
          level: result.level,
          factors: result.resolved,
        });
      } catch (error) {
        return reply.code(400).send({ error: String(error) });
      }
    }
  );
}
