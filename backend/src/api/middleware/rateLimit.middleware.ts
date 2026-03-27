import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { redis } from "../../utils/redis.js";
import { logger } from "../../utils/logger.js";
import { config } from "../../config/index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RateLimitTier = "free" | "basic" | "premium" | "trusted";
export type EndpointCategory = "read" | "write" | "admin" | "websocket";

export interface TierLimits {
  requestsPerWindow: number;
  windowMs: number;
  burstAllowance: number;
}

export interface RateLimitResult {
  allowed: boolean;
  current: number;
  limit: number;
  remaining: number;
  resetMs: number;
  retryAfterMs?: number;
}

export interface RateLimitMetrics {
  totalRequests: number;
  blockedRequests: number;
  whitelistedRequests: number;
  byTier: Record<RateLimitTier, number>;
  byRouteGroup: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Tier configuration
// Burst allowance = additional requests beyond the window limit before hard
// blocking, giving clients a short grace buffer for bursty traffic.
// ---------------------------------------------------------------------------

export const TIER_LIMITS: Record<Exclude<RateLimitTier, "trusted">, TierLimits> = {
  free: {
    requestsPerWindow: config.RATE_LIMIT_MAX,
    windowMs: config.RATE_LIMIT_WINDOW_MS,
    burstAllowance: Math.floor(config.RATE_LIMIT_MAX * config.RATE_LIMIT_BURST_MULTIPLIER),
  },
  basic: {
    requestsPerWindow: config.RATE_LIMIT_MAX * 3,
    windowMs: config.RATE_LIMIT_WINDOW_MS,
    burstAllowance: Math.floor(config.RATE_LIMIT_MAX * 3 * config.RATE_LIMIT_BURST_MULTIPLIER),
  },
  premium: {
    requestsPerWindow: config.RATE_LIMIT_MAX * 10,
    windowMs: config.RATE_LIMIT_WINDOW_MS,
    burstAllowance: Math.floor(config.RATE_LIMIT_MAX * 10 * config.RATE_LIMIT_BURST_MULTIPLIER),
  },
};

// Per-endpoint-category multiplier applied to tier limits.
// Values < 1 make that category stricter relative to the tier baseline.
const ENDPOINT_MULTIPLIERS: Record<EndpointCategory, number> = {
  read: 1.0,
  write: 0.3,      // mutating endpoints are more restrictive
  admin: 0.1,      // admin/circuit-breaker operations are very restrictive
  websocket: 0.5,  // WebSocket handshake / upgrade limit
};

// ---------------------------------------------------------------------------
// Redis sliding-window Lua script
//
// Uses a sorted set keyed by `key` where each member is a unique token and
// its score is the request timestamp in milliseconds.
//
// Returns a 4-element array:  {allowed, current_count, reset_ms, effective_limit}
//   allowed  – 1 if the request is permitted, 0 if it should be rejected
// ---------------------------------------------------------------------------

const SLIDING_WINDOW_SCRIPT = `
local key     = KEYS[1]
local now     = tonumber(ARGV[1])
local window  = tonumber(ARGV[2])
local limit   = tonumber(ARGV[3])
local burst   = tonumber(ARGV[4])

-- Evict entries that have left the sliding window
redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)

local current        = tonumber(redis.call('ZCARD', key))
local effective_limit = limit + burst

if current >= effective_limit then
  -- Tell the client when the oldest request will expire (≈ next slot opens)
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local reset_ms = now + window
  if oldest and oldest[2] then
    reset_ms = tonumber(oldest[2]) + window
  end
  return {0, current, reset_ms, limit}
end

-- Use Redis server time for a microsecond-granularity unique member
local t      = redis.call('TIME')
local member = tostring(now) .. ':' .. tostring(t[2])

redis.call('ZADD', key, now, member)
-- Keep the key alive slightly longer than the window so stragglers don't
-- find a missing key and reset their counters prematurely.
redis.call('PEXPIRE', key, window + 1000)

return {1, current + 1, now + window, limit}
`;

// ---------------------------------------------------------------------------
// In-memory metrics
// ---------------------------------------------------------------------------

const metrics: RateLimitMetrics = {
  totalRequests: 0,
  blockedRequests: 0,
  whitelistedRequests: 0,
  byTier: { free: 0, basic: 0, premium: 0, trusted: 0 },
  byRouteGroup: {},
};

export function getRateLimitMetrics(): Readonly<RateLimitMetrics> {
  return {
    ...metrics,
    byTier: { ...metrics.byTier },
    byRouteGroup: { ...metrics.byRouteGroup },
  };
}

// ---------------------------------------------------------------------------
// Whitelist helpers
// ---------------------------------------------------------------------------

function buildWhitelist(): { ips: Set<string>; keys: Set<string> } {
  const split = (raw: string | undefined): string[] =>
    raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [];

  return {
    ips: new Set(split(config.RATE_LIMIT_WHITELIST_IPS)),
    keys: new Set(split(config.RATE_LIMIT_WHITELIST_KEYS)),
  };
}

// ---------------------------------------------------------------------------
// Request classification helpers
// ---------------------------------------------------------------------------

function getEndpointCategory(method: string, url: string): EndpointCategory {
  const path = url.split("?")[0];

  if (path.startsWith("/api/v1/ws")) return "websocket";

  if (/\/api\/v1\/circuit-breaker\/(pause|recovery)/.test(path)) return "admin";

  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) return "write";

  return "read";
}

function getRouteGroup(url: string): string {
  const path = url.split("?")[0];
  const match = /^\/api\/v1\/([^/]+)/.exec(path);
  return match ? match[1] : "default";
}

