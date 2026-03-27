import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { redis } from "../../utils/redis.js";
import { logger } from "../../utils/logger.js";
import { config } from "../../config/index.js";

export type RateLimitTier = "free" | "standard" | "premium" | "trusted";

export interface TierConfig {
  requests: number;
  windowMs: number;
  burst: number;
}

// Per-tier request budgets
export const RATE_LIMIT_TIERS: Record<RateLimitTier, TierConfig> = {
  free:    { requests: 60,       windowMs: 60_000, burst: 10  },
  standard:{ requests: 300,      windowMs: 60_000, burst: 30  },
  premium: { requests: 1_000,    windowMs: 60_000, burst: 100 },
  trusted: { requests: Infinity, windowMs: 60_000, burst: 0   },
};

// Stricter per-endpoint overrides — most restrictive value wins vs. tier limit
const ENDPOINT_OVERRIDES: Record<string, Pick<TierConfig, "requests" | "windowMs">> = {
  "/api/v1/circuit-breaker": { requests: 30,  windowMs: 60_000 },
  "/api/v1/alerts":          { requests: 50,  windowMs: 60_000 },
  "/api/v1/jobs":            { requests: 20,  windowMs: 60_000 },
  "/api/v1/bridges":         { requests: 100, windowMs: 60_000 },
  "/api/v1/assets":          { requests: 120, windowMs: 60_000 },
};

