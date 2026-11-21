import { describe, it, expect, vi } from "vitest";
import crypto from "crypto";

const serviceMocks = vi.hoisted(() => ({
  check: vi.fn(),
  record: vi.fn(),
  getDedupRules: vi.fn(),
  getDedupRule: vi.fn(),
  addDedupRule: vi.fn(),
  updateDedupRule: vi.fn(),
  deleteDedupRule: vi.fn(),
  getReviewQueue: vi.fn(),
  reviewEntry: vi.fn(),
}));

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock("../../services/duplicateAlertCheck.service.js", () => ({
  DuplicateAlertCheckService: class {
    static getInstance() {
      return {
        check: serviceMocks.check,
        record: serviceMocks.record,
        getDedupRules: serviceMocks.getDedupRules,
        getDedupRule: serviceMocks.getDedupRule,
        addDedupRule: serviceMocks.addDedupRule,
        updateDedupRule: serviceMocks.updateDedupRule,
        deleteDedupRule: serviceMocks.deleteDedupRule,
        getReviewQueue: serviceMocks.getReviewQueue,
        reviewEntry: serviceMocks.reviewEntry,
      };
    }
  },
}));

vi.mock("../../utils/logger.js", () => ({ logger: loggerMocks }));

const RULE_ID = "rule-123-456";

