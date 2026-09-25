import type { FastifyInstance } from "fastify";
import { apiKeysRoutes } from "../apiKeys.js";
import { rateLimitAdminRoutes } from "../rateLimitAdmin.js";
import { tracingAdminRoutes } from "../tracingAdmin.js";
import { validationAdminRoutes } from "../validationAdmin.js";
import { auditRoutes } from "../audit.js";
import { adminRotationRoutes } from "../adminRotation.js";
import { accessOverviewRoutes } from "../accessOverview.routes.js";
import { operationalAccessAuditRoutes } from "../operationalAccessAudit.js";
import { providerAllowlistAdminRoutes } from "../providerAllowlistAdmin.routes.js";
import { eventSourceKeyRoutes } from "../eventSourceKeys.routes.js";
import { operatorHandoffRoutes } from "../operatorHandoff.routes.js";
import { operatorAvailabilityRoutes } from "../operatorAvailability.routes.js";
// #1058 — Request Sampling Controls
import { samplingRulesRoutes } from "../samplingRules.js";
// #1059 — Structured Error Catalog
import { errorCatalogAdminRoutes, errorCatalogPublicRoutes } from "../errorCatalog.js";
// #1060 — Operational Change Approval Workflow
import { changeRequestsRoutes } from "../changeRequests.js";
// #1061 — Config Rollback Preview
import { configVersionsRoutes } from "../configVersions.js";
// #1082 — RPC Method Capability Discovery
import { rpcCapabilitiesRoutes } from "../rpcCapabilities.routes.js";
// #1083 — Contract Address Allowlist Change Review
import { allowlistChangeReviewRoutes } from "../allowlistChangeReview.routes.js";
// #1085 — Token Decimal Change Detection
import { tokenDecimalAlertsRoutes } from "../tokenDecimalAlerts.routes.js";
// #1055 — User-Scoped Export Quotas
import { exportQuotaRoutes } from "../exportQuota.routes.js";
// #1170 — Import Validation Preview
import { importValidationPreviewRoutes } from "../importValidationPreview.routes.js";
// #1172 — API Key Scope Templates
import { apiKeyScopeTemplateRoutes } from "../apiKeyScopeTemplate.routes.js";
// #1168 — Failed Parse Quarantine Queue
import { parseQuarantineQueueRoutes } from "../parseQuarantineQueue.routes.js";
// #1175 — Admin Impersonation Safeguards
import { adminImpersonationRoutes } from "../adminImpersonation.routes.js";
// #1176 — Permission Change Notifications
import { permissionChangeNotificationRoutes } from "../permissionChangeNotification.routes.js";
// #1177 — Security Event Correlation View
import { securityEventCorrelationRoutes } from "../securityEventCorrelation.routes.js";
// #1178 — Webhook IP Allowlist Management
import { webhookIpAllowlistRoutes } from "../webhookIpAllowlist.routes.js";
// #1179 — Signed Request Verification Middleware
import { signedRequestVerificationRoutes } from "../signedRequestVerification.routes.js";
// #1180 — Sensitive Field Access Reports
import { sensitiveFieldAccessRoutes } from "../sensitiveFieldAccess.routes.js";
// #1207 — OpenAPI Client Generation Workflow
import { openApiClientGenRoutes } from "../openApiClientGen.routes.js";

