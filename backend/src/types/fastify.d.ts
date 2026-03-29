import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    apiKeyAuth?: {
      id: string;
      name: string;
      scopes: string[];
      rateLimitPerMinute: number;
      source: "api-key" | "bootstrap";
    };
  }

  interface FastifySchema {
    hide?: boolean;
    deprecated?: boolean;
    tags?: readonly string[];
    description?: string;
    summary?: string;
    consumes?: readonly string[];
    produces?: readonly string[];
    externalDocs?: Record<string, unknown>;
    security?: ReadonlyArray<Record<string, readonly string[]>>;
    operationId?: string;
  }

  interface RouteShorthandOptions {
    websocket?: boolean;
  }
}