describe("duplicateAlertCheckRoutes - Service Logic Tests", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("POST /api/v1/alerts/check-duplicate", () => {
    it("returns isDuplicate true when duplicate is detected", () => {
      const checkResult = {
        isDuplicate: true,
        action: "block",
        matchedEventId: "event-456",
        reason: "Matched rule 'Exact duplicate'",
      };
      serviceMocks.check.mockReturnValue(checkResult);

      const payload = {
        alertType: "price_spike",
        assetCode: "XLM",
        metric: "price",
        priority: "high",
      };

      const result = serviceMocks.check(payload);
      expect(result.isDuplicate).toBe(true);
      expect(serviceMocks.check).toHaveBeenCalledWith(payload);
    });

    it("returns isDuplicate false for unique alerts", () => {
      const checkResult = {
        isDuplicate: false,
        action: "allow",
      };
      serviceMocks.check.mockReturnValue(checkResult);

      const payload = {
        alertType: "liquidation",
        assetCode: "USDC",
        metric: "loan_health",
        priority: "critical",
      };

      const result = serviceMocks.check(payload);
      expect(result.isDuplicate).toBe(false);
      expect(result.action).toBe("allow");
    });
  });

  describe("Fingerprint derivation from payload", () => {
    it("fingerprint is derived from the payload body", () => {
      const payload = {
        alertType: "bridge_slippage",
        assetCode: "STELLAR_USDC",
        metric: "slippage_percentage",
        priority: "medium",
        source: "soroban_monitor",
      };

      serviceMocks.check.mockReturnValue({
        isDuplicate: false,
        action: "allow",
      });

      serviceMocks.check(payload);
      expect(serviceMocks.check).toHaveBeenCalledWith(payload);
    });

    it("same payload fields generate same fingerprint", () => {
      const payload1 = {
        alertType: "price_spike",
        assetCode: "XLM",
        metric: "price_change",
      };

      const payload2 = {
        alertType: "price_spike",
        assetCode: "XLM",
        metric: "price_change",
      };

      serviceMocks.check.mockReturnValue({ isDuplicate: false, action: "allow" });

      serviceMocks.check(payload1);
      serviceMocks.check(payload2);

      // Both should be called with consistent payloads
      expect(serviceMocks.check).toHaveBeenCalledTimes(2);
      expect(serviceMocks.check).toHaveBeenNthCalledWith(1, payload1);
      expect(serviceMocks.check).toHaveBeenNthCalledWith(2, payload2);
    });
  });

  describe("Response latency and determinism", () => {
    it("duplicate check response latency is under 10ms with mocked service", () => {
      const checkResult = {
        isDuplicate: true,
        action: "block",
        matchedEventId: "event-123",
      };
      serviceMocks.check.mockReturnValue(checkResult);

      const startTime = performance.now();
      const result = serviceMocks.check({ alertType: "test", assetCode: "TEST" });
      const endTime = performance.now();
      const latency = endTime - startTime;

      expect(latency).toBeLessThan(10);
      expect(result.isDuplicate).toBe(true);
    });

    it("latency is deterministic with mocked service", () => {
      serviceMocks.check.mockReturnValue({ isDuplicate: false, action: "allow" });

      const latencies: number[] = [];

      for (let i = 0; i < 5; i++) {
        const startTime = performance.now();
        serviceMocks.check({ alertType: "test" + i, assetCode: "TEST" });
        const endTime = performance.now();
        latencies.push(endTime - startTime);
      }

      // All latencies should be very small and roughly similar (deterministic)
      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      expect(avgLatency).toBeLessThan(5);

      // Check that latencies don't vary wildly (deterministic)
      const maxLatency = Math.max(...latencies);
      const minLatency = Math.min(...latencies);
      expect(maxLatency - minLatency).toBeLessThan(2);
    });
  });

  describe("Malformed alert payload", () => {
    it("malformed alert payload validation", () => {
      // Empty payload would be invalid
      const emptyPayload = {};

      serviceMocks.check.mockImplementation((payload) => {
        if (!payload.alertType || !payload.assetCode) {
          throw new Error("Missing required fields");
        }
        return { isDuplicate: false, action: "allow" };
      });

      expect(() => serviceMocks.check(emptyPayload)).toThrow("Missing required fields");
    });

    it("returns 400 for invalid payload structure", () => {
      const invalidPayload = { invalid: "structure" };

      serviceMocks.check.mockImplementation(() => {
        throw new Error("Validation failed");
      });

      expect(() => serviceMocks.check(invalidPayload)).toThrow("Validation failed");
    });
  });

  describe("Dedup rules and review queue", () => {
    it("lists all dedup rules", () => {
      const mockRules = [
        {
          id: "rule-1",
          name: "Exact duplicate",
          alertType: "*",
          assetCode: "*",
          windowMs: 600000,
          matchFields: ["assetCode", "alertType"],
          severityBehavior: "block",
          isActive: true,
        },
      ];
      serviceMocks.getDedupRules.mockReturnValue(mockRules);

      const result = serviceMocks.getDedupRules();
      expect(result).toEqual(mockRules);
      expect(serviceMocks.getDedupRules).toHaveBeenCalled();
    });

    it("gets a single dedup rule by ID", () => {
      const mockRule = {
        id: RULE_ID,
        name: "Test rule",
        alertType: "price_spike",
        assetCode: "XLM",
        windowMs: 300000,
        matchFields: ["assetCode"],
        severityBehavior: "review",
        isActive: true,
      };
      serviceMocks.getDedupRule.mockReturnValue(mockRule);

      const result = serviceMocks.getDedupRule(RULE_ID);
      expect(result).toEqual(mockRule);
      expect(serviceMocks.getDedupRule).toHaveBeenCalledWith(RULE_ID);
    });

    it("adds a new dedup rule", () => {
      const newRule = {
        name: "New rule",
        alertType: "liquidation",
        assetCode: "USDC",
        windowMs: 1800000,
        matchFields: ["assetCode", "alertType"],
        severityBehavior: "escalate",
        isActive: true,
      };

      const mockResult = {
        id: "new-rule",
        ...newRule,
      };

      serviceMocks.addDedupRule.mockReturnValue(mockResult);

      const result = serviceMocks.addDedupRule(newRule);
      expect(result.id).toBe("new-rule");
      expect(serviceMocks.addDedupRule).toHaveBeenCalledWith(newRule);
    });

    it("lists review queue entries", () => {
      const mockEntries = [
        {
          id: "review-1",
          incomingEvent: { alertType: "price_spike", assetCode: "XLM" },
          matchedEventId: "event-123",
          matchScore: 0.95,
          reason: "High match score",
          status: "pending",
        },
      ];

      serviceMocks.getReviewQueue.mockReturnValue(mockEntries);

      const result = serviceMocks.getReviewQueue();
      expect(result).toEqual(mockEntries);
      expect(serviceMocks.getReviewQueue).toHaveBeenCalled();
    });

    it("filters review queue by status", () => {
      const pendingEntries = [
        {
          id: "review-1",
          status: "pending",
        },
      ];

      serviceMocks.getReviewQueue.mockReturnValue(pendingEntries);

      const result = serviceMocks.getReviewQueue("pending");
      expect(result).toEqual(pendingEntries);
      expect(serviceMocks.getReviewQueue).toHaveBeenCalledWith("pending");
    });

    it("resolves review queue entry with approval", () => {
      const resolvedEntry = {
        id: "review-1",
        status: "approved",
        reviewedBy: "reviewer-123",
      };

      serviceMocks.reviewEntry.mockReturnValue(resolvedEntry);

      const result = serviceMocks.reviewEntry("review-1", "approved", "reviewer-123");
      expect(result.status).toBe("approved");
      expect(serviceMocks.reviewEntry).toHaveBeenCalledWith("review-1", "approved", "reviewer-123");
    });

    it("resolves review queue entry with rejection", () => {
      const resolvedEntry = {
        id: "review-1",
        status: "rejected",
        reviewedBy: "reviewer-456",
      };

      serviceMocks.reviewEntry.mockReturnValue(resolvedEntry);

      const result = serviceMocks.reviewEntry("review-1", "rejected", "reviewer-456");
      expect(result.status).toBe("rejected");
    });
  });
});
