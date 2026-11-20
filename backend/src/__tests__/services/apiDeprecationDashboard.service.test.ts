import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiDeprecationDashboardService } from "../../../services/apiDeprecationDashboard.service.js";
import { ApiDeprecationModel } from "../../../database/models/apiDeprecation.model.js";

vi.mock("../../../database/models/apiDeprecation.model.js", () => ({
  ApiDeprecationModel: vi.fn(),
}));
vi.mock("../../../utils/logger.js", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const record = (overrides: Record<string, unknown> = {}) => ({
  id: "dep-1",
  endpoint: "/api/v1/legacy",
  method: "GET",
  status: "deprecated",
  deprecation_date: new Date("2026-01-01T00:00:00Z"),
  sunset_date: new Date("2026-12-01T00:00:00Z"),
  impact_score: 8,
  active_client_count: 4,
  last_used_at: new Date("2026-11-15T00:00:00Z"),
  ...overrides,
});

const model = {
  insert: vi.fn(),
  getAll: vi.fn(),
  getDeprecated: vi.fn(),
  getAtRisk: vi.fn(),
  getByEndpoint: vi.fn(),
  updateLastUsed: vi.fn(),
  updateImpactScore: vi.fn(),
  update: vi.fn(),
  recordClientUsage: vi.fn(),
  getWeeklyActiveClients: vi.fn(),
};

let service: ApiDeprecationDashboardService;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(ApiDeprecationModel).mockImplementation(() => model as unknown as ApiDeprecationModel);
  model.getAll.mockResolvedValue([]);
  model.getDeprecated.mockResolvedValue([]);
  model.getAtRisk.mockResolvedValue([]);
  model.getByEndpoint.mockResolvedValue(undefined);
  model.insert.mockResolvedValue(record());
  model.updateLastUsed.mockResolvedValue(undefined);
  model.updateImpactScore.mockResolvedValue(undefined);
  model.update.mockResolvedValue(undefined);
  model.recordClientUsage.mockResolvedValue(undefined);
  model.getWeeklyActiveClients.mockResolvedValue([]);
  service = new ApiDeprecationDashboardService();
});

