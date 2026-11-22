import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

const serviceMocks = vi.hoisted(() => ({
  createTemplate: vi.fn(),
  generateReport: vi.fn(),
  archiveReport: vi.fn(),
}));

vi.mock("../../services/complianceReportGenerator.service.js", () => ({
  complianceReportGenerator: serviceMocks,
}));

vi.mock("../../api/middleware/auth.js", () => ({
  authMiddleware:
    (options: { requiredScopes?: string[] } = {}) =>
    async (request: any, reply: any) => {
      const header = request.headers["x-test-scopes"];
      if (typeof header !== "string") {
        return reply.status(401).send({ error: "Unauthorized" });
      }
      const granted = header.split(",").map((s: string) => s.trim()).filter(Boolean);
      const required = options.requiredScopes ?? [];
      if (!granted.includes("*") && !required.every((scope) => granted.includes(scope))) {
        return reply.status(403).send({ error: "Forbidden" });
      }
      request.tenantContext = { tenantId: "t-1", actorId: "u-1", actorType: "user", bypass: false };
    },
}));

vi.mock("../../api/routes/complianceRetentionExceptions.routes.js", () => ({
  complianceRetentionExceptionRoutes: async (_server: any) => {},
}));

vi.mock("../../api/routes/reportTemplateVersion.routes.js", () => ({
  reportTemplateVersionRoutes: async (_server: any) => {},
}));

import { complianceReportRoutes } from "../../api/routes/complianceReports.routes.js";

const AUTH = { "x-test-scopes": "*" };
const TEMPLATE_ID = "tmpl-1a2b3c4d";
const REPORT_ID = "rpt-9z8y7x6w";

const BASE_TEMPLATE_BODY = {
  name: "Monthly Bridge Activity Report",
  type: "bridge_activity",
  sections: [
    { id: "s1", title: "Summary", dataSource: "transactions", fields: ["amount", "status"] },
  ],
  includes: {
    summary: true,
    charts: false,
    rawData: false,
    metrics: true,
    timeline: false,
    incidents: false,
  },
};

