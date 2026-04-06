import type {
  ApiKeyRecord,
  Asset,
  AssetInfo,
  AssetWithHealth,
  Bridge,
  BridgeStats,
  CreateApiKeyRequest,
  CreateApiKeyResponse,
  HealthScore,
  TransactionFilters,
  TransactionPage,
} from "../types";
const API_BASE_URL = "/api/v1";

async function fetchApi<T>(
  endpoint: string,
  init?: RequestInit,
  apiKey?: string
): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }
  if (apiKey) {
    headers.set("x-api-key", apiKey);
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    let detail = "";
    try {
      const body = (await response.json()) as { error?: string; message?: string };
      detail = body.error ?? body.message ?? "";
    } catch {
      // ignore non-JSON error bodies
    }
    const suffix = detail ? `: ${detail}` : "";
    throw new Error(`API error: ${response.status} ${response.statusText}${suffix}`);
  }

  return response.json();
}

/** Root health endpoint (not under /api/v1). */
export async function getServerHealth(): Promise<{ status: string; timestamp: string }> {
  const response = await fetch("/health");
  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

// Assets
export function getAssets() {
  return fetchApi<{ assets: Asset[]; total: number }>("/assets");
}

export function getAssetDetail(symbol: string) {
  return fetchApi<{ symbol: string; details: unknown }>(`/assets/${symbol}`);
}

export function getAssetHealth(symbol: string) {
  return fetchApi<HealthScore | null>(`/assets/${symbol}/health`);
}

export function getAssetHealthHistory(
  symbol: string,
  period: "24h" | "7d" | "30d" = "7d"
) {
  return fetchApi<
    | {
        symbol: string;
        period: "24h" | "7d" | "30d";
        points: Array<{ timestamp: string; score: number }>;
      }
    | null
  >(`/assets/${symbol}/health/history?period=${period}`);
}

export async function getAssetsWithHealth(): Promise<AssetWithHealth[]> {
  const { assets } = await getAssets();
  const healthPromises = assets.map(async (asset) => {
    try {
      const health = await getAssetHealth(asset.symbol);
      return { ...asset, health };
    } catch {
      return { ...asset, health: null };
    }
  });
  return Promise.all(healthPromises);
}

export function getAssetLiquidity(symbol: string) {
  return fetchApi<{
    symbol: string;
    totalLiquidity: number;
    sources: Array<{
      dex: string;
      bidDepth: number;
      askDepth: number;
      totalLiquidity: number;
    }>;
  } | null>(`/assets/${symbol}/liquidity`);
}

export function getAssetPrice(symbol: string) {
  return fetchApi<{
    symbol: string;
    vwap: number;
    sources: Array<{ source: string; price: number; timestamp: string }>;
    deviation: number;
    lastUpdated: string;
  } | null>(`/assets/${symbol}/price`);
}

export function getAssetInfo(symbol: string) {
  return fetchApi<AssetInfo | null>(`/assets/${symbol}/info`);
}

export function getAssetPriceHistory(symbol: string, timeframe: string) {
  return fetchApi<Array<{ source: string; price: number; timestamp: string }>>(
    `/assets/${symbol}/price/history?timeframe=${timeframe}`
  );
}

export function getAssetPriceSources(symbol: string) {
  return fetchApi<Array<{ source: string; price: number; timestamp: string }>>(
    `/assets/${symbol}/price/sources`
  );
}

export function getAssetLiquiditySources(symbol: string) {
  return fetchApi<Array<{
    dex: string;
    bidDepth: number;
    askDepth: number;
    totalLiquidity: number;
  }>>(`/assets/${symbol}/liquidity/sources`);
}

export function getAssetVolume(symbol: string) {
  return fetchApi<{
    symbol: string;
    volume24h: number;
    volume7d: number;
    volume30d: number;
  } | null>(`/assets/${symbol}/volume`);
}

export function getAssetSupplyVerification(symbol: string) {
  return fetchApi<{
    symbol: string;
    onChainSupply: number;
    offChainSupply: number;
    mismatchPercentage: number;
    lastVerified: string;
  } | null>(`/assets/${symbol}/supply`);
}

export function getAssetAlerts(symbol: string) {
  return fetchApi<Array<{
    id: string;
    type: string;
    severity: "info" | "warning" | "critical";
    message: string;
    createdAt: string;
  }>>(`/assets/${symbol}/alerts`);
}

// Bridges
export function getBridges() {
  return fetchApi<{ bridges: Bridge[] }>("/bridges");
}

export function getBridgeStats(bridge: string) {
  return fetchApi<BridgeStats | null>(`/bridges/${bridge}/stats`);
}

// Transactions
export function getTransactions(
  filters: TransactionFilters,
  page: number,
  pageSize: number
) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  if (filters.bridge) params.set("bridge", filters.bridge);
  if (filters.asset) params.set("asset", filters.asset);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.search) params.set("search", filters.search);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);

  return fetchApi<TransactionPage>(`/transactions?${params.toString()}`);
}

