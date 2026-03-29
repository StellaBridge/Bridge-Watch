# Load Testing Methodology

This document defines how Bridge-Watch performance is validated and how regressions are detected.

## Objectives

- Validate behavior under normal and burst traffic.
- Detect latency and error-rate regressions early in CI.
- Surface bottlenecks in dependency checks and response times.

## Tooling

- Primary load tool: k6
- Test scripts: load-tests/scenarios/api-load.js
- Baseline configuration: load-tests/config/baselines.js
- Report generation: load-tests/scripts/generate-report.mjs

## Scenario Definitions

1. smoke
- Purpose: fast pull request validation.
- Shape: short ramping VU scenario.

2. ramp
- Purpose: gradual ramp-up and capacity characterization.
- Shape: staged VU increases to steady high load.

3. spike
- Purpose: burst tolerance and recovery behavior.
- Shape: abrupt arrival-rate jump and cooldown.

4. endurance
- Purpose: sustained-load stability.
- Shape: constant arrival rate for a long duration.

## Baselines and Gates

Baselines are profile-specific and include:

- p95 latency threshold
- p99 latency threshold
- failed-request rate threshold
- checks pass-rate threshold

A run is considered a regression when one or more thresholds are violated.

## Resource Monitoring Approach

During CI runs we collect process-level backend snapshots:

- PID
- CPU percent
- memory percent
- RSS
- elapsed runtime

These snapshots are uploaded as artifacts alongside load-test reports.

## Bottleneck Identification

The report generator compares actual metrics to profile baseline values and highlights the first failing metric as a likely bottleneck signal.

## CI/CD Integration

The load testing workflow:

- builds and starts backend
- waits for health endpoint readiness
- executes k6 profile
- generates markdown report
- uploads artifacts

PRs run smoke profile; larger profiles are available via manual workflow dispatch.

## Execution Guidance

- Run smoke for every feature PR.
- Run ramp and spike before release branches.
- Run endurance for release candidates or after major infra changes.
