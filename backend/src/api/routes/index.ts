import type { FastifyInstance } from "fastify";
import { assetsRoutes } from "./assets.js";
import { bridgesRoutes } from "./bridges.js";
import { websocketRoutes } from "./websocket.js";
import { alertsRoutes } from "./alerts.routes.js";
import { alertHistoryRoutes } from "./alertHistory.routes.js";
import { exportsRoutes } from "./exports.js";
import { circuitBreakerRoutes } from "./circuitBreaker.js";
import { preferencesRoutes } from "./preferences.js";
import { apiKeysRoutes } from "./apiKeys.js";
import { oauth2Routes } from "./oauth2.js";
import jobsRoutes from "./jobs.js";
import { webhooksRoutes } from "./webhooks.js";
import { configRoutes } from "./config.js";
import { aggregationRoutes } from "./aggregation.js";
import { metadataRoutes } from "./metadata.js";
import { analyticsRoutes } from "./analytics.js";
import { watchlistsRoutes } from "./watchlists.js";
import { cacheRoutes } from "./cache.js";
import { healthRoutes } from "./health.js";
import { rateLimitAdminRoutes } from "./rateLimitAdmin.js";
import { tracingAdminRoutes } from "./tracingAdmin.js";
import { validationAdminRoutes } from "./validationAdmin.js";
import { alertRoutingAdminRoutes } from "./alertRoutingAdmin.js";
import { metricsRoutes } from "./metrics.js";
import { priceFeedsRoutes } from "./priceFeeds.js";
import { supplyChainRoutes } from "./supplyChain.js";
import { transactionsRoutes } from "./transactions.js";
import { balanceRoutes } from "./balances.js";
import { poolRoutes } from "./pools.routes.js";
import { searchRoutes } from "./search.routes.js";
import { cleanupRoutes } from "./cleanup.routes.js";
import { discordRoutes } from "./discord.routes.js";
import { alertRulesRoutes } from "./alertRules.js";
import { auditRoutes } from "./audit.js";
import { bridgeRegistryRoutes } from "./bridge-registry.routes.js";
import { incidentRoutes } from "./incidents.routes.js";
import { incidentCorrelationRoutes } from "./incidentCorrelation.routes.js";
import { usageMetricsRoutes } from "./usageMetrics.routes.js";
import { healthScoreHistoryRoutes } from "./healthScoreHistory.routes.js";
import { horizonStreamRoutes } from "./horizonStream.routes.js";
import { adminRotationRoutes } from "./adminRotation.js";
import { digestSchedulerRoutes } from "./digestScheduler.js";
import { alertSuppressionRoutes } from "./alertSuppression.js";
import { externalDependenciesRoutes } from "./externalDependencies.routes.js";
import { providerHealthRegistryRoutes } from "./providerHealthRegistry.routes.js";
import { sourceHealthRoutes } from "./sourceHealth.routes.js";
import { accessOverviewRoutes } from "./accessOverview.routes.js";
import { reconciliationRoutes } from "./reconciliation.js";
import { statusSubscriptionsRoutes } from "./statusSubscriptions.js";
import { sessionsRoutes } from "./sessions.js";
import { externalRateLimitMetricsRoutes } from "./externalRateLimitMetrics.routes.js";
import { eventSubscriptionFilterRoutes } from "./eventSubscriptionFilter.routes.js";
import { maintenanceRoutes } from "./maintenance.js";
import { notificationTemplatesRoutes } from "./notificationTemplates.js";
import { archivedDataBrowserRoutes } from "./archivedDataBrowser.routes.js";
import { circuitHealthRoutes } from "./circuitHealth.js";
import { ruleEvaluatorRoutes } from "./ruleEvaluator.routes.js";
import { automationRulesRoutes } from "./automationRules.routes.js";
import { serviceAnnotationRoutes } from "./serviceAnnotation.routes.js";
import { contractAnnotationRoutes } from "./contractAnnotations.routes.js";
import { assetMergeRoutes } from "./assetMerge.routes.js";
import { alertWindowingRoutes } from "./alertWindowing.routes.js";
import { queryPresetsRoutes } from "./queryPresets.js";
import { duplicateAlertCheckRoutes } from "./duplicateAlertCheck.routes.js";
import { freshnessRoutes } from "./freshness.js";
import { assetFreshnessRoutes } from "./assetFreshness.routes.js";
import { providerAllowlistRoutes } from "./providerAllowlist.routes.js";
import { providerAllowlistAdminRoutes } from "./providerAllowlistAdmin.routes.js";
import { provenanceRoutes } from "./provenance.routes.js";
import { anomalyDetectionRoutes } from "./anomalyDetection.routes.js";
import { anomalyTuningRoutes } from "./anomalyTuning.routes.js";
import { liquidityFragmentationRoutes } from "./liquidityFragmentation.routes.js";
import { operationalAccessAuditRoutes } from "./operationalAccessAudit.js";
import { ownershipMatrixRoutes } from "./ownershipMatrix.js";
import { operatorNotesRoutes } from "./notes.js";
import { incidentsRoutes } from "./incidents.js";
import { tagsRoutes } from "./tags.js";
import { savedMetricsRoutes } from "./savedMetrics.routes.js";
import { playbooksRoutes } from "./playbooks.routes.js";
import { sourceHealthScoringRoutes } from "./sourceHealthScoring.routes.js";
import { batchReconciliationRoutes } from "./batchReconciliation.routes.js";
import { performanceBaselineRoutes } from "./performanceBaseline.routes.js";
import { metricsAggregationRoutes } from "./metricsAggregation.routes.js";
import { eventReplayRoutes } from "./eventReplay.routes.js";
import { sourceDecommissionRoutes } from "./sourceDecommission.routes.js";
import { providerCircuitBreakerRoutes } from "./providerCircuitBreaker.routes.js";
import { crossChainVerificationRoutes } from "./crossChainVerification.routes.js";
import { eventFederationRoutes } from "./eventFederation.routes.js";
import { eventSourceKeyRoutes } from "./eventSourceKeys.routes.js";

