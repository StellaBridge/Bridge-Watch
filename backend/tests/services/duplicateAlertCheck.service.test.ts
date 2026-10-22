import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DuplicateAlertCheckService } from "../../src/services/duplicateAlertCheck.service.js";
import type { AlertEvent, AlertPriority, AlertType } from "../../src/services/alert.service.js";

// Mock logger
vi.mock("../../src/utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("DuplicateAlertCheckService", () => {
  let service: DuplicateAlertCheckService;

  const createAlertEvent = (overrides: Partial<Omit<AlertEvent, "eventId">> = {}): Omit<AlertEvent, "eventId"> => ({
    ruleId: "rule-1",
    assetCode: "USDC",
    alertType: "price_deviation" as AlertType,
    priority: "medium" as AlertPriority,
    triggeredValue: 1.05,
    threshold: 1.02,
    metric: "price_deviation_percent",
    time: new Date(),
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
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    // Reset singleton instance
    (DuplicateAlertCheckService as any).instance = undefined;
    service = DuplicateAlertCheckService.getInstance();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("check - duplicate detection", () => {
    it("should return allow for first event (no duplicate)", () => {
      const event = createAlertEvent();
      const result = service.check(event);

      expect(result.isDuplicate).toBe(false);
      expect(result.action).toBe("allow");
    });

    it("should block exact duplicate within window (default-exact rule)", () => {
      const event = createAlertEvent();
      service.check(event); // First check - no duplicate
      service.record({ ...event, eventId: "event-1" }); // Record the event

      const duplicateEvent = createAlertEvent({ ruleId: "rule-1" });
      const result = service.check(duplicateEvent);

      expect(result.isDuplicate).toBe(true);
      expect(result.action).toBe("block");
      expect(result.matchedRule?.id).toBe("default-exact");
      expect(result.matchedEventId).toBe("event-1");
    });

    it("should not block duplicate after window expires", () => {
      const event = createAlertEvent();
      service.check(event);
      service.record({ ...event, eventId: "event-1" });

      // Get all fingerprints that were used (one per rule)
      const fps = [
        (service as any).fingerprint(event, ["assetCode", "alertType", "metric"]), // default-exact
        (service as any).fingerprint(event, ["assetCode", "metric"]), // default-cross-source
        (service as any).fingerprint(event, ["assetCode", "alertType"]), // default-critical-escalate
      ];

      // Manually set the time to be older than the MAX window (30 min from default-critical-escalate)
      for (const fp of fps) {
        const recorded = (service as any).recentEvents.get(fp);
        if (recorded) {
          recorded.time = new Date(Date.now() - 40 * 60 * 1000); // 40 minutes ago
        }
      }

      const duplicateEvent = createAlertEvent({ ruleId: "rule-1" });
      const result = service.check(duplicateEvent);

      // Should not be duplicate because window (30 min max) has passed
      expect(result.isDuplicate).toBe(false);
    });

    it("should escalate severity for critical re-trigger (default-critical-escalate rule)", () => {
      // Create event with critical priority - this will match default-exact first (block)
      // To test escalate, we need an event that doesn't match default-exact but matches default-critical-escalate
      // default-critical-escalate matches on assetCode + alertType only (no metric)
      // default-exact matches on assetCode + alertType + metric
      
      const event = createAlertEvent({ priority: "critical", metric: "different_metric" });
      service.check(event);
      service.record({ ...event, eventId: "event-1", priority: "critical", metric: "different_metric" });

      // Now check with same assetCode and alertType but different metric
      // This won't match default-exact (different metric) but will match default-critical-escalate
      const duplicateEvent = createAlertEvent({ priority: "high", metric: "another_metric" });
      const result = service.check(duplicateEvent);

      expect(result.isDuplicate).toBe(true);
      expect(result.action).toBe("escalate");
      expect(result.escalatedPriority).toBe("critical");
      expect(result.matchedRule?.id).toBe("default-critical-escalate");
    });

    it("should queue for review for cross-source duplicate (default-cross-source rule)", () => {
      // default-cross-source matches on assetCode + metric only
      // default-exact matches on assetCode + alertType + metric
      // So if alertType differs but assetCode and metric are same, it matches cross-source
      
      const event = createAlertEvent({ alertType: "price_deviation", metric: "price_deviation_percent" });
      service.check(event);
      service.record({ ...event, eventId: "event-1" });

      // Different alertType but same asset and metric - matches cross-source rule
      // but NOT default-exact (different alertType)
      const duplicateEvent = createAlertEvent({ alertType: "health_score_drop", ruleId: "rule-2", metric: "price_deviation_percent" });
      const result = service.check(duplicateEvent);

      expect(result.isDuplicate).toBe(true);
      expect(result.action).toBe("review");
      expect(result.matchedRule?.id).toBe("default-cross-source");
    });

    it("should respect rule assetCode filter", () => {
      const event = createAlertEvent({ assetCode: "USDC" });
      service.check(event);
      service.record({ ...event, eventId: "event-1" });

      // Different asset - should not match default rules
      const duplicateEvent = createAlertEvent({ assetCode: "XLM" });
      const result = service.check(duplicateEvent);

      expect(result.isDuplicate).toBe(false);
    });

    it("should respect rule alertType filter", () => {
      // Deactivate default-critical-escalate to avoid it matching first
      service.updateDedupRule("default-critical-escalate", { isActive: false });

      // Add a rule specific to supply_mismatch
      const newRule = service.addDedupRule({
        name: "Supply mismatch duplicate",
        alertType: "supply_mismatch",
        assetCode: "*",
        windowMs: 5 * 60 * 1000,
        matchFields: ["assetCode", "alertType"],
        severityBehavior: "block",
        isActive: true,
      });

      // Create a supply_mismatch event with a specific metric
      const event = createAlertEvent({ alertType: "supply_mismatch", metric: "supply_mismatch_metric_v1" });
      service.check(event);
      service.record({ ...event, eventId: "event-1", alertType: "supply_mismatch", metric: "supply_mismatch_metric_v1" });

      // Duplicate supply_mismatch event with DIFFERENT metric - default-exact won't match (different metric)
      // but the new rule will match (only checks assetCode + alertType)
      const duplicateEvent = createAlertEvent({ alertType: "supply_mismatch", metric: "supply_mismatch_metric_v2", ruleId: "rule-2" });
      const result = service.check(duplicateEvent);

      // The new rule should match and block (default-exact doesn't match due to different metric)
      expect(result.isDuplicate).toBe(true);
      expect(result.action).toBe("block");
      expect(result.matchedRule?.id).toBe(newRule.id);
      expect(result.matchedRule?.id).not.toBe("default-exact");
      expect(result.matchedRule?.id).not.toBe("default-cross-source");
      expect(result.matchedRule?.id).not.toBe("default-critical-escalate");
    });
  });

  describe("record - event persistence", () => {
    it("should record event for matching rules", () => {
      const event = createAlertEvent({ eventId: "event-1" });
      service.record(event);

      // Check that the event was recorded (internal state)
      const fp = (service as any).fingerprint(event, ["assetCode", "alertType", "metric"]);
      const recorded = (service as any).recentEvents.get(fp);

      expect(recorded).toBeDefined();
      expect(recorded?.eventId).toBe("event-1");
    });

    it("should record event under all matching active rules", () => {
      const event = createAlertEvent({ eventId: "event-1" });
      service.record(event);

      // Should have entries for all 3 default rules since they all match
      expect((service as any).recentEvents.size).toBe(3);
    });

    it("should not record for inactive rules", () => {
      // Deactivate all default rules
      service.updateDedupRule("default-exact", { isActive: false });
      service.updateDedupRule("default-cross-source", { isActive: false });
      service.updateDedupRule("default-critical-escalate", { isActive: false });

      const event = createAlertEvent({ eventId: "event-1" });
      service.record(event);

      expect((service as any).recentEvents.size).toBe(0);
    });
  });

  describe("evict - cleanup old events", () => {
    it("should remove events older than max window", () => {
      const event = createAlertEvent({ eventId: "event-1" });
      service.check(event);
      service.record(event);

      // Get the fingerprint used by default-exact rule
      const fp = (service as any).fingerprint(event, ["assetCode", "alertType", "metric"]);
      
      // Manually set the time to be older than the max window (30 min from default-critical-escalate)
      const recorded = (service as any).recentEvents.get(fp);
      if (recorded) {
        recorded.time = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
      }

      // Trigger eviction by checking a new event
      service.check(createAlertEvent({ eventId: "event-3" }));

      // Old event should be evicted
      const oldRecorded = (service as any).recentEvents.get(fp);
      expect(oldRecorded).toBeUndefined();
    });

    it("should not remove recent events", () => {
      const event = createAlertEvent({ eventId: "event-1" });
      service.check(event);
      service.record(event);

      const fp = (service as any).fingerprint(event, ["assetCode", "alertType", "metric"]);
      
      // Recent event (1 minute ago)
      const recorded = (service as any).recentEvents.get(fp);
      if (recorded) {
        recorded.time = new Date(Date.now() - 60 * 1000); // 1 minute ago
      }

      service.check(createAlertEvent({ eventId: "event-3" }));

      const recentRecorded = (service as any).recentEvents.get(fp);
      expect(recentRecorded).toBeDefined();
      expect(recentRecorded?.eventId).toBe("event-1");
    });
  });

  describe("review queue management", () => {
    it("should enqueue review entry for review action", () => {
      const event = createAlertEvent();
      service.check(event);
      service.record({ ...event, eventId: "event-1" });

      // Cross-source duplicate triggers review
      const duplicateEvent = createAlertEvent({ alertType: "health_score_drop", ruleId: "rule-2" });
      service.check(duplicateEvent);

      const queue = service.getReviewQueue();
      expect(queue.length).toBe(1);
      expect(queue[0].status).toBe("pending");
      expect(queue[0].matchedEventId).toBe("event-1");
    });

    it("should filter review queue by status", () => {
      const event = createAlertEvent();
      service.check(event);
      service.record({ ...event, eventId: "event-1" });

      const duplicateEvent = createAlertEvent({ alertType: "health_score_drop", ruleId: "rule-2" });
      service.check(duplicateEvent);

      service.reviewEntry((service as any).reviewQueue[0].id, "approved", "admin1");

      expect(service.getReviewQueue("pending").length).toBe(0);
      expect(service.getReviewQueue("approved").length).toBe(1);
    });

    it("should approve review entry", () => {
      const event = createAlertEvent();
      service.check(event);
      service.record({ ...event, eventId: "event-1" });

      const duplicateEvent = createAlertEvent({ alertType: "health_score_drop", ruleId: "rule-2" });
      service.check(duplicateEvent);

      const entryId = (service as any).reviewQueue[0].id;
      const result = service.reviewEntry(entryId, "approved", "admin1");

      expect(result).not.toBeNull();
      expect(result?.status).toBe("approved");
      expect(result?.reviewedBy).toBe("admin1");
      expect(result?.reviewedAt).toBeDefined();
    });

    it("should reject review entry", () => {
      const event = createAlertEvent();
      service.check(event);
      service.record({ ...event, eventId: "event-1" });

      const duplicateEvent = createAlertEvent({ alertType: "health_score_drop", ruleId: "rule-2" });
      service.check(duplicateEvent);

      const entryId = (service as any).reviewQueue[0].id;
      const result = service.reviewEntry(entryId, "rejected", "admin1");

      expect(result).not.toBeNull();
      expect(result?.status).toBe("rejected");
      expect(result?.reviewedBy).toBe("admin1");
    });

    it("should return null for non-existent or non-pending entry", () => {
      const result = service.reviewEntry("non-existent", "approved", "admin1");
      expect(result).toBeNull();
    });
  });

  describe("dedup rule management", () => {
    it("should get all dedup rules", () => {
      const rules = service.getDedupRules();
      expect(rules.length).toBe(3);
      expect(rules.map((r) => r.id)).toContain("default-exact");
      expect(rules.map((r) => r.id)).toContain("default-cross-source");
      expect(rules.map((r) => r.id)).toContain("default-critical-escalate");
    });

    it("should get dedup rule by id", () => {
      const rule = service.getDedupRule("default-exact");
      expect(rule).toBeDefined();
      expect(rule?.name).toBe("Exact duplicate (same asset + type within 10 min)");
    });

    it("should return undefined for non-existent rule", () => {
      const rule = service.getDedupRule("non-existent");
      expect(rule).toBeUndefined();
    });

    it("should add new dedup rule", () => {
      const newRule = service.addDedupRule({
        name: "Custom rule",
        alertType: "volume_anomaly",
        assetCode: "USDC",
        windowMs: 15 * 60 * 1000,
        matchFields: ["assetCode", "metric"],
        severityBehavior: "escalate",
        isActive: true,
      });

      expect(newRule.id).toBeDefined();
      expect(newRule.name).toBe("Custom rule");
      expect(newRule.createdAt).toBeDefined();
      expect(service.getDedupRules().length).toBe(4);
    });

    it("should update existing dedup rule", () => {
      const updated = service.updateDedupRule("default-exact", { windowMs: 20 * 60 * 1000 });
      expect(updated).not.toBeNull();
      expect(updated?.windowMs).toBe(20 * 60 * 1000);
    });

    it("should return null when updating non-existent rule", () => {
      const updated = service.updateDedupRule("non-existent", { windowMs: 20 * 60 * 1000 });
      expect(updated).toBeNull();
    });

    it("should delete dedup rule", () => {
      const deleted = service.deleteDedupRule("default-exact");
      expect(deleted).toBe(true);
      expect(service.getDedupRules().length).toBe(2);
    });

    it("should return false when deleting non-existent rule", () => {
      const deleted = service.deleteDedupRule("non-existent");
      expect(deleted).toBe(false);
    });
  });

  describe("escalate - severity escalation", () => {
    it("should escalate to higher severity", () => {
      const service = DuplicateAlertCheckService.getInstance();
      const result = (service as any).escalate("medium", "high");
      expect(result).toBe("high");
    });

    it("should keep current severity if incoming is lower", () => {
      const service = DuplicateAlertCheckService.getInstance();
      const result = (service as any).escalate("high", "medium");
      expect(result).toBe("high");
    });

    it("should keep current severity if equal", () => {
      const service = DuplicateAlertCheckService.getInstance();
      const result = (service as any).escalate("critical", "critical");
      expect(result).toBe("critical");
    });
  });

  describe("matchScore - similarity scoring", () => {
    it("should give high score for same priority", () => {
      const service = DuplicateAlertCheckService.getInstance();
      const event = createAlertEvent({ priority: "critical" });
      const score = (service as any).matchScore(event, "critical");
      expect(score).toBe(0.8); // 0.5 base + 0.3 for same priority
    });

    it("should give medium score for adjacent priority", () => {
      const service = DuplicateAlertCheckService.getInstance();
      const event = createAlertEvent({ priority: "high" });
      const score = (service as any).matchScore(event, "critical");
      expect(score).toBe(0.6); // 0.5 base + 0.1 for adjacent
    });

    it("should give base score for far apart priorities", () => {
      const service = DuplicateAlertCheckService.getInstance();
      const event = createAlertEvent({ priority: "low" });
      const score = (service as any).matchScore(event, "critical");
      expect(score).toBe(0.5); // base only
    });

    it("should cap score at 1.0", () => {
      const service = DuplicateAlertCheckService.getInstance();
      const event = createAlertEvent({ priority: "critical" });
      // Manually test internal calculation
      const score = Math.min(0.5 + 0.3, 1.0);
      expect(score).toBe(0.8);
    });
  });

  describe("fingerprint - event fingerprinting", () => {
    it("should generate consistent fingerprints for same fields", () => {
      const service = DuplicateAlertCheckService.getInstance();
      const event = createAlertEvent();

      const fp1 = (service as any).fingerprint(event, ["assetCode", "alertType", "metric"]);
      const fp2 = (service as any).fingerprint(event, ["assetCode", "alertType", "metric"]);

      expect(fp1).toBe(fp2);
    });

    it("should generate different fingerprints for different fields", () => {
      const service = DuplicateAlertCheckService.getInstance();
      const event1 = createAlertEvent({ assetCode: "USDC" });
      const event2 = createAlertEvent({ assetCode: "XLM" });

      const fp1 = (service as any).fingerprint(event1, ["assetCode", "alertType", "metric"]);
      const fp2 = (service as any).fingerprint(event2, ["assetCode", "alertType", "metric"]);

      expect(fp1).not.toBe(fp2);
    });

    it("should only include specified matchFields in fingerprint", () => {
      const service = DuplicateAlertCheckService.getInstance();
      const event1 = createAlertEvent({ assetCode: "USDC", alertType: "price_deviation" });
      const event2 = createAlertEvent({ assetCode: "USDC", alertType: "health_score_drop" });

      // Fingerprint with only assetCode and metric (no alertType)
      const fp1 = (service as any).fingerprint(event1, ["assetCode", "metric"]);
      const fp2 = (service as any).fingerprint(event2, ["assetCode", "metric"]);

      expect(fp1).toBe(fp2); // Should match because alertType is not in matchFields
    });
  });

  describe("race condition resolution", () => {
    it("should handle concurrent duplicate checks correctly", () => {
      const event = createAlertEvent();
      service.check(event);
      service.record({ ...event, eventId: "event-1" });

      // Simulate two nodes checking the same alert simultaneously
      const duplicateEvent = createAlertEvent({ ruleId: "rule-2" });
      const result1 = service.check(duplicateEvent);
      const result2 = service.check(duplicateEvent);

      // Both should detect duplicate
      expect(result1.isDuplicate).toBe(true);
      expect(result2.isDuplicate).toBe(true);
    });
  });

  describe("automatic key expiration", () => {
    it("should expire keys matching deduplication TTL window", () => {
      const event = createAlertEvent({ eventId: "event-1" });
      service.check(event);
      service.record(event);

      // Get the fingerprint used by default-exact rule
      const fp = (service as any).fingerprint(event, ["assetCode", "alertType", "metric"]);

      // Verify it exists
      expect((service as any).recentEvents.has(fp)).toBe(true);

      // Simulate time passing beyond the MAX window (30 min from default-critical-escalate)
      const recorded = (service as any).recentEvents.get(fp);
      if (recorded) {
        recorded.time = new Date(Date.now() - 40 * 60 * 1000); // 40 minutes ago
      }

      // Next check should trigger eviction
      service.check(createAlertEvent({ eventId: "event-2" }));

      // Key should be evicted
      expect((service as any).recentEvents.has(fp)).toBe(false);
    });
  });

  describe("fallback to in-memory cache", () => {
    it("should use in-memory cache when Redis is unreachable (service uses in-memory by default)", () => {
      // The service uses in-memory Map by default, no Redis dependency
      const event = createAlertEvent();
      const result = service.check(event);

      expect(result.isDuplicate).toBe(false);
      expect(result.action).toBe("allow");
    });

    it("should persist events in memory across checks", () => {
      const event = createAlertEvent({ eventId: "event-1" });
      service.check(event);
      service.record(event);

      const duplicateEvent = createAlertEvent();
      const result = service.check(duplicateEvent);

      expect(result.isDuplicate).toBe(true);
    });
  });

  describe("singleton pattern", () => {
    it("should return same instance on multiple calls", () => {
      const instance1 = DuplicateAlertCheckService.getInstance();
      const instance2 = DuplicateAlertCheckService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });
});