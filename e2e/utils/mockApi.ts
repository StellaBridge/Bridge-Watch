import { type Page } from "@playwright/test";
import {
  buildAssetWithHealth,
  buildBridge
} from "../../frontend/src/test/factories";

const assetsFixture = [
  buildAssetWithHealth({ symbol: "XLM", name: "Stellar Lumens" }, 100),
  buildAssetWithHealth({ symbol: "USDC", name: "USD Coin" }, 101),
];
assetsFixture[1].health.lastUpdated = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();

const assetHealthFixture = {
  XLM: assetsFixture[0].health,
  USDC: assetsFixture[1].health,
};

const bridgesFixture = {
  bridges: [
    buildBridge({ name: "Allbridge", status: "healthy" }, 200),
    buildBridge({ name: "Wormhole", status: "healthy" }, 201),
  ]
};

const incidentsFixture = [
  {
    id: "inc-critical-open",
    bridgeId: "Circle",
    assetCode: "USDC",
    severity: "critical" as const,
    status: "open" as const,
    title: "USDC reserve attestation delayed",
    description: "Circle reserve attestation data is outside the expected freshness window.",
    sourceUrl: "https://status.example.test/inc-critical-open",
    sourceType: "monitor",
    sourceExternalId: "alert-100",
    sourceRepository: null,
    sourceRepoAvatarUrl: null,
    sourceActor: "Bridge Watch",
    sourceAttribution: {},
    requiresManualReview: true,
    ingestionAttemptCount: 1,
    lastIngestionError: null,
    normalizedFingerprint: "circle-usdc-attestation",
    followUpActions: ["Page on-call", "Verify reserves"],
    occurredAt: "2026-06-26T12:00:00.000Z",
    resolvedAt: null,
    createdAt: "2026-06-26T12:00:00.000Z",
    updatedAt: "2026-06-26T12:05:00.000Z",
  },
  {
    id: "inc-high-investigating",
    bridgeId: "Allbridge",
    assetCode: "XLM",
    severity: "high" as const,
    status: "investigating" as const,
    title: "Allbridge transfer latency elevated",
    description: "Median transfer confirmation time exceeded the SLO for Stellar routes.",
    sourceUrl: "https://status.example.test/inc-high-investigating",
    sourceType: "monitor",
    sourceExternalId: "alert-101",
    sourceRepository: null,
    sourceRepoAvatarUrl: null,
    sourceActor: "Bridge Watch",
    sourceAttribution: {},
    requiresManualReview: false,
    ingestionAttemptCount: 1,
    lastIngestionError: null,
    normalizedFingerprint: "allbridge-xlm-latency",
    followUpActions: ["Inspect queue depth"],
    occurredAt: "2026-06-26T13:00:00.000Z",
    resolvedAt: null,
    createdAt: "2026-06-26T13:00:00.000Z",
    updatedAt: "2026-06-26T13:15:00.000Z",
  },
  {
    id: "inc-low-resolved",
    bridgeId: "Wormhole",
    assetCode: "EURC",
    severity: "low" as const,
    status: "resolved" as const,
    title: "Wormhole EURC heartbeat recovered",
    description: "A temporary heartbeat delay recovered without operator intervention.",
    sourceUrl: "https://status.example.test/inc-low-resolved",
    sourceType: "monitor",
    sourceExternalId: "alert-102",
    sourceRepository: null,
    sourceRepoAvatarUrl: null,
    sourceActor: "Bridge Watch",
    sourceAttribution: {},
    requiresManualReview: false,
    ingestionAttemptCount: 1,
    lastIngestionError: null,
    normalizedFingerprint: "wormhole-eurc-heartbeat",
    followUpActions: [],
    occurredAt: "2026-06-25T09:30:00.000Z",
    resolvedAt: "2026-06-25T10:00:00.000Z",
    createdAt: "2026-06-25T09:30:00.000Z",
    updatedAt: "2026-06-25T10:00:00.000Z",
  },
];

