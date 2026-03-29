# Performance Baselines

Baseline values for load-testing profiles are intentionally conservative and should be updated using production-like measurements.

## Current Baselines

| Profile | p95 latency | p99 latency | failed request rate | checks pass rate |
|---|---:|---:|---:|---:|
| smoke | 600 ms | 1200 ms | < 1.0% | > 99.0% |
| ramp | 800 ms | 1500 ms | < 2.0% | > 98.0% |
| spike | 1200 ms | 2500 ms | < 3.0% | > 97.0% |
| endurance | 900 ms | 1800 ms | < 2.0% | > 98.0% |

Source of truth: load-tests/config/baselines.js

## Updating Baselines

1. Run ramp and endurance tests in an environment representative of production.
2. Collect at least three runs per profile.
3. Use p95/p99 medians across runs for candidate baseline values.
4. Set baseline slightly above observed medians to avoid flaky regression alerts.
5. Update load-tests/config/baselines.js and this document in the same change.
