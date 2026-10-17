import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EscalationService } from "../../src/services/escalation.service.js";
import type { Incident, EscalationRule } from "../../src/services/escalation.service.js";

const mockDb = () => {
  const store = {
    incidents: [] as any[],
    escalation_rules: [] as any[],
    escalation_history: [] as any[],
  };

  const queries = new Map<string, any>();

  const createQuery = (table: string) => {
    if (queries.has(table)) {
      return queries.get(table);
    }

    const query: any = {
      where: vi.fn().mockReturnThis(),
      whereIn: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      first: vi.fn(async () => {
        const items = store[table as keyof typeof store];
        return items.length > 0 ? items[0] : null;
      }),
      insert: vi.fn(async (data: any) => {
        store[table as keyof typeof store].push(data);
        return [data];
      }),
      update: vi.fn(async () => 1),
      select: vi.fn().mockReturnThis(),
    };

    queries.set(table, query);
    return query;
  };

  const db: any = (table: string) => createQuery(table);
  db.raw = vi.fn();
  db.fn = { now: () => new Date() };
  db.__store = store;

  return db;
};

vi.mock("../../src/database/connection.js", () => ({
  getDatabase: vi.fn(),
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("EscalationService", () => {
  let service: EscalationService;
  let db: any;

  beforeEach(async () => {
    const { getDatabase } = await import("../../src/database/connection.js");
    db = mockDb();
    vi.mocked(getDatabase).mockReturnValue(db);
    service = new EscalationService();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("createIncident", () => {
    it("creates a new incident with default values", async () => {
      const incidentData = {
        title: "High severity incident",
        description: "Test incident",
        severity: "high" as const,
        status: "open" as const,
        assigned_to: "user123",
      };

      const incident = await service.createIncident(incidentData);

      expect(incident).toBeDefined();
      expect(incident.id).toBeDefined();
      expect(incident.title).toBe("High severity incident");
      expect(incident.severity).toBe("high");
      expect(incident.current_escalation_level).toBe(1);
      expect(incident.acknowledged_at).toBeNull();
      expect(incident.acknowledged_by).toBeNull();
      expect(incident.resolved_at).toBeNull();
      expect(incident.resolved_by).toBeNull();
    });

    it("creates incident with critical severity", async () => {
      const incidentData = {
        title: "Critical production issue",
        description: "Database down",
        severity: "critical" as const,
        status: "open" as const,
        assigned_to: null,
      };

      const incident = await service.createIncident(incidentData);

      expect(incident.severity).toBe("critical");
      expect(incident.current_escalation_level).toBe(1);
    });

    it("handles errors during incident creation", async () => {
      db("incidents").insert.mockRejectedValueOnce(new Error("Database error"));

      const incidentData = {
        title: "Test",
        description: "Test",
        severity: "low" as const,
        status: "open" as const,
        assigned_to: null,
      };

      await expect(service.createIncident(incidentData)).rejects.toThrow("Database error");
    });
  });

  describe("acknowledgeIncident", () => {
    it("acknowledges an incident", async () => {
      const incidentId = "incident-123";
      const acknowledgedBy = "user456";

      await service.acknowledgeIncident(incidentId, acknowledgedBy);

      const updateCall = db("incidents").update.mock.calls[0][0];
      expect(updateCall.status).toBe("acknowledged");
      expect(updateCall.acknowledged_by).toBe(acknowledgedBy);
      expect(updateCall.acknowledged_at).toBeInstanceOf(Date);
    });

    it("handles errors during acknowledgement", async () => {
      db("incidents").update.mockRejectedValueOnce(new Error("Update failed"));

      await expect(service.acknowledgeIncident("id", "user")).rejects.toThrow("Update failed");
    });
  });

  describe("resolveIncident", () => {
    it("resolves an incident", async () => {
      const incidentId = "incident-456";
      const resolvedBy = "user789";

      await service.resolveIncident(incidentId, resolvedBy);

      const updateCall = db("incidents").update.mock.calls[0][0];
      expect(updateCall.status).toBe("resolved");
      expect(updateCall.resolved_by).toBe(resolvedBy);
      expect(updateCall.resolved_at).toBeInstanceOf(Date);
    });

    it("handles errors during resolution", async () => {
      db("incidents").update.mockRejectedValueOnce(new Error("Resolution failed"));

      await expect(service.resolveIncident("id", "user")).rejects.toThrow("Resolution failed");
    });
  });

  describe("escalateIncident", () => {
    it("escalates an incident when rule exists", async () => {
      const incident = {
        id: "incident-123",
        severity: "high",
        current_escalation_level: 1,
        status: "open",
      };

      const rule: EscalationRule = {
        id: "rule-1",
        name: "High severity escalation",
        severity: "high",
        from_level: 1,
        to_level: 2,
        timeout_minutes: 30,
        require_acknowledgement: false,
        notification_channels: ["email", "slack"],
        route_to: ["team-lead"],
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      db("incidents").first.mockResolvedValueOnce(incident);
      db("escalation_rules").first.mockResolvedValueOnce({
        ...rule,
        notification_channels: JSON.stringify(rule.notification_channels),
        route_to: JSON.stringify(rule.route_to),
      });

      await service.escalateIncident("incident-123", "Timeout exceeded");

      expect(db("incidents").update).toHaveBeenCalled();
      expect(db("escalation_history").insert).toHaveBeenCalled();
    });

    it("throws error when incident not found", async () => {
      db("incidents").first.mockResolvedValueOnce(null);

      await expect(service.escalateIncident("nonexistent", "reason")).rejects.toThrow(
        "Incident not found"
      );
    });

    it("handles missing escalation rule gracefully", async () => {
      const incident = {
        id: "incident-123",
        severity: "low",
        current_escalation_level: 5,
      };

      db("incidents").first.mockResolvedValueOnce(incident);
      db("escalation_rules").first.mockResolvedValueOnce(null);

      await service.escalateIncident("incident-123", "reason");

      expect(db("incidents").update).not.toHaveBeenCalled();
    });

    it("escalates with manual escalation type", async () => {
      const incident = {
        id: "incident-123",
        severity: "critical",
        current_escalation_level: 1,
      };

      const rule = {
        id: "rule-1",
        to_level: 2,
        notification_channels: JSON.stringify(["email"]),
        route_to: JSON.stringify(["on-call"]),
      };

      db("incidents").first.mockResolvedValueOnce(incident);
      db("escalation_rules").first.mockResolvedValueOnce(rule);

      await service.escalateIncident("incident-123", "Manual escalation", "manual");

      const historyInsert = db("escalation_history").insert.mock.calls[0][0];
      expect(historyInsert.escalated_by).toBe("manual");
      expect(historyInsert.reason).toBe("Manual escalation");
    });
  });

  describe("createEscalationRule", () => {
    it("creates a new escalation rule", async () => {
      const ruleData = {
        name: "Critical escalation",
        severity: "critical" as const,
        from_level: 1 as const,
        to_level: 2 as const,
        timeout_minutes: 15,
        require_acknowledgement: true,
        notification_channels: ["email", "sms"],
        route_to: ["on-call-team"],
        is_active: true,
      };

      const rule = await service.createEscalationRule(ruleData);

      expect(rule).toBeDefined();
      expect(rule.id).toBeDefined();
      expect(rule.name).toBe("Critical escalation");
      expect(rule.severity).toBe("critical");
      expect(rule.from_level).toBe(1);
      expect(rule.to_level).toBe(2);
      expect(rule.timeout_minutes).toBe(15);
    });

    it("handles errors during rule creation", async () => {
      db("escalation_rules").insert.mockRejectedValueOnce(new Error("Constraint violation"));

      const ruleData = {
        name: "Test",
        severity: "high" as const,
        from_level: 1 as const,
        to_level: 2 as const,
        timeout_minutes: 30,
        require_acknowledgement: false,
        notification_channels: [],
        route_to: [],
        is_active: true,
      };

      await expect(service.createEscalationRule(ruleData)).rejects.toThrow(
        "Constraint violation"
      );
    });
  });

  describe("getIncident", () => {
    it("retrieves an incident by id", async () => {
      const mockIncident = {
        id: "incident-123",
        title: "Test incident",
        severity: "high",
      };

      db("incidents").first.mockResolvedValueOnce(mockIncident);

      const incident = await service.getIncident("incident-123");

      expect(incident).toEqual(mockIncident);
      expect(db("incidents").where).toHaveBeenCalledWith({ id: "incident-123" });
    });

    it("returns null when incident not found", async () => {
      db("incidents").first.mockResolvedValueOnce(null);

      const incident = await service.getIncident("nonexistent");

      expect(incident).toBeNull();
    });

    it("handles database errors gracefully", async () => {
      db("incidents").first.mockRejectedValueOnce(new Error("Database error"));

      const incident = await service.getIncident("incident-123");

      expect(incident).toBeNull();
    });
  });

  describe("getEscalationHistory", () => {
    it("retrieves escalation history for an incident", async () => {
      const mockHistory = [
        {
          id: "history-1",
          incident_id: "incident-123",
          from_level: 1,
          to_level: 2,
          reason: "Timeout",
          escalated_by: "system",
          escalated_at: new Date(),
          notified_users: JSON.stringify(["user1", "user2"]),
        },
        {
          id: "history-2",
          incident_id: "incident-123",
          from_level: 2,
          to_level: 3,
          reason: "Still unresolved",
          escalated_by: "manual",
          escalated_at: new Date(),
          notified_users: JSON.stringify(["manager"]),
        },
      ];

      db("escalation_history").orderBy.mockResolvedValueOnce(mockHistory);

      const history = await service.getEscalationHistory("incident-123");

      expect(history).toHaveLength(2);
      expect(history[0].notified_users).toEqual(["user1", "user2"]);
      expect(history[1].notified_users).toEqual(["manager"]);
    });

    it("returns empty array when no history exists", async () => {
      db("escalation_history").orderBy.mockResolvedValueOnce([]);

      const history = await service.getEscalationHistory("incident-123");

      expect(history).toEqual([]);
    });

    it("handles database errors gracefully", async () => {
      db("escalation_history").orderBy.mockRejectedValueOnce(new Error("Query failed"));

      const history = await service.getEscalationHistory("incident-123");

      expect(history).toEqual([]);
    });
  });

  describe("getAllRules", () => {
    it("retrieves all active escalation rules", async () => {
      const mockRules = [
        {
          id: "rule-1",
          severity: "critical",
          from_level: 1,
          notification_channels: JSON.stringify(["email"]),
          route_to: JSON.stringify(["team1"]),
          is_active: true,
        },
        {
          id: "rule-2",
          severity: "high",
          from_level: 1,
          notification_channels: JSON.stringify(["slack"]),
          route_to: JSON.stringify(["team2"]),
          is_active: true,
        },
      ];

      db("escalation_rules").orderBy.mockResolvedValueOnce(mockRules);

      const rules = await service.getAllRules();

      expect(rules).toHaveLength(2);
      expect(rules[0].notification_channels).toEqual(["email"]);
      expect(rules[0].route_to).toEqual(["team1"]);
      expect(rules[1].notification_channels).toEqual(["slack"]);
    });

    it("returns empty array when no rules exist", async () => {
      db("escalation_rules").orderBy.mockResolvedValueOnce([]);

      const rules = await service.getAllRules();

      expect(rules).toEqual([]);
    });

    it("handles database errors gracefully", async () => {
      db("escalation_rules").orderBy.mockRejectedValueOnce(new Error("Query failed"));

      const rules = await service.getAllRules();

      expect(rules).toEqual([]);
    });
  });

  describe("startEngine and stopEngine", () => {
    it("starts the escalation engine", () => {
      service.startEngine();

      expect(service["isRunning"]).toBe(true);
    });

    it("does not start engine twice", () => {
      service.startEngine();
      service.startEngine();

      expect(service["isRunning"]).toBe(true);
    });

    it("stops the escalation engine", () => {
      service.startEngine();
      service.stopEngine();

      expect(service["isRunning"]).toBe(false);
    });

    it("handles stopping when not running", () => {
      service.stopEngine();

      expect(service["isRunning"]).toBe(false);
    });
  });

  describe("escalation thresholds", () => {
    it("escalates when timeout threshold is exceeded", async () => {
      const pastTime = new Date(Date.now() - 60 * 60 * 1000);
      const incident = {
        id: "incident-123",
        severity: "high",
        current_escalation_level: 1,
        status: "open",
        updated_at: pastTime,
        acknowledged_at: null,
      };

      const rule = {
        id: "rule-1",
        timeout_minutes: 30,
        require_acknowledgement: false,
        to_level: 2,
        notification_channels: JSON.stringify([]),
        route_to: JSON.stringify([]),
      };

      db("incidents").first.mockResolvedValue(incident);
      db("escalation_rules").first.mockResolvedValue(rule);

      await service["monitorIncident"]("incident-123");

      expect(db("incidents").update).toHaveBeenCalled();
    });

    it("does not escalate before timeout", async () => {
      const recentTime = new Date(Date.now() - 10 * 60 * 1000);
      const incident = {
        id: "incident-123",
        severity: "low",
        current_escalation_level: 1,
        status: "open",
        updated_at: recentTime,
      };

      const rule = {
        timeout_minutes: 30,
        require_acknowledgement: false,
      };

      db("incidents").first.mockResolvedValueOnce(incident);
      db("escalation_rules").first.mockResolvedValueOnce(rule);

      await service["monitorIncident"]("incident-123");

      expect(db("incidents").update).not.toHaveBeenCalled();
    });

    it("escalates when acknowledgement required but not received", async () => {
      const pastTime = new Date(Date.now() - 45 * 60 * 1000);
      const incident = {
        id: "incident-123",
        severity: "critical",
        current_escalation_level: 1,
        status: "open",
        updated_at: pastTime,
        acknowledged_at: null,
      };

      const rule = {
        timeout_minutes: 30,
        require_acknowledgement: true,
        to_level: 2,
        notification_channels: JSON.stringify([]),
        route_to: JSON.stringify([]),
      };

      db("incidents").first.mockResolvedValue(incident);
      db("escalation_rules").first.mockResolvedValue(rule);

      await service["monitorIncident"]("incident-123");

      expect(db("incidents").update).toHaveBeenCalled();
    });

    it("does not escalate when acknowledged and acknowledgement required", async () => {
      const pastTime = new Date(Date.now() - 45 * 60 * 1000);
      const incident = {
        id: "incident-123",
        severity: "high",
        current_escalation_level: 1,
        status: "acknowledged",
        updated_at: pastTime,
        acknowledged_at: new Date(),
      };

      const rule = {
        timeout_minutes: 30,
        require_acknowledgement: true,
      };

      db("incidents").first.mockResolvedValueOnce(incident);
      db("escalation_rules").first.mockResolvedValueOnce(rule);

      await service["monitorIncident"]("incident-123");

      expect(db("incidents").update).not.toHaveBeenCalled();
    });
  });

  describe("incident status handling", () => {
    it("does not monitor resolved incidents", async () => {
      const incident = {
        id: "incident-123",
        status: "resolved",
      };

      db("incidents").first.mockResolvedValueOnce(incident);

      await service["monitorIncident"]("incident-123");

      expect(db("escalation_rules").where).not.toHaveBeenCalled();
    });

    it("does not monitor closed incidents", async () => {
      const incident = {
        id: "incident-123",
        status: "closed",
      };

      db("incidents").first.mockResolvedValueOnce(incident);

      await service["monitorIncident"]("incident-123");

      expect(db("escalation_rules").where).not.toHaveBeenCalled();
    });
  });

  describe("acknowledgeIncident", () => {
    it("should acknowledge an active incident", async () => {
      const incident = {
        id: "incident-1",
        status: "active",
        acknowledged_at: null,
        acknowledged_by: null,
      };

      db("incidents").first.mockResolvedValueOnce(incident);
      db("incidents").update.mockResolvedValueOnce(1);

      await service.acknowledgeIncident("incident-1", "user-1");

      expect(db("incidents").update).toHaveBeenCalledWith(
        expect.objectContaining({
          acknowledged_at: expect.any(String),
          acknowledged_by: "user-1",
        }),
      );
    });

    it("should throw when incident not found", async () => {
      db("incidents").first.mockResolvedValueOnce(null);

      await expect(
        service.acknowledgeIncident("nonexistent", "user-1"),
      ).rejects.toThrow();
    });

    it("should throw when incident already resolved", async () => {
      const incident = {
        id: "incident-1",
        status: "resolved",
      };

      db("incidents").first.mockResolvedValueOnce(incident);

      await expect(
        service.acknowledgeIncident("incident-1", "user-1"),
      ).rejects.toThrow();
    });

    it("should throw when incident already acknowledged", async () => {
      const incident = {
        id: "incident-1",
        status: "active",
        acknowledged_at: "2024-01-01T00:00:00Z",
      };

      db("incidents").first.mockResolvedValueOnce(incident);

      await expect(
        service.acknowledgeIncident("incident-1", "user-1"),
      ).rejects.toThrow();
    });
  });

  describe("resolveIncident", () => {
    it("should resolve an active incident", async () => {
      const incident = {
        id: "incident-1",
        status: "active",
      };

      db("incidents").first.mockResolvedValueOnce(incident);
      db("incidents").update.mockResolvedValueOnce(1);

      await service.resolveIncident("incident-1", "user-1");

      expect(db("incidents").update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "resolved",
          resolved_at: expect.any(String),
          resolved_by: "user-1",
        }),
      );
    });

    it("should throw when incident not found", async () => {
      db("incidents").first.mockResolvedValueOnce(null);

      await expect(
        service.resolveIncident("nonexistent", "user-1"),
      ).rejects.toThrow();
    });

    it("should throw when incident already resolved", async () => {
      const incident = {
        id: "incident-1",
        status: "resolved",
      };

      db("incidents").first.mockResolvedValueOnce(incident);

      await expect(
        service.resolveIncident("incident-1", "user-1"),
      ).rejects.toThrow();
    });
  });

  describe("createIncident", () => {
    it("should create a new incident", async () => {
      const incidentData = {
        title: "Test Incident",
        description: "Test description",
        severity: "high",
        source: "monitor",
        asset: "BTC",
      };

      db("incidents").insert.mockResolvedValueOnce([incidentData]);

      const result = await service.createIncident(incidentData);
      expect(result).toBeDefined();
      expect(db("incidents").insert).toHaveBeenCalled();
    });

    it("should set initial status to active", async () => {
      const incidentData = {
        title: "Test Incident",
        description: "Test description",
        severity: "high",
        source: "monitor",
        asset: "BTC",
      };

      db("incidents").insert.mockResolvedValueOnce([incidentData]);

      await service.createIncident(incidentData);

      expect(db("incidents").insert).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "active",
        }),
      );
    });
  });
});
