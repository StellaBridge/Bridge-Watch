import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
  rebuildSearchIndex: vi.fn(),
  getIndexStatus: vi.fn(),
  db: undefined as any,
}));

vi.mock("../../src/database/connection.js", () => ({
  getDatabase: () => mocks.db,
}));

// ─── In-memory fake knex, shared by the integration describes below ────────

function createMetadataChain(getState: () => Record<string, any>) {
  const chain: any = {};
  for (const m of ["select", "whereIn", "orderBy"]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  let pendingWhere: Record<string, unknown> | null = null;
  chain.where = vi.fn().mockImplementation((cond: Record<string, unknown>) => {
    pendingWhere = cond;
    return chain;
  });
  chain.timeout = vi.fn().mockImplementation(() =>
    Promise.resolve(
      Object.values(getState()).sort((a: any, b: any) => String(a.entity_type).localeCompare(String(b.entity_type)))
    )
  );
  chain.update = vi.fn().mockImplementation((patch: Record<string, unknown>) => {
    const key = String(pendingWhere?.entity_type);
    const state = getState();
    if (state[key]) {
      Object.assign(state[key], patch);
      return Promise.resolve(1);
    }
    return Promise.resolve(0);
  });
  chain.insert = vi.fn().mockImplementation((row: Record<string, unknown>) => {
    getState()[String(row.entity_type)] = { ...row };
    return Promise.resolve([1]);
  });
  return chain;
}

function createSearchDocumentsChain(
  getDocs: () => any[],
  setDocs: (docs: any[]) => void,
  insertPayloads: Record<string, any[][]>
) {
  const chain: any = {};
  let pendingWhere: Record<string, unknown> | null = null;
  const matches = (row: any) =>
    !pendingWhere || Object.entries(pendingWhere).every(([k, v]) => row[k] === v);

  chain.where = vi.fn().mockImplementation((cond: Record<string, unknown>) => {
    pendingWhere = cond;
    return chain;
  });
  chain.delete = vi.fn().mockImplementation(() => {
    const before = getDocs();
    const remaining = before.filter((r) => !matches(r));
    setDocs(remaining);
    return Promise.resolve(before.length - remaining.length);
  });
  chain.insert = vi.fn().mockImplementation((payload: any[]) => {
    (insertPayloads["search_documents"] ??= []).push(payload);
    const byKey = new Map(getDocs().map((d: any) => [d.document_key, d]));
    for (const row of payload) byKey.set(row.document_key, row);
    setDocs(Array.from(byKey.values()));
    return chain;
  });
  chain.onConflict = vi.fn().mockReturnValue(chain);
  chain.merge = vi.fn().mockReturnValue(Promise.resolve(undefined));
  chain.count = vi.fn().mockImplementation(() => {
    const count = getDocs().filter(matches).length;
    return Promise.resolve([{ count: String(count) }]);
  });
  return chain;
}

function createSourceTableChain(rows: any[]) {
  const chain: any = {};
  for (const m of ["select", "where", "join", "whereIn", "orderBy"]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(rows).then(resolve, reject);
  return chain;
}

interface FakeDbOptions {
  metadata?: Record<string, any>;
  assets?: any[];
  bridges?: any[];
  tags?: any[];
  assetTags?: any[];
  seedDocuments?: any[];
  throwForTable?: Record<string, Error>;
}

function createFakeDb(options: FakeDbOptions = {}) {
  const state = {
    metadata: { ...(options.metadata ?? {}) } as Record<string, any>,
    documents: [...(options.seedDocuments ?? [])] as any[],
  };
  const sourceRows: Record<string, any[]> = {
    assets: options.assets ?? [],
    bridges: options.bridges ?? [],
    tags: options.tags ?? [],
    asset_tags: options.assetTags ?? [],
  };
  const insertPayloads: Record<string, any[][]> = {};

  const db: any = vi.fn((table: string) => {
    if (options.throwForTable?.[table]) {
      throw options.throwForTable[table];
    }
    if (table === "search_index_metadata") {
      return createMetadataChain(() => state.metadata);
    }
    if (table === "search_documents") {
      return createSearchDocumentsChain(
        () => state.documents,
        (docs) => {
          state.documents = docs;
        },
        insertPayloads
      );
    }
    return createSourceTableChain(sourceRows[table] ?? []);
  });
  db.transaction = vi.fn().mockImplementation(async (fn: (trx: unknown) => Promise<unknown>) => fn(db));
  db.raw = vi.fn((sql: string) => sql);

  return { db, state, insertPayloads };
}

function metadataRow(entityType: string, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    entity_type: entityType,
    last_indexed: new Date(),
    total_records: 1,
    indexed_records: 1,
    status: "ready",
    error_message: null,
    ...overrides,
  };
}

// ─── Job orchestration (SearchService mocked wholesale) ────────────────────

describe("processSearchIndexRebuild job orchestration", () => {
  let processSearchIndexRebuild: (typeof import("../../src/workers/searchIndexRebuild.job.js"))["processSearchIndexRebuild"];

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    vi.doMock("../../src/utils/logger.js", () => ({
      logger: { info: mocks.loggerInfo, warn: mocks.loggerWarn, error: mocks.loggerError, debug: vi.fn() },
    }));
    vi.doMock("../../src/services/search.service.js", () => ({
      SearchService: class {
        rebuildSearchIndex = mocks.rebuildSearchIndex;
        getIndexStatus = mocks.getIndexStatus;
      },
    }));

    const mod = await import("../../src/workers/searchIndexRebuild.job.js");
    processSearchIndexRebuild = mod.processSearchIndexRebuild;
  });

  it("runs a full rebuild of every entity type when job.data.full is true", async () => {
    mocks.rebuildSearchIndex.mockResolvedValue(undefined);

    await processSearchIndexRebuild({ id: "job-1", data: { full: true } } as any);

    expect(mocks.rebuildSearchIndex).toHaveBeenCalledWith();
    expect(mocks.getIndexStatus).not.toHaveBeenCalled();
    expect(mocks.loggerInfo).toHaveBeenCalledWith({ jobId: "job-1" }, "Full search index rebuild completed");
  });

  it("treats a missing job.data as an incremental run and does nothing when the index is fresh", async () => {
    mocks.getIndexStatus.mockResolvedValue([
      { entityType: "asset", status: "ready", lastIndexed: new Date().toISOString() },
    ]);

    await processSearchIndexRebuild({ id: "job-2", data: undefined } as any);

    expect(mocks.rebuildSearchIndex).not.toHaveBeenCalled();
    expect(mocks.loggerInfo).toHaveBeenCalledWith({ jobId: "job-2" }, "Search index is fresh — nothing to rebuild");
  });

  it("rebuilds only the stale entity types on an incremental run", async () => {
    const fresh = new Date().toISOString();
    const staleAge = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    mocks.getIndexStatus.mockResolvedValue([
      { entityType: "asset", status: "ready", lastIndexed: fresh },
      { entityType: "bridge", status: "ready", lastIndexed: null },
      { entityType: "incident", status: "error", lastIndexed: fresh },
      { entityType: "alert", status: "ready", lastIndexed: staleAge },
    ]);
    mocks.rebuildSearchIndex.mockResolvedValue(undefined);

    await processSearchIndexRebuild({ id: "job-3", data: { full: false } } as any);

    expect(mocks.rebuildSearchIndex).toHaveBeenCalledWith(["bridge", "incident", "alert"]);
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      { jobId: "job-3", rebuiltTypes: ["bridge", "incident", "alert"] },
      "Incremental search index rebuild completed"
    );
  });

  it("logs and rethrows when the rebuild fails", async () => {
    const error = new Error("transaction aborted");
    mocks.rebuildSearchIndex.mockRejectedValue(error);

    await expect(
      processSearchIndexRebuild({ id: "job-err", data: { full: true } } as any)
    ).rejects.toThrow("transaction aborted");
    expect(mocks.loggerError).toHaveBeenCalledWith(
      { jobId: "job-err", error },
      "Search index rebuild job failed"
    );
  });
});

