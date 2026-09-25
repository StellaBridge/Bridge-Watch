import type { FastifyInstance } from "fastify";
import { analyticsRoutes } from "../analytics.js";
import { metricsRoutes } from "../metrics.js";
import { metricsAggregationRoutes } from "../metricsAggregation.routes.js";
import { savedMetricsRoutes } from "../savedMetrics.routes.js";
import { externalRateLimitMetricsRoutes } from "../externalRateLimitMetrics.routes.js";
import { performanceBaselineRoutes } from "../performanceBaseline.routes.js";
import { sorobanInvocationCostRoutes } from "../sorobanInvocationCost.routes.js";
import { correlationAnalysisRoutes } from "../correlationAnalysis.routes.js";
import { txFeeForecastHistoryRoutes } from "../txFeeForecastHistory.routes.js";
// #1150 — Historical Liquidity Heatmap Export
import { liquidityHeatmapExportRoutes } from "../liquidityHeatmapExport.routes.js";
// #1151 — Chart Data Sampling Controls
import { chartSamplingControlsRoutes } from "../chartSamplingControls.routes.js";
import { operationalIntelligenceRoutes } from "../operationalIntelligence.routes.js";
// #1240 — Register orphaned route modules
import { notificationAnalyticsRoutes } from "../notificationAnalytics.js";

export async function registerAnalyticsRoutes(server: FastifyInstance): Promise<void> {
  server.register(analyticsRoutes, { prefix: "/api/v1/analytics" });
  server.register(metricsRoutes, { prefix: "/metrics" });
  server.register(metricsAggregationRoutes, {
    prefix: "/api/v1/metrics/aggregation",
  });
  server.register(savedMetricsRoutes, { prefix: "/api/v1/analytics/saved-metrics" });
  server.register(externalRateLimitMetricsRoutes, {
    prefix: "/api/v1/metrics/external-rate-limits",
  });
  server.register(performanceBaselineRoutes, {
    prefix: "/api/v1/performance-baselines",
  });
  server.register(operationalIntelligenceRoutes, {
    prefix: "/api/v1/operational-intelligence",
  });

  // #1150 — Historical Liquidity Heatmap Export
  server.register(liquidityHeatmapExportRoutes, {
    prefix: "/api/v1/liquidity-heatmap",
  });

  // #1151 — Chart Data Sampling Controls
  server.register(chartSamplingControlsRoutes, {
    prefix: "/api/v1/chart-sampling",
  });

  // #1240 — Register orphaned route modules
  server.register(notificationAnalyticsRoutes, { prefix: "/api/v1/notifications" });
}
