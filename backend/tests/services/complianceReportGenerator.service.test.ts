import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateKeyPairSync,
  createHash,
  createVerify,
} from "crypto";
import { ComplianceReportGenerator, type ReportSection } from "../../src/services/complianceReportGenerator.service.js";

const mocks = vi.hoisted(() => ({
  db: undefined as any,
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("fs", () => ({
  readFileSync: mocks.readFileSync,
  writeFileSync: mocks.writeFileSync,
  mkdirSync: mocks.mkdirSync,
  default: {
    readFileSync: mocks.readFileSync,
    writeFileSync: mocks.writeFileSync,
    mkdirSync: mocks.mkdirSync,
  },
}));

vi.mock("../../src/database/connection.js", () => ({
  getDatabase: () => mocks.db,
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: { info: mocks.loggerInfo, warn: mocks.loggerWarn, error: mocks.loggerError, debug: vi.fn() },
}));

// A real RSA keypair, generated once, so the signature test exercises genuine
// RSA-SHA256 signing/verification rather than a stubbed-out crypto call.
const { privateKey: TEST_PRIVATE_KEY, publicKey: TEST_PUBLIC_KEY } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const TEST_PRIVATE_KEY_PEM = TEST_PRIVATE_KEY.export({ type: "pkcs1", format: "pem" }).toString();
const TEST_PUBLIC_KEY_PEM = TEST_PUBLIC_KEY.export({ type: "pkcs1", format: "pem" }).toString();

/** A shared chain whose terminal `await` resolves to `rows` no matter which
 *  builder methods (whereBetween/select/groupBy/orderBy/limit/where) were
 *  chained first — mirroring how knex builders are themselves thenable. */
function createChain(rows: Record<string, unknown>[]) {
  const chain: any = {};
  for (const method of ["whereBetween", "select", "groupBy", "count", "orderBy", "limit", "where", "whereIn"]) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }
  chain.first = vi.fn().mockResolvedValue(undefined);
  chain.insert = vi.fn().mockResolvedValue([1]);
  chain.update = vi.fn().mockResolvedValue(1);
  chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(rows).then(resolve, reject);
  return chain;
}

interface FakeDbOptions {
  templateRow?: Record<string, unknown>;
  reportRow?: Record<string, unknown>;
  sectionRows?: Record<string, Record<string, unknown>[]>;
  throwForTable?: Record<string, Error>;
}

function createFakeDb(options: FakeDbOptions = {}) {
  const inserts: Record<string, any[]> = {};
  const updates: Record<string, any[]> = {};
  const chainsByTable: Record<string, any[]> = {};

  const db = vi.fn((table: string) => {
    if (options.throwForTable?.[table]) {
      throw options.throwForTable[table];
    }

    let chain: any;
    if (table === "report_templates") {
      chain = createChain([]);
      chain.first = vi.fn().mockResolvedValue(options.templateRow);
      chain.insert = vi.fn().mockImplementation((row: unknown) => {
        (inserts[table] ??= []).push(row);
        return Promise.resolve([1]);
      });
    } else if (table === "compliance_reports") {
      chain = createChain([]);
      chain.first = vi.fn().mockResolvedValue(options.reportRow);
      chain.insert = vi.fn().mockImplementation((row: unknown) => {
        (inserts[table] ??= []).push(row);
        return Promise.resolve([1]);
      });
      chain.update = vi.fn().mockImplementation((row: unknown) => {
        (updates[table] ??= []).push(row);
        return Promise.resolve(1);
      });
    } else if (table === "report_archives") {
      chain = createChain([]);
      chain.insert = vi.fn().mockImplementation((row: unknown) => {
        (inserts[table] ??= []).push(row);
        return Promise.resolve([1]);
      });
    } else {
      chain = createChain(options.sectionRows?.[table] ?? []);
    }

    (chainsByTable[table] ??= []).push(chain);
    return chain;
  });

  return { db, inserts, updates, chainsByTable };
}

function reserveAttestationSection(overrides: Partial<ReportSection> = {}): ReportSection {
  return {
    id: "sec-reserves",
    title: "Reserve Attestations",
    description: "Bridge reserve balance attestations",
    dataSource: "reserve_attestations",
    fields: ["bridge_id", "reserve_ratio", "observed_at"],
    ...overrides,
  };
}

function makeTemplateRow(sections: ReportSection[]) {
  return {
    id: "tmpl-1",
    name: "Reserve Compliance Report",
    type: "compliance_audit",
    description: "Reserve attestation compliance report",
    sections: JSON.stringify(sections),
    includes: JSON.stringify({
      summary: true,
      charts: false,
      rawData: true,
      metrics: false,
      timeline: false,
      incidents: false,
    }),
    filters: JSON.stringify([]),
    is_active: true,
    created_at: new Date("2026-01-01T00:00:00Z"),
    updated_at: new Date("2026-01-01T00:00:00Z"),
  };
}

const PERIOD_START = new Date("2026-02-01T00:00:00Z");
const PERIOD_END = new Date("2026-02-28T23:59:59Z");

describe("ComplianceReportGenerator.generateReport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.REPORT_DIR = "/tmp/bridge-watch-reports";
    process.env.ARCHIVE_DIR = "/tmp/bridge-watch-archives";
    delete process.env.REPORT_SIGNING_KEY_PATH;
  });

  it("generates a report over the requested date range from reserve balance attestation records", async () => {
    const section = reserveAttestationSection();
    const attestations = [
      { bridge_id: "usdc-ethereum", reserve_ratio: 1.02, observed_at: new Date("2026-02-05T00:00:00Z") },
      { bridge_id: "usdc-ethereum", reserve_ratio: 0.98, observed_at: new Date("2026-02-12T00:00:00Z") },
      { bridge_id: "eurc-ethereum", reserve_ratio: 1.0, observed_at: new Date("2026-02-20T00:00:00Z") },
    ];
    const { db, inserts, chainsByTable } = createFakeDb({
      templateRow: makeTemplateRow([section]),
      sectionRows: { reserve_attestations: attestations },
    });
    mocks.db = db;

    const service = new ComplianceReportGenerator();
    const report = await service.generateReport("tmpl-1", "json", {
      generatedBy: "auditor@bridgewatch",
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });

    expect(report.periodStart).toBe(PERIOD_START);
    expect(report.periodEnd).toBe(PERIOD_END);
    expect(report.title).toBe(
      `Reserve Compliance Report - ${PERIOD_START.toISOString().split("T")[0]} to ${PERIOD_END.toISOString().split("T")[0]}`
    );
    expect(report.metadata.totalRecords).toBe(3);

    const parsed = JSON.parse(report.content as string);
    expect(parsed.sections["sec-reserves"].recordCount).toBe(3);
    // JSON.stringify serializes Date fields to ISO strings, so compare against
    // that shape rather than the original Date-bearing records.
    expect(parsed.sections["sec-reserves"].records).toEqual(
      attestations.map((a) => ({ ...a, observed_at: a.observed_at.toISOString() }))
    );

    // The section query was scoped to the requested period.
    const sectionChain = chainsByTable["reserve_attestations"][0];
    expect(sectionChain.whereBetween).toHaveBeenCalledWith("created_at", [PERIOD_START, PERIOD_END]);

    // The generated report was persisted.
    expect(inserts["compliance_reports"]).toHaveLength(1);
    expect(inserts["compliance_reports"][0]).toMatchObject({
      template_id: "tmpl-1",
      type: "compliance_audit",
      format: "json",
      generated_by: "auditor@bridgewatch",
    });
    expect(mocks.writeFileSync).toHaveBeenCalledTimes(1);
  });

  it("throws when the requested template does not exist", async () => {
    const { db } = createFakeDb({ templateRow: undefined });
    mocks.db = db;

    const service = new ComplianceReportGenerator();

    await expect(
      service.generateReport("missing-template", "json", {
        generatedBy: "auditor@bridgewatch",
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
      })
    ).rejects.toThrow("Template not found");
    expect(mocks.loggerError).toHaveBeenCalled();
  });
});

