import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";
import { buildThresholds, getProfile } from "../config/profiles.js";

const profile = __ENV.PROFILE || "smoke";
const baseUrl = __ENV.BASE_URL || "http://127.0.0.1:3001";

const profileConfig = getProfile(profile);

const requestDurationTrend = new Trend("custom_request_duration", true);
const appErrorRate = new Rate("app_error_rate");
const endpointFailures = new Counter("endpoint_failures");

export const options = {
  scenarios: profileConfig.scenarios,
  thresholds: buildThresholds(profile),
  summaryTrendStats: ["avg", "min", "med", "max", "p(90)", "p(95)", "p(99)"],
};

function endpointRequest(path, endpointTag) {
  const res = http.get(`${baseUrl}${path}`, {
    tags: { endpoint: endpointTag, profile },
    timeout: "10s",
  });

  requestDurationTrend.add(res.timings.duration, { endpoint: endpointTag });

  const ok = check(res, {
    "status is < 500": (r) => r.status < 500,
    "response time under 2s": (r) => r.timings.duration < 2000,
  });

  if (!ok) {
    endpointFailures.add(1, { endpoint: endpointTag });
  }

  appErrorRate.add(res.status >= 500 ? 1 : 0, { endpoint: endpointTag });
  return res;
}

export default function () {
  endpointRequest("/health", "health_root");
  endpointRequest("/health/live", "health_live");

  // readiness hits DB/Redis checks and helps identify dependency bottlenecks
  if (__ITER % 2 === 0) {
    endpointRequest("/health/ready", "health_ready");
  }

  if (profile !== "smoke" && __ITER % 3 === 0) {
    endpointRequest("/health/detailed", "health_detailed");
  }

  sleep(Math.random() * 0.4 + 0.1);
}

export function handleSummary(data) {
  const summaryJson = __ENV.SUMMARY_JSON || "load-tests/results/summary.json";
  const summaryTxt = __ENV.SUMMARY_TXT || "load-tests/results/summary.txt";

  const report = {
    profile,
    baseUrl,
    generatedAt: new Date().toISOString(),
    metrics: data.metrics,
    rootGroup: data.root_group,
  };

  const httpDuration = data.metrics.http_req_duration?.values || {};
  const httpFailures = data.metrics.http_req_failed?.values || {};

  const textSummary = [
    `Load Test Profile: ${profile}`,
    `Base URL: ${baseUrl}`,
    `Generated At: ${report.generatedAt}`,
    "",
    "Topline Metrics:",
    `- http_req_duration p95: ${httpDuration["p(95)"] ?? "n/a"} ms`,
    `- http_req_duration p99: ${httpDuration["p(99)"] ?? "n/a"} ms`,
    `- http_req_failed rate: ${httpFailures.rate ?? "n/a"}`,
  ].join("\n");

  return {
    [summaryJson]: JSON.stringify(report, null, 2),
    [summaryTxt]: textSummary,
    stdout: `${textSummary}\n`,
  };
}
