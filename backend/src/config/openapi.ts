import type { FastifyDynamicSwaggerOptions } from "@fastify/swagger";

export const swaggerOptions: FastifyDynamicSwaggerOptions = {
  openapi: {
    openapi: "3.0.3",
    info: {
      title: "Bridge-Watch API",
      description: `
## Overview
Bridge-Watch is a real-time Stellar bridge monitoring platform. This API provides access to
bridge statuses, asset health scores, liquidity data, price feeds, alert management, analytics,
and administrative controls.

## Authentication
Protected endpoints require an API key supplied via the \`x-api-key\` request header.

## Rate Limiting
All endpoints are subject to rate limiting. Limits are applied per IP address using a
sliding-window algorithm backed by Redis. When a limit is exceeded the server returns
**429 Too Many Requests** with a \`Retry-After\` header.

## Versioning
All REST endpoints are prefixed with \`/api/v1/\`. Breaking changes will increment the
version segment. The current and previous version are always supported concurrently for at
least 90 days after a new version is released.

## Error Format
\`\`\`json
{
  "error": "Short machine-readable label",
  "message": "Human-readable description"
}
\`\`\`
      `.trim(),
      version: "1.0.0",
      contact: {
        name: "Bridge-Watch Team",
        url: "https://github.com/StellaBridge/Bridge-Watch",
      },
      license: {
        name: "MIT",
        url: "https://opensource.org/licenses/MIT",
      },
    },
    servers: [
      {
        url: "http://localhost:3000",
        description: "Local development",
      },
      {
        url: "https://api.bridge-watch.io",
        description: "Production",
      },
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "x-api-key",
          description: "API key for protected endpoints",
        },
      },
      schemas: {
        Error: {
          type: "object",
          properties: {
            error: { type: "string", example: "Not Found" },
            message: { type: "string", example: "The requested resource was not found" },
          },
        },
        PaginationMeta: {
          type: "object",
          properties: {
            total: { type: "integer", example: 42 },
            page: { type: "integer", example: 1 },
            limit: { type: "integer", example: 20 },
          },
        },
        HealthScore: {
          type: "object",
          properties: {
            symbol: { type: "string", example: "USDC" },
            score: { type: "number", format: "float", minimum: 0, maximum: 100, example: 87.5 },
            status: { type: "string", enum: ["healthy", "warning", "critical"], example: "healthy" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        AlertRule: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            ownerAddress: { type: "string" },
            name: { type: "string" },
            assetCode: { type: "string" },
            conditions: { type: "array", items: { type: "object" } },
            conditionOp: { type: "string", enum: ["AND", "OR"] },
            priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
            cooldownSeconds: { type: "integer" },
            webhookUrl: { type: "string", format: "uri" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        Watchlist: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            userId: { type: "string" },
            name: { type: "string" },
            isDefault: { type: "boolean" },
            assets: { type: "array", items: { type: "string" } },
            createdAt: { type: "string", format: "date-time" },
          },
        },
      },
    },
    tags: [
      { name: "Health", description: "Service health check" },
      { name: "Assets", description: "Monitored asset data — prices, liquidity, and health scores" },
      { name: "Bridges", description: "Stellar bridge status and statistics" },
      { name: "Alerts", description: "Alert rule management and history (requires API key)" },
      { name: "Analytics", description: "Protocol-wide and per-asset analytics" },
      { name: "Aggregation", description: "Time-series aggregation of prices, health, and volume" },
      { name: "Metadata", description: "Asset metadata — logos, descriptions, social links" },
      { name: "Watchlists", description: "User watchlists" },
      { name: "Preferences", description: "User preference storage" },
      { name: "Jobs", description: "Background job queue monitoring and control" },
      { name: "Config", description: "Runtime configuration and feature flags" },
      { name: "Cache", description: "Redis cache inspection and invalidation" },
      { name: "Circuit Breaker", description: "Automated circuit-breaker pause controls" },
    ],
  },
};

export const swaggerUiOptions = {
  routePrefix: "/docs",
  uiConfig: {
    docExpansion: "list" as const,
    deepLinking: true,
    displayRequestDuration: true,
    filter: true,
    showExtensions: true,
  },
  staticCSP: true,
  transformStaticCSP: (header: string) => header,
};
