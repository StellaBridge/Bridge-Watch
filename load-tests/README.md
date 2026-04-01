# Load Testing Framework

This directory contains the load testing framework for Bridge-Watch using k6.

## Profiles

- smoke: fast PR validation profile
- ramp: gradual ramp-up scenario
- spike: sudden traffic burst scenario
- endurance: sustained traffic over time

## Quick Start

1. Start the backend service locally.
2. Run smoke test:

```bash
k6 run load-tests/scenarios/api-load.js -e PROFILE=smoke -e BASE_URL=http://127.0.0.1:3001
```

3. Export report:

```bash
k6 run load-tests/scenarios/api-load.js \
  -e PROFILE=smoke \
  -e BASE_URL=http://127.0.0.1:3001 \
  -e SUMMARY_JSON=load-tests/results/summary.json \
  -e SUMMARY_TXT=load-tests/results/summary.txt
node load-tests/scripts/generate-report.mjs load-tests/results/summary.json load-tests/results/report.md
```

## Scenario Coverage

- Gradual ramp-up tests: profile ramp
- Spike testing: profile spike
- Endurance testing: profile endurance
- Resource/dependency stress signal: readiness and detailed health endpoints under load

## Regression Detection

Baseline thresholds are defined in load-tests/config/baselines.js and enforced in k6 thresholds.
A run fails automatically when thresholds are breached.