// ─── Integration: real SearchService + real job, fake knex ─────────────────

describe("processSearchIndexRebuild integration", () => {
  let processSearchIndexRebuild: (typeof import("../../src/workers/searchIndexRebuild.job.js"))["processSearchIndexRebuild"];

  beforeEach(async () => {
    vi.resetModules();
    vi.doMock("../../src/utils/logger.js", () => ({
      logger: { info: mocks.loggerInfo, warn: mocks.loggerWarn, error: mocks.loggerError, debug: vi.fn() },
    }));
    mocks.loggerInfo.mockClear();
    mocks.loggerWarn.mockClear();
    mocks.loggerError.mockClear();

    processSearchIndexRebuild = (await import("../../src/workers/searchIndexRebuild.job.js"))
      .processSearchIndexRebuild;
  });

  it("incrementally reindexes only the stale bridge type, leaving a fresh asset type's documents untouched", async () => {
    const existingAssetDoc = { document_key: "asset:a1", entity_type: "asset", title: "USDC (stale snapshot)" };
    const existingBridgeDoc = { document_key: "bridge:b1", entity_type: "bridge", title: "Old Bridge Name" };

    const fresh = new Date();
    const stale = new Date(Date.now() - 10 * 60 * 1000);
    const { db, state } = createFakeDb({
      metadata: {
        asset: metadataRow("asset", { last_indexed: fresh }),
        bridge: metadataRow("bridge", { last_indexed: stale }),
      },
      assets: [{ id: "a1", symbol: "USDC", name: "USD Coin", is_active: true, updated_at: fresh }],
      bridges: [
        { id: "b1", name: "Cross-Chain USDC Bridge", source_chain: "Ethereum", status: "healthy", total_value_locked: 5_000_000, is_active: true, updated_at: fresh },
      ],
      seedDocuments: [existingAssetDoc, existingBridgeDoc],
    });
    mocks.db = db;

    await processSearchIndexRebuild({ id: "job-1", data: {} } as any);

    // The fresh asset type was never touched: its stale-looking document and
    // metadata survive exactly as they were, because reindexEntityType("asset")
    // was never invoked.
    expect(state.documents.find((d) => d.document_key === "asset:a1")).toEqual(existingAssetDoc);
    expect(state.metadata.asset.last_indexed).toEqual(fresh);

    // The stale bridge type was rebuilt: its old document was replaced with a
    // freshly built one reflecting the current source row.
    const rebuiltBridgeDoc = state.documents.find((d) => d.document_key === "bridge:b1");
    expect(rebuiltBridgeDoc).toBeDefined();
    expect(rebuiltBridgeDoc.title).toBe("Cross-Chain USDC Bridge");
    expect(state.metadata.bridge.status).toBe("ready");
    expect(state.metadata.bridge.last_indexed).not.toEqual(stale);
  });

  it("tokenizes a rebuilt bridge document for multi-word names and hyphenated/symbol terms", async () => {
    const stale = new Date(Date.now() - 10 * 60 * 1000);
    const { db, state } = createFakeDb({
      metadata: { bridge: metadataRow("bridge", { last_indexed: stale }) },
      bridges: [
        {
          id: "b1",
          name: "Cross-Chain USDC Bridge",
          source_chain: "Ethereum",
          status: "healthy",
          total_value_locked: 1,
          is_active: true,
          updated_at: new Date(),
        },
      ],
    });
    mocks.db = db;

    await processSearchIndexRebuild({ id: "job-1", data: {} } as any);

    const doc = state.documents.find((d) => d.document_key === "bridge:b1");
    // search_tokens is one flat space-separated string (used for ILIKE/tsvector
    // matching), so a multi-word phrase entry is indistinguishable from two
    // adjacent single-word entries once joined — assert via substring checks
    // on the raw string rather than splitting it into an array first.
    const tokenString = String(doc.search_tokens);

    // Multi-word name: each word is its own token, including the hyphenated
    // symbol term kept intact rather than split on the hyphen.
    expect(tokenString).toContain("cross-chain");
    expect(tokenString).toContain("usdc");
    expect(tokenString).toContain("bridge");
    // Symbol/synonym expansion for "usdc" and "bridge" pulls in multi-word
    // phrases so a plain-language query still matches this document.
    expect(tokenString).toContain("usd coin");
    expect(tokenString).toContain("circle usdc");
    expect(tokenString).toContain("cross chain");
    // Other indexed fields (chain, status) are tokenized too.
    expect(tokenString).toContain("ethereum");
    expect(tokenString).toContain("healthy");
  });

  it("marks only the failing type as errored and keeps the already-rebuilt type's progress when interrupted mid-run", async () => {
    const stale = new Date(Date.now() - 10 * 60 * 1000);
    const { db, state } = createFakeDb({
      metadata: {
        asset: metadataRow("asset", { last_indexed: stale }),
        bridge: metadataRow("bridge", { last_indexed: stale }),
      },
      assets: [{ id: "a1", symbol: "USDC", name: "USD Coin", is_active: true, updated_at: new Date() }],
      throwForTable: { bridges: new Error("connection reset") },
    });
    mocks.db = db;

    await expect(processSearchIndexRebuild({ id: "job-1", data: {} } as any)).rejects.toThrow(
      "connection reset"
    );

    // Asset ran first, succeeded, and its progress was not rolled back by the
    // later bridge failure.
    expect(state.metadata.asset.status).toBe("ready");
    expect(state.documents.some((d) => d.document_key === "asset:a1")).toBe(true);

    // Bridge failed and recorded why, instead of silently vanishing.
    expect(state.metadata.bridge.status).toBe("error");
    expect(state.metadata.bridge.error_message).toBe("connection reset");

    expect(mocks.loggerError).toHaveBeenCalledWith(
      { jobId: "job-1", error: expect.any(Error) },
      "Search index rebuild job failed"
    );
  });
});

