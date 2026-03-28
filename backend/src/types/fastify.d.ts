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
}
