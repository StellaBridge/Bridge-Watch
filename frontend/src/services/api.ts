const API_BASE_URL = "/api/v1";

async function fetchApi<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`);

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

// Assets
export function getAssets() {
  return fetchApi<{ assets: Array<{ symbol: string; name: string }>; total: number }>(
    "/assets"
  );
}

export function getAssetDetail(symbol: string) {
  return fetchApi<{ symbol: string; details: unknown }>(`/assets/${symbol}`);
}

export function getAssetHealth(symbol: string) {
  return fetchApi<{
    symbol: string;
    overallScore: number;
    factors: {
      liquidityDepth: number;
      priceStability: number;
      bridgeUptime: number;
      reserveBacking: number;
      volumeTrend: number;
    };
    trend: "improving" | "stable" | "deteriorating";
    lastUpdated: string;
  } | null>(`/assets/${symbol}/health`);
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

// Bridges
export function getBridges() {
  return fetchApi<{
    bridges: Array<{
      name: string;
      status: "healthy" | "degraded" | "down" | "unknown";
      totalValueLocked: number;
      supplyOnStellar: number;
      supplyOnSource: number;
      mismatchPercentage: number;
    }>;
  }>("/bridges");
}

export function getBridgeStats(bridge: string) {
  return fetchApi<{
    name: string;
    volume24h: number;
    volume7d: number;
    volume30d: number;
    totalTransactions: number;
    averageTransferTime: number;
    uptime30d: number;
  } | null>(`/bridges/${bridge}/stats`);
}

// Incidents / Heatmap
export interface HeatmapBucket {
  date: string;
  hour: number;
  count: number;
  bySeverity: Record<string, number>;
  incidents: Array<{
    id: string;
    time: string;
    entity_type: string;
    entity_id: string;
    asset_symbol: string;
    severity: string;
    title: string;
    description: string;
  }>;
}

export function getIncidentHeatmap(params?: {
  startDate?: string;
  endDate?: string;
  assetSymbol?: string;
}) {
  const searchParams = new URLSearchParams();
  if (params?.startDate) searchParams.set("startDate", params.startDate);
  if (params?.endDate) searchParams.set("endDate", params.endDate);
  if (params?.assetSymbol) searchParams.set("assetSymbol", params.assetSymbol);

  const qs = searchParams.toString();
  return fetchApi<{
    buckets: HeatmapBucket[];
    totalIncidents: number;
    dateRange: { start: string; end: string };
    assets: string[];
  }>(`/incidents/heatmap${qs ? `?${qs}` : ""}`);
}
