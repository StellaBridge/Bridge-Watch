import { beforeEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { operationalAccessAuditRoutes } from "../../api/routes/operationalAccessAudit.js";

const database = vi.hoisted(() => vi.fn());
vi.mock("../../database/connection.js", () => ({ getDatabase: database }));

function queryResult(value: unknown) {
  const query: any = vi.fn(() => query);
  query.orderBy = vi.fn(() => query);
  query.limit = vi.fn(() => query);
  query.offset = vi.fn(() => query);
  query.where = vi.fn(() => query);
  query.select = vi.fn(() => query);
  query.count = vi.fn(() => query);
  query.groupBy = vi.fn(() => query);
  query.first = vi.fn().mockResolvedValue(value);
  query.then = (resolve: (value: unknown) => unknown) => Promise.resolve(value).then(resolve);
  return query;
}

describe("operationalAccessAuditRoutes", () => {
  let app: ReturnType<typeof Fastify>;
  beforeEach(async () => {
    database.mockImplementation((table: string) => {
      if (table === "audit_logs") return queryResult([{ id: "log-1", action: "login" }]);
      if (table === "role_assignments") return queryResult([{ id: "role-1" }]);
      return queryResult([{ id: "session-1" }]);
    });
    app = Fastify();
    await app.register(operationalAccessAuditRoutes);
  });

  it("lists audit entries with filters", async () => {
    const response = await app.inject({ method: "GET", url: "/entries?page=2&limit=10&role=admin&action=login" });
    expect(response.statusCode).toBe(200);
    expect(response.json().entries).toHaveLength(1);
  });

  it("returns stats, roles and sessions", async () => {
    const stats = await app.inject({ method: "GET", url: "/stats" });
    expect(stats.statusCode).toBe(200);
    expect(stats.json()).toHaveProperty("total");

    const roles = await app.inject({ method: "GET", url: "/roles" });
    expect(roles.statusCode).toBe(200);
    expect(roles.json().members).toHaveLength(1);

    const sessions = await app.inject({ method: "GET", url: "/sessions?status=active" });
    expect(sessions.statusCode).toBe(200);
    expect(sessions.json().sessions).toHaveLength(1);
  });

  it("protects exports with the configured API key", async () => {
    process.env.ADMIN_EXPORT_API_KEY = "export-key";
    const unauthorized = await app.inject({ method: "GET", url: "/export", headers: { "x-api-key": "wrong-key" } });
    expect(unauthorized.statusCode).toBe(401);
    const authorized = await app.inject({ method: "GET", url: "/export", headers: { "x-api-key": "export-key" } });
    expect(authorized.statusCode).toBe(200);
    delete process.env.ADMIN_EXPORT_API_KEY;
  });
});
