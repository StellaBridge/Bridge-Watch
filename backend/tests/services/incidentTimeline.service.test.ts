import { describe, it, expect, beforeEach, vi } from "vitest";
import { IncidentTimelineService } from "../../src/services/incidentTimeline.service.js";

vi.mock("../../src/utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const state = vi.hoisted(() => ({
  deployments: [] as any[],
  events: [] as any[],
}));

vi.mock("../../src/database/connection.js", () => {
  const mockDb: any = vi.fn().mockImplementation((table: string) => {
    if (table === "contract_deployments") {
      const builder: any = {
        where: vi.fn().mockImplementation((clause: any) => {
          builder.__clause = clause;
          return builder;
        }),
        first: vi.fn().mockImplementation(() =>
          Promise.resolve(
            state.deployments.find((d) => d.id === builder.__clause?.id)
          )
        ),
      };
      return builder;
    }

    if (table === "incident_timeline_events") {
      const builder: any = {
        __where: null as any,
        insert: vi.fn().mockImplementation((data: any) => {
          const row = {
            id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            created_at: new Date(),
            updated_at: new Date(),
            ...data,
          };
          state.events.push(row);
          return {
            returning: vi.fn().mockResolvedValue([row]),
          };
        }),
        where: vi.fn().mockImplementation((clause: any) => {
          builder.__where = clause;
          return builder;
        }),
        first: vi.fn().mockImplementation(() => {
          const id = builder.__where?.id;
          const found = state.events.find((e) => e.id === id);
          return Promise.resolve(found ?? null);
        }),
        orderBy: vi.fn().mockImplementation((_col: string, _dir: string) => builder),
        delete: vi.fn().mockImplementation(() => {
          const id = builder.__where?.id;
          const index = state.events.findIndex((e) => e.id === id);
          if (index !== -1) {
            state.events.splice(index, 1);
            return Promise.resolve(1);
          }
          return Promise.resolve(0);
        }),
        then: (resolve: any) => {
          let results = [...state.events];
          if (builder.__where?.incident_id) {
            results = results.filter((e) => e.incident_id === builder.__where.incident_id);
          }
          if (builder.__where?.deployment_id) {
            results = results.filter((e) => e.deployment_id === builder.__where.deployment_id);
          }
          results.sort(
            (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime()
          );
          return Promise.resolve(results).then(resolve);
        },
      };
      return builder;
    }

    throw new Error(`Unexpected table access in mock: ${table}`);
  });

  return { getDatabase: () => mockDb };
});

describe("IncidentTimelineService", () => {
  let service: IncidentTimelineService;

  beforeEach(() => {
    vi.clearAllMocks();
    state.deployments = [
      { id: "e87b7a60-9d5a-4b9e-b873-123456789abc", contract_name: "TokenBridge" },
    ];
    state.events = [];
    service = new IncidentTimelineService();
  });

  describe("addEvent", () => {
    it("adds an event and returns it with id and incidentId", async () => {
      const event = await service.addEvent("incident-1", {
        type: "created",
        actor: "user-1",
        occurredAt: "2026-09-25T00:00:00.000Z",
      });

      expect(event.id).toBeDefined();
      expect(event.incidentId).toBe("incident-1");
      expect(event.type).toBe("created");
      expect(event.actor).toBe("user-1");
    });

    it("associates event with a valid deploymentId", async () => {
      const deploymentId = "e87b7a60-9d5a-4b9e-b873-123456789abc";
      const event = await service.addEvent("incident-1", {
        type: "deployment_triggered_incident",
        deploymentId,
      });

      expect(event.deploymentId).toBe(deploymentId);
    });

    it("throws an error when referencing a non-existent deploymentId", async () => {
      await expect(
        service.addEvent("incident-1", {
          type: "deployment_triggered_incident",
          deploymentId: "00000000-0000-0000-0000-000000000000",
        })
      ).rejects.toThrow("Deployment with ID 00000000-0000-0000-0000-000000000000 not found");
    });

    it("defaults actor and metadata when not provided", async () => {
      const event = await service.addEvent("incident-1", { type: "system_action" });

      expect(event.actor).toBeNull();
      expect(event.metadata).toEqual({});
    });
  });

  describe("getTimeline", () => {
    it("returns empty array for unknown incident", async () => {
      const timeline = await service.getTimeline("incident-unknown");
      expect(timeline).toEqual([]);
    });

    it("returns events sorted by occurredAt ascending", async () => {
      await service.addEvent("incident-1", {
        type: "first",
        occurredAt: "2026-09-25T02:00:00Z",
      });
      await service.addEvent("incident-1", {
        type: "second",
        occurredAt: "2026-09-25T03:00:00Z",
      });
      await service.addEvent("incident-1", {
        type: "third",
        occurredAt: "2026-09-25T01:00:00Z",
      });

      const timeline = await service.getTimeline("incident-1");

      expect(timeline).toHaveLength(3);
      expect(timeline[0].type).toBe("third");
      expect(timeline[1].type).toBe("first");
      expect(timeline[2].type).toBe("second");
    });
  });

  describe("getEventsByDeployment", () => {
    it("returns events linked to a specific deployment", async () => {
      const deploymentId = "e87b7a60-9d5a-4b9e-b873-123456789abc";
      await service.addEvent("incident-1", {
        type: "deployment_rollback",
        deploymentId,
        occurredAt: "2026-09-25T01:00:00Z",
      });
      await service.addEvent("incident-2", {
        type: "unrelated_event",
      });

      const deploymentEvents = await service.getEventsByDeployment(deploymentId);

      expect(deploymentEvents).toHaveLength(1);
      expect(deploymentEvents[0].type).toBe("deployment_rollback");
      expect(deploymentEvents[0].deploymentId).toBe(deploymentId);
    });
  });

  describe("deleteEvent", () => {
    it("deletes an event by id and returns true", async () => {
      const added = await service.addEvent("incident-1", { type: "temp_event" });
      const deleted = await service.deleteEvent(added.id);

      expect(deleted).toBe(true);

      const timeline = await service.getTimeline("incident-1");
      expect(timeline).toHaveLength(0);
    });

    it("returns false when deleting a non-existent event", async () => {
      const deleted = await service.deleteEvent("non-existent-id");
      expect(deleted).toBe(false);
    });
  });

  describe("listAll", () => {
    it("groups events by incident id", async () => {
      await service.addEvent("incident-1", { type: "created" });
      await service.addEvent("incident-1", { type: "updated" });
      await service.addEvent("incident-2", { type: "created" });

      const all = await service.listAll();

      expect(Object.keys(all)).toHaveLength(2);
      expect(all["incident-1"]).toHaveLength(2);
      expect(all["incident-2"]).toHaveLength(1);
    });
  });
});