// Paths exempt from rate limiting
const EXCLUDED_PATHS = new Set(["/health"]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getIdentifier(request: FastifyRequest): { id: string; isApiKey: boolean } {
  const apiKey = request.headers["x-api-key"];
  if (apiKey && typeof apiKey === "string" && apiKey.length > 0) {
    return { id: `key:${apiKey}`, isApiKey: true };
  }
  const forwarded = request.headers["x-forwarded-for"];
  const ip =
    typeof forwarded === "string" ? forwarded.split(",")[0].trim() : request.ip;
  return { id: `ip:${ip}`, isApiKey: false };
}

function parseKeyTiers(raw: string): Record<string, string> {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function getTier(identifier: string, isApiKey: boolean): RateLimitTier {
  if (!isApiKey) return "free";

  const apiKey = identifier.slice("key:".length);

  const whitelistedKeys = config.RATE_LIMIT_WHITELIST_KEYS
    ? config.RATE_LIMIT_WHITELIST_KEYS.split(",").map((k) => k.trim())
    : [];
  if (whitelistedKeys.includes(apiKey)) return "trusted";

  const tierMap = config.RATE_LIMIT_KEY_TIERS
    ? parseKeyTiers(config.RATE_LIMIT_KEY_TIERS)
    : {};
  const assigned = tierMap[apiKey] as RateLimitTier | undefined;
  return assigned && assigned in RATE_LIMIT_TIERS ? assigned : "standard";
}

function isWhitelistedIp(request: FastifyRequest): boolean {
  if (!config.RATE_LIMIT_WHITELIST_IPS) return false;
  const allowed = config.RATE_LIMIT_WHITELIST_IPS.split(",").map((s) => s.trim());
  const forwarded = request.headers["x-forwarded-for"];
  const ip =
    typeof forwarded === "string" ? forwarded.split(",")[0].trim() : request.ip;
  return allowed.includes(ip);
}

function matchEndpoint(url: string): string | null {
  for (const prefix of Object.keys(ENDPOINT_OVERRIDES)) {
    if (url.startsWith(prefix)) return prefix;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Sliding window (Redis sorted-set)
// ---------------------------------------------------------------------------

interface WindowResult {
  allowed: boolean;
  current: number;
}

async function slidingWindow(
  key: string,
  limit: number,
  windowMs: number,
  burst: number
): Promise<WindowResult | null> {
  const now = Date.now();
  const windowStart = now - windowMs;
  const effectiveLimit = limit + burst;
  // Unique member so concurrent requests don't collide on the same timestamp
  const member = `${now}:${Math.random().toString(36).slice(2)}`;

  try {
    const pipeline = redis.pipeline();
    pipeline.zremrangebyscore(key, 0, windowStart);
    pipeline.zadd(key, now, member);
    pipeline.zcard(key);
    pipeline.expire(key, Math.ceil(windowMs / 1000) + 1);
    const results = await pipeline.exec();

    const current = (results?.[2]?.[1] as number) ?? 0;
    return { allowed: current <= effectiveLimit, current };
  } catch (err) {
    logger.warn({ err }, "Redis unavailable for rate limiting — degrading gracefully");
    return null;
  }
}

// ---------------------------------------------------------------------------
// Metrics (best-effort, non-blocking)
// ---------------------------------------------------------------------------

async function recordMetrics(
  identifier: string,
  endpoint: string,
  limited: boolean
): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  const ttl = 86_400 * 7; // 7-day retention
  try {
    const p = redis.pipeline();
    p.incr(`metrics:rl:total:${day}`);
    p.expire(`metrics:rl:total:${day}`, ttl);
    p.incr(`metrics:rl:endpoint:${endpoint}:${day}`);
    p.expire(`metrics:rl:endpoint:${endpoint}:${day}`, ttl);
    if (limited) {
      p.incr(`metrics:rl:limited:${day}`);
      p.expire(`metrics:rl:limited:${day}`, ttl);
      p.incr(`metrics:rl:limited_by:${identifier}:${day}`);
      p.expire(`metrics:rl:limited_by:${identifier}:${day}`, ttl);
    }
    await p.exec();
  } catch {
    // metrics are non-critical
  }
}

export async function getRateLimitMetrics(): Promise<Record<string, number>> {
  const day = new Date().toISOString().slice(0, 10);
  try {
    const keys = await redis.keys(`metrics:rl:*:${day}`);
    if (!keys.length) return {};
    const values = await redis.mget(...keys);
    return Object.fromEntries(
      keys.map((k, i) => [k.replace(`:${day}`, ""), Number(values[i] ?? 0)])
    );
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Fastify plugin
// ---------------------------------------------------------------------------

export async function registerRateLimiting(server: FastifyInstance): Promise<void> {
  server.addHook(
    "preHandler",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const url = request.url.split("?")[0];

      if (EXCLUDED_PATHS.has(url)) return;
      if (isWhitelistedIp(request)) return;

      const { id: identifier, isApiKey } = getIdentifier(request);
      const tier = getTier(identifier, isApiKey);

      if (tier === "trusted") return;

      const tierConfig = RATE_LIMIT_TIERS[tier];
      const endpointKey = matchEndpoint(url);
      const override = endpointKey ? ENDPOINT_OVERRIDES[endpointKey] : null;

      // Most restrictive limit wins
      const limit = override
        ? Math.min(tierConfig.requests, override.requests)
        : tierConfig.requests;
      const windowMs = override?.windowMs ?? tierConfig.windowMs;
      const burst = tierConfig.burst;
      const effectiveLimit = limit + burst;
      const resetAt = Math.ceil((Date.now() + windowMs) / 1000);

      reply.header("X-RateLimit-Limit", limit);
      reply.header("X-RateLimit-Burst", burst);
      reply.header("X-RateLimit-Reset", resetAt);
      reply.header("X-RateLimit-Policy", `${limit};w=${windowMs / 1000};burst=${burst}`);

      const redisKey = `rl:${identifier}:${endpointKey ?? "global"}`;
      const result = await slidingWindow(redisKey, limit, windowMs, burst);

      if (result === null) {
        // Redis is down — allow request, mark remaining as unknown
        reply.header("X-RateLimit-Remaining", "unknown");
        await recordMetrics(identifier, endpointKey ?? "global", false);
        return;
      }

      const remaining = Math.max(0, effectiveLimit - result.current);
      reply.header("X-RateLimit-Remaining", remaining);

      if (!result.allowed) {
        await recordMetrics(identifier, endpointKey ?? "global", true);
        reply.header("Retry-After", Math.ceil(windowMs / 1000));
        return reply.status(429).send({
          error: "Too Many Requests",
          message: "Rate limit exceeded. Please slow down.",
          retryAfter: Math.ceil(windowMs / 1000),
          limit,
          burst,
          windowMs,
        });
      }

      await recordMetrics(identifier, endpointKey ?? "global", false);
    }
  );
}