function getTierFromApiKey(apiKey: string | undefined): RateLimitTier {
  if (!apiKey) return "free";
  // Convention: API keys are prefixed with their tier name
  if (apiKey.startsWith("premium_")) return "premium";
  if (apiKey.startsWith("basic_")) return "basic";
  return "free";
}

// ---------------------------------------------------------------------------
// Core sliding-window check (wraps the Lua eval call)
// ---------------------------------------------------------------------------

async function checkSlidingWindow(
  key: string,
  limit: number,
  burstAllowance: number,
  windowMs: number
): Promise<RateLimitResult> {
  const now = Date.now();

  try {
    const raw = (await redis.eval(
      SLIDING_WINDOW_SCRIPT,
      1,
      key,
      String(now),
      String(windowMs),
      String(limit),
      String(burstAllowance)
    )) as [number, number, number, number];

    const [allowed, current, resetMs, effectiveLimit] = raw;
    const remaining = Math.max(0, effectiveLimit - current);

    return {
      allowed: allowed === 1,
      current,
      limit: effectiveLimit,
      remaining,
      resetMs,
      retryAfterMs: allowed === 0 ? Math.max(0, resetMs - now) : undefined,
    };
  } catch (err) {
    // Fail-open on Redis errors: log the issue but do not block legitimate traffic.
    logger.warn({ err, key }, "Rate limit Redis error — failing open");
    return {
      allowed: true,
      current: 0,
      limit,
      remaining: limit,
      resetMs: now + windowMs,
    };
  }
}

// ---------------------------------------------------------------------------
// Fastify plugin
// ---------------------------------------------------------------------------

export async function registerRateLimiting(server: FastifyInstance): Promise<void> {
  const whitelist = buildWhitelist();

  server.addHook("preHandler", async (request: FastifyRequest, reply: FastifyReply) => {
    const ip = request.ip;
    const apiKey = request.headers["x-api-key"] as string | undefined;

    metrics.totalRequests++;

    // ---- Whitelist check (bypass all limiting) ----------------------------
    if (whitelist.ips.has(ip) || (apiKey !== undefined && whitelist.keys.has(apiKey))) {
      metrics.whitelistedRequests++;
      metrics.byTier.trusted++;
      reply.header("X-RateLimit-Tier", "trusted");
      return;
    }

    // ---- Determine tier and endpoint characteristics ----------------------
    const tier = getTierFromApiKey(apiKey);
    const category = getEndpointCategory(request.method, request.url);
    const routeGroup = getRouteGroup(request.url);
    const tierLimits = TIER_LIMITS[tier as keyof typeof TIER_LIMITS];
    const multiplier = ENDPOINT_MULTIPLIERS[category];

    const effectiveLimit = Math.max(1, Math.floor(tierLimits.requestsPerWindow * multiplier));
    const effectiveBurst = Math.max(0, Math.floor(tierLimits.burstAllowance * multiplier));

    // Track metrics
    metrics.byTier[tier]++;
    metrics.byRouteGroup[routeGroup] = (metrics.byRouteGroup[routeGroup] ?? 0) + 1;

    // ---- Per-IP sliding-window check -------------------------------------
    const ipKey = `bw:rl:ip:${ip}:${routeGroup}`;
    const ipResult = await checkSlidingWindow(
      ipKey,
      effectiveLimit,
      effectiveBurst,
      tierLimits.windowMs
    );

    // ---- Per-API-key sliding-window check --------------------------------
    let keyResult: RateLimitResult | undefined;
    if (apiKey !== undefined) {
      const keyKey = `bw:rl:key:${apiKey}:${routeGroup}`;
      keyResult = await checkSlidingWindow(
        keyKey,
        effectiveLimit,
        effectiveBurst,
        tierLimits.windowMs
      );
    }

    // The binding constraint is whichever check is most restrictive.
    const denied = !ipResult.allowed || (keyResult !== undefined && !keyResult.allowed);
    const bindingResult =
      keyResult !== undefined && !keyResult.allowed ? keyResult : ipResult;

    // ---- Standard rate-limit response headers ----------------------------
    reply.header("X-RateLimit-Limit", String(bindingResult.limit));
    reply.header("X-RateLimit-Remaining", String(bindingResult.remaining));
    reply.header(
      "X-RateLimit-Reset",
      String(Math.ceil(bindingResult.resetMs / 1000))
    );
    reply.header(
      "X-RateLimit-Policy",
      `${effectiveLimit};w=${Math.floor(tierLimits.windowMs / 1000)}`
    );
    reply.header("X-RateLimit-Tier", tier);

    // ---- Reject if over limit --------------------------------------------
    if (denied) {
      metrics.blockedRequests++;

      const retryAfterSec = Math.ceil(
        (bindingResult.retryAfterMs ?? tierLimits.windowMs) / 1000
      );
      reply.header("Retry-After", String(retryAfterSec));

      logger.warn(
        {
          ip,
          hasApiKey: apiKey !== undefined,
          tier,
          category,
          routeGroup,
          url: request.url,
          method: request.method,
        },
        "Rate limit exceeded"
      );

      return reply.status(429).send({
        error: "Too Many Requests",
        message: "Rate limit exceeded. Please slow down your requests.",
        retryAfter: retryAfterSec,
        limit: bindingResult.limit,
        remaining: 0,
        resetAt: new Date(bindingResult.resetMs).toISOString(),
      });
    }
  });

  logger.info(
    {
      whitelistedIps: whitelist.ips.size,
      whitelistedKeys: whitelist.keys.size,
      tiers: Object.keys(TIER_LIMITS),
    },
    "Rate limiting middleware registered"
  );
}