describe("ComplianceReportGenerator summary statistics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.REPORT_DIR = "/tmp/bridge-watch-reports";
    process.env.ARCHIVE_DIR = "/tmp/bridge-watch-archives";
    delete process.env.REPORT_SIGNING_KEY_PATH;
  });

  it("counts records per section and omits sections with no records", async () => {
    const sections = [
      reserveAttestationSection({ id: "sec-reserves", title: "Reserve Attestations" }),
      reserveAttestationSection({
        id: "sec-liquidity",
        title: "Liquidity Snapshots",
        dataSource: "liquidity_snapshots",
        fields: ["bridge_id", "total_liquidity"],
      }),
    ];
    const { db } = createFakeDb({
      templateRow: makeTemplateRow(sections),
      sectionRows: {
        reserve_attestations: [
          { bridge_id: "usdc-ethereum", reserve_ratio: 1.02 },
          { bridge_id: "eurc-ethereum", reserve_ratio: 1.0 },
        ],
        liquidity_snapshots: [], // sparse: nothing observed this period
      },
    });
    mocks.db = db;

    const service = new ComplianceReportGenerator();
    const report = await service.generateReport("tmpl-1", "json", {
      generatedBy: "auditor@bridgewatch",
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });

    // Note: this service's summary step reports per-section record counts; it
    // does not compute an average/minimum reserve ratio anywhere in the
    // codebase, so that's what this test verifies rather than a calculation
    // that doesn't exist.
    expect(report.metadata.summary["Reserve Attestations_count"]).toBe(2);
    expect(report.metadata.summary.sectionsIncluded).toBe(2);
    expect(report.metadata.summary).not.toHaveProperty("Liquidity Snapshots_count");
    expect(report.metadata.totalRecords).toBe(2);
  });
});