export function exportTransactionsCsv(filters: TransactionFilters): string {
  const params = new URLSearchParams();
  if (filters.bridge) params.set("bridge", filters.bridge);
  if (filters.asset) params.set("asset", filters.asset);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.search) params.set("search", filters.search);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  params.set("format", "csv");

  return `${API_BASE_URL}/transactions/export?${params.toString()}`;
}

// API key management
export function listApiKeys(apiKey: string) {
  return fetchApi<{ keys: ApiKeyRecord[] }>("/admin/api-keys", undefined, apiKey);
}

export function createApiKey(
  apiKey: string,
  payload: CreateApiKeyRequest
) {
  return fetchApi<CreateApiKeyResponse>(
    "/admin/api-keys",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    apiKey
  );
}

export function rotateApiKey(apiKey: string, id: string) {
  return fetchApi<CreateApiKeyResponse>(
    `/admin/api-keys/${id}/rotate`,
    { method: "POST" },
    apiKey
  );
}

export function revokeApiKey(apiKey: string, id: string) {
  return fetchApi<{ key: ApiKeyRecord }>(
    `/admin/api-keys/${id}/revoke`,
    { method: "POST" },
    apiKey
  );
}

export function extendApiKey(apiKey: string, id: string, extraDays: number) {
  return fetchApi<{ key: ApiKeyRecord }>(
    `/admin/api-keys/${id}/extend`,
    {
      method: "POST",
      body: JSON.stringify({ extraDays }),
    },
    apiKey
  );
}

// Supply Chain
export function getSupplyChainGraph() {
  return fetchApi<import("../components/SupplyChainViz/types").SupplyChainGraph>("/supply-chain");
}

export function getSupplyChainNodes() {
  return fetchApi<{ nodes: import("../components/SupplyChainViz/types").ChainNode[] }>("/supply-chain/nodes");
}

export function getSupplyChainEdges() {
  return fetchApi<{ edges: import("../components/SupplyChainViz/types").BridgeEdge[] }>("/supply-chain/edges");
}

// Price Feeds
export function getPriceFeeds() {
  return fetchApi<{
    prices: Array<{
      symbol: string;
      price: number;
      confidence: number;
      sources: number;
      lastUpdated: string;
    }>;
  }>("/price-feeds");
}

export function getPriceFeed(symbol: string) {
  return fetchApi<{
    symbol: string;
    price: number;
    confidence: number;
    sources: number;
    lastUpdated: string;
  }>(`/price-feeds/${symbol}`);
}

export function getPriceFeedComparison(symbol: string) {
  return fetchApi<{
    symbol: string;
    consensus: number;
    samples: Array<{
      source: string;
      price: number;
      weight: number;
      isOutlier: boolean;
    }>;
  }>(`/price-feeds/${symbol}/compare`);
}

export function getPriceFeedHealth() {
  return fetchApi<{
    sources: Array<{
      name: string;
      successRate: number;
      avgLatencyMs: number;
      lastSuccess: string | null;
    }>;
  }>("/price-feeds/health");
}