describe("ApiDeprecationDashboardService (#1658)", () => {
  it("registers a deprecated endpoint with migration metadata and initial usage counts", async () => {
    const start = new Date("2026-01-01T00:00:00Z");
    const sunset = new Date("2026-12-01T00:00:00Z");
    const result = await service.registerDeprecation("/api/v1/legacy", "GET", start, sunset, "/api/v2/new", "/migration");
    expect(result.id).toBe("dep-1");
    expect(model.insert).toHaveBeenCalledWith(expect.objectContaining({
      endpoint: "/api/v1/legacy", method: "GET", status: "deprecated",
      deprecation_date: start, sunset_date: sunset, replacement_endpoint: "/api/v2/new",
      migration_guide: "/migration", active_client_count: 0, impact_score: 0,
    }));
  });

  it("records a deprecated route hit by updating the existing endpoint's last-used time", async () => {
    model.getByEndpoint.mockResolvedValue(record());
    await service.trackEndpointUsage("/api/v1/legacy", "GET");
    expect(model.getByEndpoint).toHaveBeenCalledWith("/api/v1/legacy", "GET");
    expect(model.updateLastUsed).toHaveBeenCalledWith("dep-1");
  });

  it("does not record usage for a route absent from the deprecation catalog", async () => {
    await service.trackEndpointUsage("/api/v2/current", "GET");
    expect(model.updateLastUsed).not.toHaveBeenCalled();
  });

  it("swallows usage tracking errors to avoid blocking API requests", async () => {
    model.getByEndpoint.mockRejectedValue(new Error("database offline"));
    await expect(service.trackEndpointUsage("/api/v1/legacy", "GET")).resolves.toBeUndefined();
  });

  it("aggregates deprecated and sunset endpoints, risk, active clients and high impact", async () => {
    model.getAll.mockResolvedValue([record(), record({ id: "dep-2", status: "sunset" }), record({ id: "active", status: "active" })]);
    model.getDeprecated.mockResolvedValue([
      record({ active_client_count: 3, impact_score: 8 }),
      record({ id: "dep-2", status: "sunset", active_client_count: 6, impact_score: 7 }),
    ]);
    model.getAtRisk.mockResolvedValue([record()]);
    await expect(service.getDashboardMetrics()).resolves.toEqual({
      total_endpoints: 3, deprecated_count: 1, sunset_count: 1,
      at_risk_count: 1, average_active_clients: 5, high_impact_count: 1,
    });
  });

  it("uses zero average when no deprecated clients exist", async () => {
    const metrics = await service.getDashboardMetrics();
    expect(metrics.average_active_clients).toBe(0);
    expect(metrics.high_impact_count).toBe(0);
  });

  it("surfaces dashboard query failures with context", async () => {
    model.getAll.mockRejectedValue(new Error("query failed"));
    await expect(service.getDashboardMetrics()).rejects.toThrow("Failed to get dashboard metrics: query failed");
  });

  it("returns at-risk and deprecated records without altering their classification", async () => {
    model.getAtRisk.mockResolvedValue([record()]);
    model.getDeprecated.mockResolvedValue([record(), record({ id: "sun", status: "sunset" })]);
    expect(await service.getAtRiskEndpoints()).toHaveLength(1);
    expect((await service.getDeprecatedEndpoints()).map((r) => r.status)).toEqual(["deprecated", "sunset"]);
  });

  it("updates impact metrics and current deprecation status", async () => {
    model.getByEndpoint.mockResolvedValue(record());
    await service.updateImpactMetrics("/api/v1/legacy", "GET", 9, 12);
    expect(model.updateImpactScore).toHaveBeenCalledWith("dep-1", 9, 12);
    await service.updateDeprecationStatus("dep-1", "sunset");
    expect(model.update).toHaveBeenCalledWith("dep-1", { status: "sunset" });
  });

  it("does not modify impact metrics for a missing endpoint", async () => {
    await service.updateImpactMetrics("/missing", "GET", 5, 5);
    expect(model.updateImpactScore).not.toHaveBeenCalled();
  });

  it("reports migration progress metadata and returns null for missing records", async () => {
    expect(await service.getMigrationReport("/missing", "GET")).toBeNull();
    model.getByEndpoint.mockResolvedValue(record({ replacement_endpoint: "/api/v2/new", migration_guide: "/docs" }));
    expect(await service.getMigrationReport("/api/v1/legacy", "GET")).toEqual({
      endpoint: "/api/v1/legacy", method: "GET", status: "deprecated",
      replacement: "/api/v2/new", migration_guide: "/docs",
      active_clients: 4, last_used: new Date("2026-11-15T00:00:00Z"),
    });
  });
  it("persists a deprecated hit with client version and timestamp", async () => {
    const at = new Date("2026-11-18T12:00:00Z");
    model.getByEndpoint.mockResolvedValue(record());
    await service.recordDeprecatedHit("/api/v1/legacy", "GET", "client-1", "1.4.0", at);
    expect(model.recordClientUsage).toHaveBeenCalledWith("dep-1", "client-1", "1.4.0", at);
    expect(model.updateLastUsed).toHaveBeenCalledWith("dep-1");
  });

  it("ignores usage for active endpoints", async () => {
    model.getByEndpoint.mockResolvedValue(record({ status: "active" }));
    await service.recordDeprecatedHit("/api/v2/current", "GET", "client-1", "2.0.0");
    expect(model.recordClientUsage).not.toHaveBeenCalled();
  });

  it("returns weekly distinct-client aggregation from the model", async () => {
    model.getByEndpoint.mockResolvedValue(record());
    model.getWeeklyActiveClients.mockResolvedValue([
      { week: "2026-11-16", active_clients: 2 },
      { week: "2026-11-23", active_clients: 4 },
    ]);
    const since = new Date("2026-11-01T00:00:00Z");
    await expect(service.getWeeklyActiveDeprecatedClients("/api/v1/legacy", "GET", since))
      .resolves.toEqual([
        { week: "2026-11-16", active_clients: 2 },
        { week: "2026-11-23", active_clients: 4 },
      ]);
    expect(model.getWeeklyActiveClients).toHaveBeenCalledWith("dep-1", since);
  });

  it("classifies supported, deprecated, and sunset client versions", () => {
    const supported = ["2.0.0"];
    const deprecated = ["1.9.0"];
    expect(service.classifyClientVersion("2.0.0", supported, deprecated)).toBe("supported");
    expect(service.classifyClientVersion("1.9.0", supported, deprecated)).toBe("deprecated");
    expect(service.classifyClientVersion("1.0.0", supported, deprecated)).toBe("sunset");
  });

});