describe("ComplianceReportGenerator digital signatures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.REPORT_DIR = "/tmp/bridge-watch-reports";
    process.env.ARCHIVE_DIR = "/tmp/bridge-watch-archives";
  });

  it("signs the report's content hash with the configured private key", async () => {
    process.env.REPORT_SIGNING_KEY_PATH = "/secrets/report-signing-key.pem";
    mocks.readFileSync.mockImplementation((path: string) =>
      path === "/secrets/report-signing-key.pem" ? TEST_PRIVATE_KEY_PEM : ""
    );

    const section = reserveAttestationSection();
    const { db } = createFakeDb({
      templateRow: makeTemplateRow([section]),
      sectionRows: { reserve_attestations: [{ bridge_id: "usdc-ethereum", reserve_ratio: 1.0 }] },
    });
    mocks.db = db;

    const service = new ComplianceReportGenerator();
    const report = await service.generateReport("tmpl-1", "json", {
      generatedBy: "auditor@bridgewatch",
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      includeSignature: true,
    });

    expect(report.signatureData).not.toBeNull();
    expect(report.signatureData).toMatchObject({ algorithm: "RSA-SHA256", signedBy: "auditor@bridgewatch" });

    // The signature must genuinely validate against the report's own content
    // hash with the paired public key — proving it signs real content, not a
    // stubbed value.
    const expectedHash = createHash("sha256").update(report.content as string).digest("hex");
    expect(report.contentHash).toBe(expectedHash);

    const verifier = createVerify("RSA-SHA256");
    verifier.update(report.contentHash);
    const isValid = verifier.verify(TEST_PUBLIC_KEY_PEM, report.signatureData!.signature, "base64");
    expect(isValid).toBe(true);
  });

  it("skips signing when no signing key is configured, even if a signature was requested", async () => {
    delete process.env.REPORT_SIGNING_KEY_PATH;

    const section = reserveAttestationSection();
    const { db } = createFakeDb({
      templateRow: makeTemplateRow([section]),
      sectionRows: { reserve_attestations: [] },
    });
    mocks.db = db;

    const service = new ComplianceReportGenerator();
    const report = await service.generateReport("tmpl-1", "json", {
      generatedBy: "auditor@bridgewatch",
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      includeSignature: true,
    });

    expect(report.signatureData).toBeNull();
  });

  it("fails report generation when the configured signing key cannot be read", async () => {
    process.env.REPORT_SIGNING_KEY_PATH = "/secrets/missing-key.pem";
    mocks.readFileSync.mockImplementation(() => {
      throw new Error("ENOENT: no such file or directory");
    });

    const section = reserveAttestationSection();
    const { db } = createFakeDb({
      templateRow: makeTemplateRow([section]),
      sectionRows: { reserve_attestations: [] },
    });
    mocks.db = db;

    const service = new ComplianceReportGenerator();

    await expect(
      service.generateReport("tmpl-1", "json", {
        generatedBy: "auditor@bridgewatch",
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        includeSignature: true,
      })
    ).rejects.toThrow("ENOENT");
    expect(mocks.loggerError).toHaveBeenCalled();
  });
});

