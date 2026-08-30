import type { FastifyInstance } from "fastify";
import { registerCoreRoutes } from "./route-groups/core-routes.js";
import { registerAssetRoutes } from "./route-groups/asset-routes.js";
import { registerBridgeRoutes } from "./route-groups/bridge-routes.js";
import { registerAlertRoutes } from "./route-groups/alert-routes.js";
import { registerAnalyticsRoutes } from "./route-groups/analytics-routes.js";
import { registerAdminRoutes } from "./route-groups/admin-routes.js";
import { registerIncidentRoutes } from "./route-groups/incident-routes.js";
import { registerPriceRoutes } from "./route-groups/price-routes.js";
import { registerReconciliationRoutes } from "./route-groups/reconciliation-routes.js";
import { registerDataRoutes } from "./route-groups/data-routes.js";
import { registerIntegrationRoutes } from "./route-groups/integration-routes.js";
import { registerProviderRoutes } from "./route-groups/provider-routes.js";
import { registerSourceRoutes } from "./route-groups/source-routes.js";
import { registerAnomalyRoutes } from "./route-groups/anomaly-routes.js";
import { registerAutomationRoutes } from "./route-groups/automation-routes.js";
import { registerUtilityRoutes } from "./route-groups/utility-routes.js";
import { registerCompatibilityRoutes } from "./route-groups/compatibility-routes.js";
import { registerOperationalRoutes } from "./route-groups/operational-routes.js";
import { registerOperationalMonitoringRoutes } from "./route-groups/operational-monitoring-routes.js";
import { registerLiquidityRoutes } from "./route-groups/liquidity-routes.js";
import { sorobanEventsRoutes } from "./sorobanEvents.routes.js";
import { backfillRoutes } from "./backfill.routes.js";
// #1019 — Signed evidence bundles & append-only transparency log
import { evidenceBundleRoutes } from "./evidenceBundle.routes.js";

export async function registerRoutes(server: FastifyInstance): Promise<void> {
  // Core routes: health, websocket, config, preferences, caching
  await registerCoreRoutes(server);

  // Asset management: monitoring, health, freshness
  await registerAssetRoutes(server);

  // Bridge monitoring: status, registry, verification
  await registerBridgeRoutes(server);

  // Alert system: rules, suppression, escalation, routing
  await registerAlertRoutes(server);

  // Incident management: correlation, timeline, visualization
  await registerIncidentRoutes(server);

  // Analytics and metrics: aggregation, baselines, trends
  await registerAnalyticsRoutes(server);

  // Price data: feeds, sources, comparisons
  await registerPriceRoutes(server);

  // Reconciliation: data consistency, batch operations
  await registerReconciliationRoutes(server);

  // Data operations: transactions, balances, supply chain
  await registerDataRoutes(server);

  // External integrations: webhooks, discord, oauth
  await registerIntegrationRoutes(server);

  // Provider management: health, allowlists, circuit breakers
  await registerProviderRoutes(server);

  // Data source management: health scoring, decommission
  await registerSourceRoutes(server);

  // Anomaly detection: detection and tuning
  await registerAnomalyRoutes(server);

  // DEX liquidity: pool discovery, quality ranking, impact presets, route quotes
  await registerLiquidityRoutes(server);

  // Automation: rules, evaluator, playbooks, cleanup
  await registerAutomationRoutes(server);

  // Operational monitoring: ledger delays, cursor audit
  await registerOperationalMonitoringRoutes(server);

  // Database pool dashboard: metrics, events, controls
  await registerDbPoolRoutes(server);

  // Administrative functions
  await registerAdminRoutes(server);

  // Utility routes: exports, metadata, cleanup
  await registerUtilityRoutes(server);

  // API compatibility: negotiated contracts, capabilities, and versions
  await registerCompatibilityRoutes(server);

  // Operational routes: query baseline, rollback readiness, canary metrics, promotion gates, risk clustering
  await registerOperationalRoutes(server);

  server.register(sorobanEventsRoutes, { prefix: "/api/v1/soroban-events" });
  server.register(backfillRoutes, { prefix: "/api/v1/backfill" });

  // #1019 — Signed evidence bundles & append-only transparency log
  server.register(evidenceBundleRoutes, { prefix: "/api/v1/evidence" });
}
