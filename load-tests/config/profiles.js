import { getBaseline } from "./baselines.js";

export const PROFILES = {
  smoke: {
    description: "Fast PR validation profile",
    scenarios: {
      smoke: {
        executor: "ramping-vus",
        startVUs: 1,
        stages: [
          { duration: "15s", target: 5 },
          { duration: "30s", target: 10 },
          { duration: "15s", target: 0 },
        ],
        gracefulRampDown: "10s",
      },
    },
  },
  ramp: {
    description: "Gradual traffic ramp-up profile",
    scenarios: {
      ramp_up: {
        executor: "ramping-vus",
        startVUs: 0,
        stages: [
          { duration: "1m", target: 20 },
          { duration: "2m", target: 60 },
          { duration: "2m", target: 100 },
          { duration: "1m", target: 0 },
        ],
        gracefulRampDown: "30s",
      },
    },
  },
  spike: {
    description: "Sudden demand spike profile",
    scenarios: {
      spike_test: {
        executor: "ramping-arrival-rate",
        startRate: 10,
        timeUnit: "1s",
        preAllocatedVUs: 50,
        maxVUs: 300,
        stages: [
          { duration: "30s", target: 20 },
          { duration: "20s", target: 250 },
          { duration: "40s", target: 30 },
        ],
      },
    },
  },
  endurance: {
    description: "Long-running sustained load profile",
    scenarios: {
      endurance: {
        executor: "constant-arrival-rate",
        rate: 35,
        timeUnit: "1s",
        duration: "20m",
        preAllocatedVUs: 60,
        maxVUs: 240,
      },
    },
  },
};

export function getProfile(name) {
  return PROFILES[name] || PROFILES.smoke;
}

export function buildThresholds(profile) {
  const baseline = getBaseline(profile);
  return {
    checks: [`rate>${baseline.checksRate}`],
    http_req_failed: [`rate<${baseline.httpReqFailedRate}`],
    http_req_duration: [
      `p(95)<${baseline.httpReqDurationP95Ms}`,
      `p(99)<${baseline.httpReqDurationP99Ms}`,
    ],
    "http_req_duration{endpoint:health_root}": [`p(95)<${baseline.httpReqDurationP95Ms}`],
    "http_req_duration{endpoint:health_live}": [`p(95)<${baseline.httpReqDurationP95Ms}`],
    "http_req_duration{endpoint:health_ready}": [`p(95)<${baseline.httpReqDurationP95Ms}`],
  };
}