export async function registerAdminRoutes(server: FastifyInstance): Promise<void> {
  server.register(apiKeysRoutes, { prefix: "/api/v1/admin/api-keys" });
  server.register(rateLimitAdminRoutes, { prefix: "/api/v1/admin/rate-limit" });
  server.register(tracingAdminRoutes, { prefix: "/api/v1/admin/tracing" });
  server.register(validationAdminRoutes, {
    prefix: "/api/v1/admin/validation",
  });
  server.register(auditRoutes, { prefix: "/api/v1/admin/audit" });
  server.register(adminRotationRoutes, { prefix: "/api/v1/admin/rotation" });
  server.register(accessOverviewRoutes, {
    prefix: "/api/v1/admin/access-overview",
  });
  server.register(operationalAccessAuditRoutes, {
    prefix: "/api/v1/admin/access-audit",
  });
  server.register(providerAllowlistAdminRoutes, {
    prefix: "/api/v1/admin/providers/allowlist",
  });
  server.register(eventSourceKeyRoutes, {
    prefix: "/api/v1/admin/event-source-keys",
  });
  server.register(operatorHandoffRoutes, {
    prefix: "/api/v1/operator",
  });
  server.register(operatorAvailabilityRoutes, {
    prefix: "/api/v1/operator",
  });

  // #1058 — Request Sampling Controls
  server.register(samplingRulesRoutes, {
    prefix: "/api/v1/admin/sampling-rules",
  });

  // #1059 — Error Catalog (admin CRUD)
  server.register(errorCatalogAdminRoutes, {
    prefix: "/api/v1/admin/error-catalog",
  });

  // #1059 — Error Catalog (authenticated public lookup)
  server.register(errorCatalogPublicRoutes, {
    prefix: "/api/v1/error-catalog",
  });

  // #1060 — Operational Change Approval Workflow
  server.register(changeRequestsRoutes, {
    prefix: "/api/v1/admin/change-requests",
  });

  // #1061 — Config Version History & Rollback Preview
  server.register(configVersionsRoutes, {
    prefix: "/api/v1/admin/config-versions",
  });

  // #1082 — RPC Method Capability Discovery
  server.register(rpcCapabilitiesRoutes, {
    prefix: "/api/v1/admin/rpc-capabilities",
  });

  // #1083 — Contract Address Allowlist Change Review
  server.register(allowlistChangeReviewRoutes, {
    prefix: "/api/v1/admin/allowlist",
  });

  // #1085 — Token Decimal Change Detection
  server.register(tokenDecimalAlertsRoutes, {
    prefix: "/api/v1/admin/token-decimal-alerts",
  });

  // #1055 — User-Scoped Export Quotas
  server.register(exportQuotaRoutes, {
    prefix: "/api/v1/export-quotas",
  });

  // #1170 — Import Validation Preview
  server.register(importValidationPreviewRoutes, {
    prefix: "/api/v1/admin/imports",
  });

  // #1172 — API Key Scope Templates
  server.register(apiKeyScopeTemplateRoutes, {
    prefix: "/api/v1/admin/api-key-templates",
  });

  // #1168 — Failed Parse Quarantine Queue
  server.register(parseQuarantineQueueRoutes, {
    prefix: "/api/v1/admin/quarantine",
  });

  // #1175 — Admin Impersonation Safeguards
  server.register(adminImpersonationRoutes, {
    prefix: "/api/v1/admin/impersonation",
  });

  // #1176 — Permission Change Notifications
  server.register(permissionChangeNotificationRoutes, {
    prefix: "/api/v1/notifications/permission-changes",
  });

  // #1177 — Security Event Correlation View
  server.register(securityEventCorrelationRoutes, {
    prefix: "/api/v1/security-correlations",
  });

  // #1178 — Webhook IP Allowlist Management
  server.register(webhookIpAllowlistRoutes, {
    prefix: "/api/v1/admin/webhooks/ip-allowlist",
  });

  // #1179 — Signed Request Verification Middleware
  server.register(signedRequestVerificationRoutes, {
    prefix: "/api/v1/admin/signed-requests",
  });

  // #1180 — Sensitive Field Access Reports
  server.register(sensitiveFieldAccessRoutes, {
    prefix: "/api/v1/admin/sensitive-fields",
  });

  // #1187 — Graceful Shutdown Drain Protocol
  const { drainProtocolRoutes } = await import("../drainProtocol.routes.js");
  server.register(drainProtocolRoutes, {
    prefix: "/api/v1/admin/shutdown/drain",
  });

  // #1207 — OpenAPI Client Generation Workflow
  server.register(openApiClientGenRoutes, {
    prefix: "/api/v1/admin/openapi-client-gen",
  });
}
