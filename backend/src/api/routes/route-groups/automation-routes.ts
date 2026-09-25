import type { FastifyInstance } from "fastify";
import { automationRulesRoutes } from "../automationRules.routes.js";
import { ruleEvaluatorRoutes } from "../ruleEvaluator.routes.js";
import { playbooksRoutes } from "../playbooks.routes.js";
import { cleanupRoutes } from "../cleanup.routes.js";
import { maintenanceRoutes } from "../maintenance.js";
// #1240 — Register orphaned route modules (aliased: `maintenanceRoutes` above)
import { maintenanceRoutes as maintenanceWindowRoutes } from "../maintenance.routes.js";

export async function registerAutomationRoutes(server: FastifyInstance): Promise<void> {
  server.register(automationRulesRoutes, { prefix: "/api/v1/automation-rules" });
  server.register(ruleEvaluatorRoutes, { prefix: "/api/v1/rule-evaluator" });
  server.register(playbooksRoutes, { prefix: "/api/v1/playbooks" });
  server.register(cleanupRoutes, { prefix: "/api/v1/cleanup" });
  server.register(maintenanceRoutes, { prefix: "/api/v1/maintenance" });

  // #1240 — Register orphaned route modules
  server.register(maintenanceWindowRoutes, { prefix: "/api/v1/maintenance-windows" });
}
