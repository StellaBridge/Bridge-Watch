import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Gauge, Rate, Trend } from "k6/metrics";

const baseUrl = __ENV.BASE_URL || "http://127.0.0.1:3001";
const targetVus = Number(__ENV.TARGET_VUS || 500);
const rampUp = __ENV.RAMP_UP || "2m";
const hold = __ENV.HOLD || "7m";
const rampDown = __ENV.RAMP_DOWN || "1m";
const redisExporterUrl = __ENV.REDIS_EXPORTER_URL;
const cacheHeader = (__ENV.CACHE_HEADER || "x-cache").toLowerCase();
const cacheQuery = __ENV.CACHE_QUERY || "allbridge stellar usdc";
const cacheVerificationEnabled = (__ENV.VERIFY_CACHE || "true") === "true";

const chains = ["stellar", "ethereum", "polygon", "arbitrum", "base"];
const assets = ["USDC", "XLM", "ETH", "BTC", "USDT"];
const statuses = ["active", "pending", "verified", "failed"];
const types = ["asset", "bridge", "incident", "alert"];
const queries = ["allbridge", "stellar bridge", "usdc", "soroban", "liquidity pool", "xlm deposit"];

const searchDuration = new Trend("search_query_duration", true);
const serverErrors = new Counter("search_server_errors");
const cacheHitRate = new Rate("search_cache_hit_rate");
const cacheSignal = new Rate("search_cache_signal");
const redisHits = new Gauge("redis_keyspace_hits_total");

const scenarios = {
  search_concurrency: {
    executor: "ramping-vus",
    exec: "searchConcurrency",
    startVUs: 0,
    stages: [
      { duration: rampUp, target: targetVus },
      { duration: hold, target: targetVus },
      { duration: rampDown, target: 0 },
    ],
    gracefulRampDown: "30s",
  },
};

if (cacheVerificationEnabled) {
  scenarios.cache_verification = {
    executor: "constant-vus",
    exec: "enableCacheVerification",
    vus: 1,
    duration: "10m",
  };
}

const thresholds = {
  search_query_duration: ["p(95)<150"],
  search_server_errors: ["count==0"],
  checks: ["rate>0.99"],
  "http_req_duration{endpoint:search}": ["p(95)<150"],
};

if (cacheVerificationEnabled) {
  thresholds.search_cache_hit_rate = ["rate>0.95"];
}

export const options = {
  scenarios,
  thresholds,
  summaryTrendStats: ["avg", "min", "med", "max", "p(90)", "p(95)", "p(99)"],
};

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function searchRequest(query) {
  const chain = randomItem(chains);
  const asset = randomItem(assets);
  const status = randomItem(statuses);
  const type = randomItem(types);
  const limit = Math.floor(Math.random() * 20) + 10;

  const payload = {
    query,
    type,
    limit,
    fuzzy: Math.random() > 0.5,
    filters: { chain, asset, status },
  };

  return http.post(
    `${baseUrl}/api/v1/search`,
    JSON.stringify(payload),
    {
      tags: { endpoint: "search", chain, asset, status, type },
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      timeout: "10s",
    }
  );
}

function recordResult(res) {
  searchDuration.add(res.timings.duration, { endpoint: "search" });
  serverErrors.add(res.status >= 500 ? 1 : 0, { endpoint: "search" });
  check(res, {
    "search status is 2xx": (r) => r.status >= 200 && r.status < 300,
    "search responds under 150ms": (r) => r.timings.duration < 150,
  });
}

export function searchConcurrency() {
  recordResult(searchRequest(randomItem(queries)));
  sleep(0.1 + Math.random() * 0.4);
}

function sampleRedisHits() {
  if (!redisExporterUrl) return 0;
  const res = http.get(redisExporterUrl, { tags: { endpoint: "redis_exporter" } });
  const match = /^redis_keyspace_hits_total\s+(\S+)/m.exec(res.body || "");
  if (!match) return 0;
  const value = Number(match[1]);
  redisHits.add(value);
  return value;
}

export function enableCacheVerification() {
  const url = `${baseUrl}/api/v1/search?q=${encodeURIComponent(cacheQuery)}&type=asset&limit=20&fuzzy=false`;
  const params = { tags: { endpoint: "search_cache" }, headers: { Accept: "application/json" } };

  const before = sampleRedisHits();
  let first;
  for (let i = 0; i < 5; i++) {
    first = http.get(url, params);
    sleep(0.05);
  }
  const after = sampleRedisHits();

  check(first, { "cached search status is 2xx": (r) => r.status >= 200 && r.status < 300 });

  const header = first.headers[cacheHeader];
  const hasHeader = header !== undefined && header !== null;
  const hasExporter = Boolean(redisExporterUrl && after > before);
  cacheSignal.add(hasHeader || hasExporter);

  if (hasHeader) {
    cacheHitRate.add(/hit/i.test(String(header)));
  } else {
    cacheHitRate.add(hasExporter);
  }

  sleep(1);
}

export function handleSummary(data) {
  const summaryJson = __ENV.SUMMARY_JSON || "load-tests/results/search-concurrency-summary.json";
  const duration = data.metrics.search_query_duration?.values || {};
  const summary = [
    "Search endpoint concurrency (#1734)",
    `Target VUs: ${targetVus}`,
    `p95 search duration: ${duration["p(95)"] ?? "n/a"} ms (target < 150 ms)`,
    `Server errors: ${data.metrics.search_server_errors?.values?.count ?? "n/a"}`,
    `Redis cache signal observed: ${data.metrics.search_cache_signal?.values?.rate ?? "n/a"}`,
  ].join("\n");

  return {
    [summaryJson]: JSON.stringify(data, null, 2),
    stdout: `${summary}\n`,
  };
}