describe("ComplianceReportGenerator error handling for missing or sparse data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.REPORT_DIR = "/tmp/bridge-watch-reports";
    process.env.ARCHIVE_DIR = "/tmp/bridge-watch-archives";
    delete process.env.REPORT_SIGNING_KEY_PATH;
  });

  it("still produces a report when every section is empty for the period", async () => {
    const section = reserveAttestationSection();
    const { db } = createFakeDb({
      templateRow: makeTemplateRow([section]),
      sectionRows: { reserve_attestations: [] },
    });
    mocks.db = db;

    const service = new ComplianceReportGenerator();
    const report = await service.generateReport("tmpl-1", "json", {
      generatedBy: "auditor@bridgewatch",
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });

    expect(report.metadata.totalRecords).toBe(0);
    const parsed = JSON.parse(report.content as string);
    expect(parsed.sections["sec-reserves"].recordCount).toBe(0);
    expect(parsed.sections["sec-reserves"].records).toEqual([]);
  });

  it("degrades a single failing section gracefully instead of failing the whole report", async () => {
    const goodSection = reserveAttestationSection({ id: "sec-reserves", title: "Reserve Attestations" });
    const badSection = reserveAttestationSection({
      id: "sec-incidents",
      title: "Incident Log",
      dataSource: "bridge_incidents",
      fields: ["id", "severity"],
    });
    const { db } = createFakeDb({
      templateRow: makeTemplateRow([goodSection, badSection]),
      sectionRows: {
        reserve_attestations: [{ bridge_id: "usdc-ethereum", reserve_ratio: 1.0 }],
      },
      throwForTable: { bridge_incidents: new Error("connection refused") },
    });
    mocks.db = db;

    const service = new ComplianceReportGenerator();
    const report = await service.generateReport("tmpl-1", "json", {
      generatedBy: "auditor@bridgewatch",
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });

    const parsed = JSON.parse(report.content as string);
    expect(parsed.sections["sec-reserves"].recordCount).toBe(1);
    expect(parsed.sections["sec-incidents"]).toMatchObject({
      recordCount: 0,
      records: [],
      error: "connection refused",
    });
    // The failing section does not inflate or corrupt the overall record count.
    expect(report.metadata.totalRecords).toBe(1);
  });

  it("propagates an error and never persists a report when the template lookup itself fails", async () => {
    const { db, inserts } = createFakeDb({
      throwForTable: { report_templates: new Error("database unreachable") },
    });
    mocks.db = db;

    const service = new ComplianceReportGenerator();

    await expect(
      service.generateReport("tmpl-1", "json", {
        generatedBy: "auditor@bridgewatch",
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
      })
    ).rejects.toThrow("database unreachable");
    expect(inserts["compliance_reports"]).toBeUndefined();
    expect(mocks.writeFileSync).not.toHaveBeenCalled();
  });
});
