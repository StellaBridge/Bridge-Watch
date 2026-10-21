import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  loggerInfo: vi.fn(),
  updateIncidentSeverity: vi.fn(),
  updateIncidentStatus: vi.fn(),
  createIncident: vi.fn(),
  mapDatabaseRow: vi.fn((row: unknown) => row),
  db: vi.fn(),
}));

vi.mock("../../src/database/connection.js", () => ({
  getDatabase: () => mocks.db,
}));

vi.mock("../../src/services/incident.service.js", () => ({
  IncidentService: vi.fn().mockImplementation(() => ({
    updateIncidentSeverity: mocks.updateIncidentSeverity,
    updateIncidentStatus: mocks.updateIncidentStatus,
    createIncident: mocks.createIncident,
    mapDatabaseRow: mocks.mapDatabaseRow,
  })),
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: { info: mocks.loggerInfo, warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { AlertDeduplicationService } from "../../src/services/alertDeduplication.service.js";
import type { AlertEvent } from "../../src/services/alert.service.js";

/**
 * SCOPE NOTE: the originating ticket describes a "fingerprint" hash and a
 * duplicate-count field on each alert thread. Neither exists in the actual
 * implementation. The real matching key is a plain SQL predicate — asset
 * code, open status, alert type (or an unset source_type), and a 10-minute
 * `created_at` window — and severity never participates in the match at
 * all; it only drives escalation *after* a match is already found. There is
 * also no counter anywhere: a duplicate either escalates the existing
 * incident's severity (if the new alert's priority is higher) or leaves it
 * untouched. Each test below verifies that real mechanism instead of a
 * fingerprint/counter that doesn't exist.
 */

function makeEvent(overrides: Partial<AlertEvent> = {}): AlertEvent {
  return {
    eventId: "evt-1",
    ruleId: "rule-1",
    assetCode: "USDC",
    alertType: "price_deviation",
    priority: "medium",
    triggeredValue: 0.97,
    threshold: 0.99,
    metric: "price",
    time: new Date("2026-06-01T00:00:00Z"),
    webhookDelivered: false,
    onChainEventId: null,
    lifecycleState: "open",
    acknowledgedAt: null,
    acknowledgedBy: null,
    assignedAt: null,
    assignedTo: null,
    closedAt: null,
    closedBy: null,
    closureNote: null,
    updatedAt: new Date("2026-06-01T00:00:00Z"),
    ...overrides,
  } as AlertEvent;
}

interface CapturedQuery {
  whereArgs?: Record<string, unknown>;
  andWhereCalls: unknown[][];
}

function createChain(firstResult: unknown) {
  const captured: CapturedQuery = { andWhereCalls: [] };
  const chain: any = {};
  chain.where = vi.fn().mockImplementation((arg: Record<string, unknown>) => {
    captured.whereArgs = arg;
    return chain;
  });
  chain.andWhere = vi.fn().mockImplementation((...args: unknown[]) => {
    captured.andWhereCalls.push(args);
    return chain;
  });
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.first = vi.fn().mockResolvedValue(firstResult);
  return { chain, captured };
}

const NOW = new Date("2026-06-01T00:10:00Z");

describe("AlertDeduplicationService", () => {
  let service: AlertDeduplicationService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    (AlertDeduplicationService as any).instance = undefined;
    service = AlertDeduplicationService.getInstance();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("matching key ('fingerprint') construction", () => {
    it("matches on assetCode and open status only — severity/priority never appears in the match predicate", async () => {
      const { chain, captured } = createChain(null);
      mocks.db.mockReturnValue(chain);
      mocks.createIncident.mockResolvedValue({ id: "inc-1", bridgeId: "bridge-usdc", severity: "critical" });

      await service.deduplicate(makeEvent({ assetCode: "USDC", priority: "critical" }));

      expect(captured.whereArgs).toEqual({ asset_code: "USDC", status: "open" });
    });

    it("restricts the match to the incoming alert's own alertType (or an unset source_type)", async () => {
      const { chain, captured } = createChain(null);
      mocks.db.mockReturnValue(chain);
      mocks.createIncident.mockResolvedValue({ id: "inc-1" });

      await service.deduplicate(makeEvent({ alertType: "price_deviation" }));

      const callbackCall = captured.andWhereCalls.find(
        (args) => args.length === 1 && typeof args[0] === "function"
      );
      expect(callbackCall).toBeDefined();

      // Run the captured predicate against a tiny fake query-builder to prove
      // it genuinely filters by this event's alertType, not just records one.
      const qbWhere = vi.fn().mockReturnThis();
      const qbOrWhere = vi.fn().mockReturnThis();
      (callbackCall![0] as (qb: unknown) => void)({ where: qbWhere, orWhere: qbOrWhere });

      expect(qbWhere).toHaveBeenCalledWith("source_type", "price_deviation");
      expect(qbOrWhere).toHaveBeenCalledWith("source_type", null);
    });

    it("applies a 10-minute sliding window anchored to the current time", async () => {
      const { chain, captured } = createChain(null);
      mocks.db.mockReturnValue(chain);
      mocks.createIncident.mockResolvedValue({ id: "inc-1" });

      await service.deduplicate(makeEvent());

      const windowCall = captured.andWhereCalls.find((args) => args[0] === "created_at");
      expect(windowCall).toEqual(["created_at", ">=", new Date(NOW.getTime() - 10 * 60 * 1000)]);
    });
  });

  describe("sliding-window duplicate suppression", () => {
    it("suppresses a duplicate by returning the existing incident instead of creating a new one", async () => {
      const existing = {
        id: "inc-existing",
        severity: "medium",
        status: "open",
        assetCode: "USDC",
        bridgeId: "bridge-usdc",
      };
      const { chain } = createChain(existing);
      mocks.db.mockReturnValue(chain);
      mocks.mapDatabaseRow.mockReturnValue(existing);

      const result = await service.deduplicate(makeEvent({ priority: "medium" }));

      expect(result).toBe(existing);
      expect(mocks.createIncident).not.toHaveBeenCalled();
    });

    it("collapses many rapid duplicate alerts into the same single incident thread", async () => {
      // This is the exact scenario the ticket's motivation describes: one
      // incident generating a flood of near-identical alert payloads.
      const existing = {
        id: "inc-existing",
        severity: "high",
        status: "open",
        assetCode: "USDC",
        bridgeId: "bridge-usdc",
      };
      const { chain } = createChain(existing);
      mocks.db.mockReturnValue(chain);
      mocks.mapDatabaseRow.mockReturnValue(existing);

      const results = await Promise.all([
        service.deduplicate(makeEvent({ eventId: "evt-1" })),
        service.deduplicate(makeEvent({ eventId: "evt-2" })),
        service.deduplicate(makeEvent({ eventId: "evt-3" })),
      ]);

      expect(results.every((r) => r.id === "inc-existing")).toBe(true);
      expect(mocks.createIncident).not.toHaveBeenCalled();
    });

    it("allows a new incident once the matching window has expired (cooldown passed)", async () => {
      // A query that finds nothing within the 10-minute window — e.g. the
      // only prior incident for this asset/alertType is older than that —
      // resolves null, exactly as the real SQL created_at filter would
      // produce once the window has elapsed.
      const { chain } = createChain(null);
      mocks.db.mockReturnValue(chain);
      mocks.createIncident.mockResolvedValue({ id: "inc-new", bridgeId: "bridge-usdc", severity: "medium" });

      const result = await service.deduplicate(makeEvent());

      expect(mocks.createIncident).toHaveBeenCalledTimes(1);
      expect(result.id).toBe("inc-new");
    });
  });

  describe("duplicate handling on an existing thread (no counter exists — nearest real behavior is severity escalation)", () => {
    it("escalates severity and reopens investigation when a duplicate carries a higher priority", async () => {
      const existing = { id: "inc-existing", severity: "low", status: "open", assetCode: "USDC", bridgeId: "bridge-usdc" };
      const { chain } = createChain(existing);
      mocks.db.mockReturnValue(chain);
      mocks.mapDatabaseRow.mockReturnValue(existing);

      await service.deduplicate(makeEvent({ priority: "critical" }));

      expect(mocks.updateIncidentSeverity).toHaveBeenCalledWith("inc-existing", "critical");
      expect(mocks.updateIncidentStatus).toHaveBeenCalledWith("inc-existing", "investigating");
    });

    it("leaves the thread untouched when a duplicate's priority is not higher than the existing severity", async () => {
      const existing = { id: "inc-existing", severity: "critical", status: "open", assetCode: "USDC", bridgeId: "bridge-usdc" };
      const { chain } = createChain(existing);
      mocks.db.mockReturnValue(chain);
      mocks.mapDatabaseRow.mockReturnValue(existing);

      await service.deduplicate(makeEvent({ priority: "low" }));

      expect(mocks.updateIncidentSeverity).not.toHaveBeenCalled();
      expect(mocks.updateIncidentStatus).not.toHaveBeenCalled();
    });
  });

  describe("new incident creation when no match exists", () => {
    it("creates a new incident keyed by assetCode and alertType", async () => {
      const { chain } = createChain(null);
      mocks.db.mockReturnValue(chain);
      mocks.createIncident.mockResolvedValue({ id: "inc-1", bridgeId: "bridge-usdc", severity: "medium" });

      await service.deduplicate(
        makeEvent({
          assetCode: "USDC",
          alertType: "price_deviation",
          priority: "medium",
          triggeredValue: 0.97,
          threshold: 0.99,
        })
      );

      expect(mocks.createIncident).toHaveBeenCalledWith(
        expect.objectContaining({
          bridgeId: "bridge-usdc",
          assetCode: "USDC",
          severity: "medium",
          title: "Alert: price_deviation on USDC",
          description: "Triggered value 0.97 exceeded threshold 0.99",
          sourceType: "price_deviation",
        })
      );
    });
  });
});