export async function registerRoutes(server: FastifyInstance) {
  server.register(assetsRoutes, { prefix: "/api/v1/assets" });
  server.register(bridgesRoutes, { prefix: "/api/v1/bridges" });
  server.register(websocketRoutes, { prefix: "/api/v1/ws" });
  server.register(alertsRoutes, { prefix: "/api/v1/alerts" });
  server.register(alertHistoryRoutes, { prefix: "/api/v1/alerts/search" });
  server.register(exportsRoutes, { prefix: "/api/v1/exports" });
  server.register(circuitBreakerRoutes, { prefix: "/api/v1/circuit-breaker" });
  server.register(circuitHealthRoutes, { prefix: "/api/v1/circuit-health" });
  server.register(preferencesRoutes, { prefix: "/api/v1/preferences" });
  server.register(apiKeysRoutes, { prefix: "/api/v1/admin/api-keys" });
  server.register(oauth2Routes, { prefix: "/api/v1/oauth" });
  server.register(jobsRoutes, { prefix: "/api/v1/jobs" });
  server.register(webhooksRoutes, { prefix: "/api/v1/webhooks" });
  server.register(configRoutes, { prefix: "/api/v1/config" });
  server.register(aggregationRoutes, { prefix: "/api/v1/aggregation" });
  server.register(metadataRoutes, { prefix: "/api/v1/metadata" });
  server.register(analyticsRoutes, { prefix: "/api/v1/analytics" });
  server.register(savedMetricsRoutes, { prefix: "/api/v1/analytics/saved-metrics" });
  server.register(watchlistsRoutes, { prefix: "/api/v1/watchlists" });
  server.register(cacheRoutes, { prefix: "/api/v1/cache" });
  server.register(healthRoutes, { prefix: "/api/v1/health" });
  server.register(healthRoutes, { prefix: "/health" });
  server.register(rateLimitAdminRoutes, { prefix: "/api/v1/admin/rate-limit" });
  server.register(tracingAdminRoutes, { prefix: "/api/v1/admin/tracing" });
  server.register(validationAdminRoutes, {
    prefix: "/api/v1/admin/validation",
  });
  server.register(alertRoutingAdminRoutes, {
    prefix: "/api/v1/admin/alert-routing",
  });
  server.register(metricsRoutes, { prefix: "/metrics" });
  server.register(priceFeedsRoutes, { prefix: "/api/v1/price-feeds" });
  server.register(supplyChainRoutes, { prefix: "/api/v1/supply-chain" });
  server.register(transactionsRoutes, { prefix: "/api/v1/transactions" });
  server.register(balanceRoutes, { prefix: "/api/v1/balances" });
  server.register(poolRoutes, { prefix: "/api/v1/pools" });
  server.register(searchRoutes, { prefix: "/api/v1/search" });
  server.register(cleanupRoutes, { prefix: "/api/v1/cleanup" });
  server.register(discordRoutes, { prefix: "/api/v1/discord" });
  server.register(alertRulesRoutes, { prefix: "/api/v1/alert-rules" });
  server.register(auditRoutes, { prefix: "/api/v1/admin/audit" });
  server.register(bridgeRegistryRoutes, { prefix: "/api/v1/bridge-registry" });
  server.register(incidentRoutes, { prefix: "/api/v1/incidents" });
  server.register(incidentCorrelationRoutes, { prefix: "/api/v1/incidents" });
  server.register(usageMetricsRoutes, { prefix: "/api/v1" });
  server.register(healthScoreHistoryRoutes, {
    prefix: "/api/v1/health-score-history",
  });
  server.register(horizonStreamRoutes, { prefix: "/api/v1/horizon-streams" });
  server.register(adminRotationRoutes, { prefix: "/api/v1/admin/rotation" });
  server.register(digestSchedulerRoutes, { prefix: "/api/v1/digest" });
  server.register(alertSuppressionRoutes, {
    prefix: "/api/v1/alert-suppression",
  });
  server.register(externalDependenciesRoutes, {
    prefix: "/api/v1/external-dependencies",
  });
  server.register(providerHealthRegistryRoutes, {
    prefix: "/api/v1/providers/health",
  });
  server.register(sourceHealthRoutes, { prefix: "/api/v1/sources/health" });
  server.register(accessOverviewRoutes, {
    prefix: "/api/v1/admin/access-overview",
  });
  server.register(reconciliationRoutes, { prefix: "/api/v1/reconciliation" });
  server.register(statusSubscriptionsRoutes, {
    prefix: "/api/v1/status-subscriptions",
  });
  server.register(externalRateLimitMetricsRoutes, {
    prefix: "/api/v1/metrics/external-rate-limits",
  });
  server.register(freshnessRoutes, { prefix: "/api/v1/freshness" });
  // Asset-scoped freshness endpoints
  server.register(assetFreshnessRoutes, { prefix: "/api/v1/freshness/assets" });
  server.register(eventSubscriptionFilterRoutes, {
    prefix: "/api/v1/event-subscriptions",
  });
  server.register(maintenanceRoutes, { prefix: "/api/v1/maintenance" });
  server.register(notificationTemplatesRoutes, {
    prefix: "/api/v1/notification-templates",
  });
  server.register(archivedDataBrowserRoutes, { prefix: "/api/v1/archive" });
  server.register(ruleEvaluatorRoutes, { prefix: "/api/v1/rule-evaluator" });
  server.register(automationRulesRoutes, { prefix: "/api/v1/automation-rules" });
  server.register(serviceAnnotationRoutes, {
    prefix: "/api/v1/service-annotations",
  });
  server.register(contractAnnotationRoutes, { prefix: "/api/v1/contracts" });
  server.register(assetMergeRoutes, { prefix: "/api/v1/asset-merge" });
  server.register(alertWindowingRoutes, { prefix: "/api/v1/alert-windowing" });
  server.register(queryPresetsRoutes, { prefix: "/api/v1/query-presets" });
  server.register(duplicateAlertCheckRoutes, { prefix: "/api/v1/duplicate-alert-check" });
  server.register(providerAllowlistRoutes, {
    prefix: "/api/v1/providers/allowlist",
  });
  server.register(providerAllowlistAdminRoutes, {
    prefix: "/api/v1/admin/providers/allowlist",
  });
  server.register(provenanceRoutes, { prefix: "/api/v1/provenance" });
  server.register(anomalyDetectionRoutes, { prefix: "/api/v1/anomaly-detection" });
  server.register(anomalyTuningRoutes, { prefix: "/api/v1/anomaly" });
  server.register(liquidityFragmentationRoutes, { prefix: "/api/v1" });
  server.register(operationalAccessAuditRoutes, {
    prefix: "/api/v1/admin/access-audit",
  });
  server.register(ownershipMatrixRoutes, { prefix: "/api/v1" });
  server.register(operatorNotesRoutes, { prefix: "/api/v1/notes" });
  server.register(incidentsRoutes, { prefix: "/api/v1/incidents-heatmap" });
  server.register(tagsRoutes, { prefix: "/api/v1/tags" });
  server.register(playbooksRoutes, { prefix: "/api/v1/playbooks" });
  server.register(sourceHealthScoringRoutes, { prefix: "/api/v1/sources/health-scoring" });
  server.register(batchReconciliationRoutes, { prefix: "/api/v1/reconciliation/batch" });
  server.register(performanceBaselineRoutes, { prefix: "/api/v1/performance-baselines" });
  server.register(metricsAggregationRoutes, { prefix: "/api/v1/metrics/aggregation" });
  server.register(eventReplayRoutes, { prefix: "/api/v1/events/replay" });
  server.register(sourceDecommissionRoutes, { prefix: "/api/v1/sources/decommission" });
  server.register(providerCircuitBreakerRoutes, { prefix: "/api/v1/providers/circuit-breaker" });
  server.register(crossChainVerificationRoutes, {
    prefix: "/api/v1/cross-chain-verification",
  });
  server.register(eventFederationRoutes, { prefix: "/api/v1/event-federation" });
  server.register(eventSourceKeyRoutes, { prefix: "/api/v1/admin/event-source-keys" });
}