function makeTemplate(overrides: Record<string, unknown> = {}) {
  return {
    id: TEMPLATE_ID,
    name: BASE_TEMPLATE_BODY.name,
    type: BASE_TEMPLATE_BODY.type,
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeReport(overrides: Record<string, unknown> = {}) {
  return {
    id: REPORT_ID,
    title: "Monthly Bridge Activity Report — Jan 2026",
    type: "bridge_activity",
    format: "pdf",
    generatedAt: "2026-01-31T23:00:00.000Z",
    periodStart: "2026-01-01T00:00:00.000Z",
    periodEnd: "2026-01-31T23:59:59.000Z",
    contentHash: "sha256-abc123",
    signatureData: null,
    metadata: { rowCount: 150 },
    ...overrides,
  };
}

describe("complianceReportRoutes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.resetAllMocks();

    serviceMocks.createTemplate.mockResolvedValue(makeTemplate());
    serviceMocks.generateReport.mockResolvedValue(makeReport());
    serviceMocks.archiveReport.mockResolvedValue({
      id: "arch-001",
      reportId: REPORT_ID,
      archiveFormat: "zip",
      location: "s3://bridge-watch-archives/reports/rpt-9z8y7x6w.zip",
      size: 204800,
      expiresAt: "2033-01-31T23:00:00.000Z",
      archivedAt: "2026-01-31T23:05:00.000Z",
    });

    app = Fastify();
    await app.register(complianceReportRoutes);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it.each([
    { method: "POST", url: "/compliance-reports/templates", payload: BASE_TEMPLATE_BODY },
    { method: "POST", url: "/compliance-reports/generate", payload: { templateId: TEMPLATE_ID, format: "pdf", periodStart: "2026-01-01T00:00:00Z", periodEnd: "2026-01-31T23:59:59Z", generatedBy: "admin" } },
    { method: "POST", url: `/compliance-reports/${REPORT_ID}/archive` },
  ] as const)("$method $url returns 401 without credentials", async (endpoint) => {
    const res = await app.inject({ ...endpoint });

    expect(res.statusCode).toBe(401);
    for (const fn of Object.values(serviceMocks)) expect(fn).not.toHaveBeenCalled();
  });

  describe("POST /compliance-reports/templates", () => {
    it("creates a report template with valid body", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/compliance-reports/templates",
        headers: AUTH,
        payload: BASE_TEMPLATE_BODY,
      });

      expect(res.statusCode).toBe(201);
      expect(res.headers["content-type"]).toContain("application/json");
      expect(res.json()).toHaveProperty("template");
      expect(serviceMocks.createTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: BASE_TEMPLATE_BODY.name,
          type: "bridge_activity",
          isActive: true,
        })
      );
    });

    it.each([
      ["bridge_activity"],
      ["asset_health"],
      ["compliance_audit"],
      ["regulatory_filing"],
      ["incident_summary"],
    ] as const)("accepts report type '%s'", async ([type]) => {
      const res = await app.inject({
        method: "POST",
        url: "/compliance-reports/templates",
        headers: AUTH,
        payload: { ...BASE_TEMPLATE_BODY, type },
      });

      expect(res.statusCode).toBe(201);
    });

    it("returns 400 when name is missing", async () => {
      const { name: _, ...noName } = BASE_TEMPLATE_BODY;

      const res = await app.inject({
        method: "POST",
        url: "/compliance-reports/templates",
        headers: AUTH,
        payload: noName,
      });

      expect(res.statusCode).toBe(400);
      expect(serviceMocks.createTemplate).not.toHaveBeenCalled();
    });

    it("returns 400 when type is invalid", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/compliance-reports/templates",
        headers: AUTH,
        payload: { ...BASE_TEMPLATE_BODY, type: "unknown_type" },
      });

      expect(res.statusCode).toBe(400);
      expect(serviceMocks.createTemplate).not.toHaveBeenCalled();
    });

    it("returns 400 when service throws", async () => {
      serviceMocks.createTemplate.mockRejectedValue(new Error("Duplicate template name"));

      const res = await app.inject({
        method: "POST",
        url: "/compliance-reports/templates",
        headers: AUTH,
        payload: BASE_TEMPLATE_BODY,
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toHaveProperty("error");
    });
  });

  describe("POST /compliance-reports/generate", () => {
    const validGenBody = {
      templateId: TEMPLATE_ID,
      format: "pdf",
      periodStart: "2026-01-01T00:00:00.000Z",
      periodEnd: "2026-01-31T23:59:59.000Z",
      generatedBy: "compliance-officer@bridge.watch",
    };

    it("generates a report from a template", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/compliance-reports/generate",
        headers: AUTH,
        payload: validGenBody,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty("report");
      expect(body.report.id).toBe(REPORT_ID);
      expect(body.report.contentHash).toBe("sha256-abc123");
      expect(serviceMocks.generateReport).toHaveBeenCalledWith(
        TEMPLATE_ID,
        "pdf",
        expect.objectContaining({
          generatedBy: "compliance-officer@bridge.watch",
        })
      );
    });

    it.each([["pdf"], ["csv"], ["json"], ["html"]] as const)(
      "accepts format '%s'",
      async ([format]) => {
        const res = await app.inject({
          method: "POST",
          url: "/compliance-reports/generate",
          headers: AUTH,
          payload: { ...validGenBody, format },
        });

        expect(res.statusCode).toBe(200);
      }
    );

    it("passes includeSignature and archiveAfter flags to service", async () => {
      await app.inject({
        method: "POST",
        url: "/compliance-reports/generate",
        headers: AUTH,
        payload: { ...validGenBody, includeSignature: true, archiveAfter: true },
      });

      expect(serviceMocks.generateReport).toHaveBeenCalledWith(
        TEMPLATE_ID,
        "pdf",
        expect.objectContaining({ includeSignature: true, archiveAfter: true })
      );
    });

    it("returns 400 when periodStart is missing", async () => {
      const { periodStart: _, ...noPeriodStart } = validGenBody;

      const res = await app.inject({
        method: "POST",
        url: "/compliance-reports/generate",
        headers: AUTH,
        payload: noPeriodStart,
      });

      expect(res.statusCode).toBe(400);
      expect(serviceMocks.generateReport).not.toHaveBeenCalled();
    });

    it("returns 400 when format is invalid", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/compliance-reports/generate",
        headers: AUTH,
        payload: { ...validGenBody, format: "docx" },
      });

      expect(res.statusCode).toBe(400);
      expect(serviceMocks.generateReport).not.toHaveBeenCalled();
    });

    it("returns 400 when service throws", async () => {
      serviceMocks.generateReport.mockRejectedValue(new Error("Template not found"));

      const res = await app.inject({
        method: "POST",
        url: "/compliance-reports/generate",
        headers: AUTH,
        payload: validGenBody,
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toContain("Template not found");
    });
  });

  describe("POST /compliance-reports/:reportId/archive", () => {
    it("archives a generated report", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/compliance-reports/${REPORT_ID}/archive`,
        headers: AUTH,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty("archive");
      expect(body.archive.reportId).toBe(REPORT_ID);
      expect(body.archive).toHaveProperty("location");
      expect(body.archive).toHaveProperty("expiresAt");
      expect(serviceMocks.archiveReport).toHaveBeenCalledWith(REPORT_ID);
    });

    it("returns 400 when report is not found", async () => {
      serviceMocks.archiveReport.mockRejectedValue(new Error("Report not found"));

      const res = await app.inject({
        method: "POST",
        url: `/compliance-reports/non-existent-id/archive`,
        headers: AUTH,
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toHaveProperty("error");
    });
  });
});
