import fs from "node:fs";
import path from "node:path";

const BASELINES = {
  smoke: {
    httpReqDurationP95Ms: 600,
    httpReqDurationP99Ms: 1200,
    httpReqFailedRate: 0.01,
    checksRate: 0.99,
  },
  ramp: {
    httpReqDurationP95Ms: 800,
    httpReqDurationP99Ms: 1500,
    httpReqFailedRate: 0.02,
    checksRate: 0.98,
  },
  spike: {
    httpReqDurationP95Ms: 1200,
    httpReqDurationP99Ms: 2500,
    httpReqFailedRate: 0.03,
    checksRate: 0.97,
  },
  endurance: {
    httpReqDurationP95Ms: 900,
    httpReqDurationP99Ms: 1800,
    httpReqFailedRate: 0.02,
    checksRate: 0.98,
  },
};

const summaryPath = process.argv[2] || "load-tests/results/summary.json";
const reportPath = process.argv[3] || "load-tests/results/report.md";

if (!fs.existsSync(summaryPath)) {
  console.error(`Summary file not found: ${summaryPath}`);
  process.exit(1);
}

const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
const profile = summary.profile || "smoke";
const baseline = BASELINES[profile] || BASELINES.smoke;

const metrics = summary.metrics || {};
const duration = metrics.http_req_duration?.values || {};
const failures = metrics.http_req_failed?.values || {};
const checks = metrics.checks?.values || {};

const p95 = Number(duration["p(95)"] || 0);
const p99 = Number(duration["p(99)"] || 0);
const failRate = Number(failures.rate || 0);
const checkRate = Number(checks.rate || 0);

const assertions = [
  {
    name: "http_req_duration p95",
    actual: p95,
    baseline: baseline.httpReqDurationP95Ms,
    passed: p95 <= baseline.httpReqDurationP95Ms,
    operator: "<=",
    unit: "ms",
  },
  {
    name: "http_req_duration p99",
    actual: p99,
    baseline: baseline.httpReqDurationP99Ms,
    passed: p99 <= baseline.httpReqDurationP99Ms,
    operator: "<=",
    unit: "ms",
  },
  {
    name: "http_req_failed rate",
    actual: failRate,
    baseline: baseline.httpReqFailedRate,
    passed: failRate <= baseline.httpReqFailedRate,
    operator: "<=",
    unit: "ratio",
  },
  {
    name: "checks pass rate",
    actual: checkRate,
    baseline: baseline.checksRate,
    passed: checkRate >= baseline.checksRate,
    operator: ">=",
    unit: "ratio",
  },
];

const worstAssertion = assertions.find((item) => !item.passed);

const lines = [];
lines.push("# Load Testing Report");
lines.push("");
lines.push(`- Profile: ${profile}`);
lines.push(`- Generated at: ${summary.generatedAt}`);
lines.push(`- Summary source: ${path.resolve(summaryPath)}`);
lines.push("");
lines.push("## Baseline Comparison");
lines.push("");
lines.push("| Metric | Actual | Baseline | Rule | Status |");
lines.push("|---|---:|---:|---|---|");
for (const item of assertions) {
  const status = item.passed ? "PASS" : "FAIL";
  lines.push(
    `| ${item.name} | ${item.actual.toFixed(3)} ${item.unit} | ${item.baseline} ${item.unit} | ${item.operator} | ${status} |`
  );
}
lines.push("");

if (worstAssertion) {
  lines.push("## Bottleneck Signal");
  lines.push("");
  lines.push(
    `Detected likely bottleneck from ${worstAssertion.name}: actual ${worstAssertion.actual.toFixed(3)} ${worstAssertion.unit}, expected ${worstAssertion.operator} ${worstAssertion.baseline} ${worstAssertion.unit}.`
  );
} else {
  lines.push("## Bottleneck Signal");
  lines.push("");
  lines.push("No bottleneck threshold breach detected for this profile.");
}

fs.writeFileSync(reportPath, `${lines.join("\n")}\n`, "utf8");
console.log(`Load report generated: ${reportPath}`);
