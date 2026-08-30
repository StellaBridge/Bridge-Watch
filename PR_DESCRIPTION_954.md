Closes #954

## What changed
- `backend/tests/services/externalRateLimitMetrics.service.test.ts`
  (new): unit tests for ExternalRateLimitMetricsService covering
  DB-backed rate limit tracking, hourly-bucket trend aggregation,
  threshold-based alert generation, and config upsert.

## Service behaviour tested
Public methods covered: `recordUsage`, `getProviderSnapshots`, `getTrend`, `getAlerts`, `setAlertThreshold`, `exportMetrics`

## Test breakdown
| Category | Tests |
|---|---|
| Window initialisation (recordUsage) | 9 |
| Bucket increments (getProviderSnapshots aggregation) | 5 |
| Trend hourly bucket aggregation (getTrend) | 3 |
| Rate limit exceeded / alert boundaries (getAlerts) | 7 |
| Threshold configuration (setAlertThreshold) | 4 |
| Export (exportMetrics) | 1 |
| Total | 29 |

## Timer strategy
None needed — the service has no timers, setTimeout, or setInterval. All time-window logic is SQL-driven (Date.now() in getProviderSnapshots and getTrend). Adjacent service tests confirmed no fake timers are used for this pattern.

## Mock strategy for external dependencies
- `vi.mock("../../src/database/connection.js")`: DB mocked with chainable Knex query builder (pattern from externalDependencyMonitor.service.test.ts)
- `vi.mock("../../src/utils/logger.js")`: Logger silenced with vi.fn() stubs
- `vi.mock("crypto")`: deterministic randomBytes for repeatable IDs

## Vacuousness confirmation
- Window empty test: confirmed non-vacuous — fails when mock data is returned instead of empty array
- Alert threshold tests: confirmed non-vacuous — fail when threshold values are misaligned

## Test results
29 tests: all pass ✓
0 regressions in existing test suite ✓

## Additional findings
None.