// ─── SearchService document building: tokenization & batch/memory handling ─

describe("SearchService document building", () => {
  let SearchService: (typeof import("../../src/services/search.service.js"))["SearchService"];

  beforeEach(async () => {
    vi.resetModules();
    vi.doMock("../../src/utils/logger.js", () => ({
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));

    SearchService = (await import("../../src/services/search.service.js")).SearchService;
  });

  it("builds synonym- and symbol-aware search tokens for multi-word input", () => {
    const { db } = createFakeDb();
    mocks.db = db;
    const service: any = new SearchService();

    const tokenString: string = service.buildSearchTokens("USDC", "USD Coin Bridge", "cross-chain");

    expect(tokenString).toContain("usdc");
    expect(tokenString).toContain("bridge");
    expect(tokenString).toContain("cross-chain"); // symbol term kept intact
    expect(tokenString).toContain("usd coin"); // synonym for "usdc"
    expect(tokenString).toContain("cross chain"); // synonym for "bridge"
    expect(tokenString).toContain("usd coin bridge"); // whole phrase retained too
  });

  it("indexes a large document set as a single batch without truncating or duplicating records", async () => {
    const assets = Array.from({ length: 500 }, (_, i) => ({
      id: `a${i}`,
      symbol: `TOK${i}`,
      name: `Token ${i}`,
      is_active: true,
      updated_at: new Date(),
    }));
    const { db, state, insertPayloads } = createFakeDb({
      metadata: { asset: metadataRow("asset", { last_indexed: new Date(Date.now() - 10 * 60 * 1000) }) },
      assets,
    });
    mocks.db = db;
    const service = new SearchService();

    await service.rebuildSearchIndex(["asset"]);

    expect(insertPayloads["search_documents"]).toHaveLength(1);
    expect(insertPayloads["search_documents"][0]).toHaveLength(500);
    expect(state.documents).toHaveLength(500);
    expect(new Set(state.documents.map((d) => d.document_key)).size).toBe(500);
  });

  it("clears stale documents without attempting an empty insert when a type has nothing to index", async () => {
    const { db, state, insertPayloads } = createFakeDb({
      metadata: { asset: metadataRow("asset", { last_indexed: new Date(Date.now() - 10 * 60 * 1000) }) },
      assets: [],
      seedDocuments: [{ document_key: "asset:gone", entity_type: "asset", title: "Delisted asset" }],
    });
    mocks.db = db;
    const service = new SearchService();

    await service.rebuildSearchIndex(["asset"]);

    expect(state.documents).toHaveLength(0);
    expect(insertPayloads["search_documents"]).toBeUndefined();
    expect(state.metadata.asset.status).toBe("ready");
    expect(state.metadata.asset.indexed_records).toBe(0);
  });
});