const transactionsFixture = {
  transactions: [
    {
      id: "tx-1",
      txHash: "0x1234",
      bridge: "Circle",
      asset: "USDC",
      amount: 1000,
      sourceChain: "Ethereum",
      destinationChain: "Stellar",
      senderAddress: "0xabcd",
      recipientAddress: "GABC",
      status: "completed" as const,
      fee: 0.1,
      timestamp: new Date().toISOString(),
      confirmedAt: new Date().toISOString(),
      stellarTxHash: "stellar-tx-1",
      ethereumTxHash: "ethereum-tx-1",
      blockNumber: 12345,
    },
    {
      id: "tx-2",
      txHash: "0x5678",
      bridge: "Allbridge",
      asset: "XLM",
      amount: 500,
      sourceChain: "Stellar",
      destinationChain: "Solana",
      senderAddress: "GXYZ",
      recipientAddress: "sol-addr",
      status: "completed" as const,
      fee: 0.05,
      timestamp: new Date().toISOString(),
      confirmedAt: new Date().toISOString(),
      stellarTxHash: "stellar-tx-2",
      ethereumTxHash: null,
      blockNumber: 12346,
    }
  ],
  total: 2,
  page: 1,
  pageSize: 10,
  totalPages: 1,
};

const jsonHeaders = { "content-type": "application/json" };

export async function mockCoreApi(page: Page): Promise<void> {
  // Catch-all for any other API routes to prevent proxy errors
  // Registered first so specific routes registered later take precedence in Playwright's reverse-order routing
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/v1/assets") {
      await route.fulfill({
        status: 200,
        headers: jsonHeaders,
        body: JSON.stringify({ assets: assetsFixture, total: assetsFixture.length }),
      });
      return;
    }

    if (url.pathname.includes("/assets/") && url.pathname.includes("health")) {
      const symbol = assetsFixture.find((item) =>
        url.pathname.toLowerCase().includes(item.symbol.toLowerCase()),
      )?.symbol;
      const asset = assetsFixture.find((item) => item.symbol === symbol);
      await route.fulfill({
        status: 200,
        headers: jsonHeaders,
        body: JSON.stringify(
          (assetHealthFixture as Record<string, unknown>)[symbol ?? ""] ?? asset?.health ?? null,
        ),
      });
      return;
    }

    if (url.pathname === "/api/v1/search") {
      await route.fulfill({
        status: 200,
        headers: jsonHeaders,
        body: JSON.stringify({
          success: true,
          data: { results: [], total: 0, facets: { bridgeProvider: [], sourceChain: [] } },
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      headers: jsonHeaders,
      body: JSON.stringify({}),
    });
  });

  await page.route("**/api/v1/incidents/*/read", async (route) => {
    await route.fulfill({
      status: 204,
      headers: jsonHeaders,
      body: "",
    });
  });

  await page.route("**/api/v1/incidents**", async (route) => {
    const url = new URL(route.request().url());
    const filtered = incidentsFixture.filter((incident) => {
      const severity = url.searchParams.get("severity");
      const status = url.searchParams.get("status");
      const bridgeId = url.searchParams.get("bridgeId");
      const assetCode = url.searchParams.get("assetCode");
      return (
        (!severity || incident.severity === severity) &&
        (!status || incident.status === status) &&
        (!bridgeId || incident.bridgeId === bridgeId) &&
        (!assetCode || incident.assetCode === assetCode)
      );
    });

    await route.fulfill({
      status: 200,
      headers: jsonHeaders,
      body: JSON.stringify({ incidents: filtered, total: filtered.length }),
    });
  });

  await page.route("**/api/v1/transactions**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: jsonHeaders,
      body: JSON.stringify(transactionsFixture),
    });
  });

  await page.route("**/api/v1/bridges**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: jsonHeaders,
      body: JSON.stringify(bridgesFixture),
    });
  });

  await page.route("**/health**", async (route) => {
    if (new URL(route.request().url()).pathname.startsWith("/api/v1/assets/")) {
      await route.fallback();
      return;
    }

    await route.fulfill({
      status: 200,
      headers: jsonHeaders,
      body: JSON.stringify({
        status: "ok",
        timestamp: new Date().toISOString(),
        services: {},
      }),
    });
  });

  await page.route("**/api/v1/external-dependencies**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: jsonHeaders,
      body: JSON.stringify({ dependencies: [], summary: { total: 0, healthy: 0, degraded: 0 } }),
    });
  });
}
