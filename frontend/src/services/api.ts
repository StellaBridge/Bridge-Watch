import type {
  Asset,
  HealthScore,
  AssetWithHealth,
  AssetInfo,
  PriceDataPoint,
  PriceSource,
  LiquiditySource,
  VolumeData,
  SupplyVerification,
  HealthHistoryPoint,
  AlertConfig,
  PriceTimeframe,
} from "../types";

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
  return fetchApi<{ assets: Asset[]; total: number }>("/assets");
}

export function getAssetDetail(symbol: string) {
  return fetchApi<{ symbol: string; details: unknown }>(`/assets/${symbol}`);
}

export function getAssetHealth(symbol: string) {
  return fetchApi<HealthScore | null>(`/assets/${symbol}/health`);
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

// Asset Detail
export function getAssetInfo(symbol: string) {
  return fetchApi<AssetInfo>(`/assets/${symbol}/info`);
}

export function getAssetPriceHistory(symbol: string, timeframe: PriceTimeframe) {
  return fetchApi<PriceDataPoint[]>(
    `/assets/${symbol}/price/history?timeframe=${timeframe}`
  );
}

export function getAssetPriceSources(symbol: string) {
  return fetchApi<PriceSource[]>(`/assets/${symbol}/price/sources`);
}

export function getAssetLiquiditySources(symbol: string) {
  return fetchApi<LiquiditySource[]>(`/assets/${symbol}/liquidity/sources`);
}

export function getAssetVolume(symbol: string) {
  return fetchApi<VolumeData[]>(`/assets/${symbol}/volume`);
}

export function getAssetSupplyVerification(symbol: string) {
  return fetchApi<SupplyVerification>(`/assets/${symbol}/supply`);
}

export function getAssetHealthHistory(symbol: string) {
  return fetchApi<HealthHistoryPoint[]>(`/assets/${symbol}/health/history`);
}

export function getAssetAlerts(symbol: string) {
  return fetchApi<AlertConfig[]>(`/assets/${symbol}/alerts`);
}
