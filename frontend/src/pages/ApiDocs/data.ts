export type ParamType = "string" | "number" | "boolean" | "enum";
export type HttpMethod = "GET" | "POST" | "DELETE" | "WS";

export interface Param {
  name: string;
  type: ParamType;
  required: boolean;
  description: string;
  example?: string;
  enum?: string[];
}

export interface ResponseCode {
  code: number;
  description: string;
}

export interface Endpoint {
  id: string;
  method: HttpMethod;
  path: string;
  summary: string;
  description: string;
  category: string;
  pathParams?: Param[];
  queryParams?: Param[];
  responseCodes: ResponseCode[];
  exampleResponse: unknown;
}

export const CATEGORIES = ["Assets", "Bridges", "WebSocket"] as const;

export const ENDPOINTS: Endpoint[] = [
  {
    id: "list-assets",
    method: "GET",
    path: "/api/v1/assets",
    summary: "List all monitored assets",
    description: "Returns all assets currently monitored by Bridge Watch, including symbol, name, and bridge provider.",
    category: "Assets",
    responseCodes: [
      { code: 200, description: "Success" },
      { code: 429, description: "Rate limit exceeded" },
      { code: 500, description: "Internal server error" },
    ],
    exampleResponse: {
      assets: [
        { symbol: "USDC", name: "USD Coin" },
        { symbol: "PYUSD", name: "PayPal USD" },
      ],
      total: 2,
    },
  },
  {
    id: "get-asset",
    method: "GET",
    path: "/api/v1/assets/:symbol",
    summary: "Get asset details",
    description: "Returns detailed information for a specific asset including issuer, bridge provider, and source chain.",
    category: "Assets",
    pathParams: [
      { name: "symbol", type: "string", required: true, description: "Asset symbol (e.g. USDC)", example: "USDC" },
    ],
    responseCodes: [
      { code: 200, description: "Success" },
      { code: 404, description: "Asset not found" },
      { code: 429, description: "Rate limit exceeded" },
    ],
    exampleResponse: {
      symbol: "USDC",
      details: {
        name: "USD Coin",
        issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
        assetType: "credit_alphanum4",
        bridgeProvider: "Circle",
        sourceChain: "Ethereum",
      },
    },
  },
  {
    id: "get-asset-health",
    method: "GET",
    path: "/api/v1/assets/:symbol/health",
    summary: "Get asset health score",
    description: "Returns the composite health score (0–100) for an asset, broken down by liquidity, price stability, bridge uptime, reserve backing, and volume trend.",
    category: "Assets",
    pathParams: [
      { name: "symbol", type: "string", required: true, description: "Asset symbol", example: "USDC" },
    ],
    responseCodes: [
      { code: 200, description: "Success" },
      { code: 404, description: "Asset not found" },
      { code: 429, description: "Rate limit exceeded" },
    ],
    exampleResponse: {
      symbol: "USDC",
      overallScore: 87,
      factors: {
        liquidityDepth: 90,
        priceStability: 95,
        bridgeUptime: 88,
        reserveBacking: 92,
        volumeTrend: 70,
      },
      trend: "stable",
      lastUpdated: "2026-03-27T12:00:00Z",
    },
  },
  {
    id: "get-asset-liquidity",
    method: "GET",
    path: "/api/v1/assets/:symbol/liquidity",
    summary: "Get aggregated liquidity",
    description: "Returns aggregated liquidity depth across all monitored DEXs (StellarX, Phoenix, LumenSwap, SDEX, Soroswap) for the given asset.",
    category: "Assets",
    pathParams: [
      { name: "symbol", type: "string", required: true, description: "Asset symbol", example: "USDC" },
    ],
    responseCodes: [
      { code: 200, description: "Success" },
      { code: 404, description: "Asset not found" },
      { code: 429, description: "Rate limit exceeded" },
    ],
    exampleResponse: {
      symbol: "USDC",
      totalLiquidity: 4200000,
      sources: [
        { dex: "sdex", bidDepth: 1200000, askDepth: 1100000, totalLiquidity: 2300000 },
        { dex: "phoenix", bidDepth: 900000, askDepth: 1000000, totalLiquidity: 1900000 },
      ],
    },
  },
  {
    id: "get-asset-price",
    method: "GET",
    path: "/api/v1/assets/:symbol/price",
    summary: "Get current price",
    description: "Returns the volume-weighted average price (VWAP) aggregated from Stellar DEX, Circle API, and Coinbase, plus per-source prices and deviation percentage.",
    category: "Assets",
    pathParams: [
      { name: "symbol", type: "string", required: true, description: "Asset symbol", example: "USDC" },
    ],
    responseCodes: [
      { code: 200, description: "Success" },
      { code: 404, description: "Asset not found" },
      { code: 429, description: "Rate limit exceeded" },
    ],
    exampleResponse: {
      symbol: "USDC",
      vwap: 1.0001,
      sources: [
        { source: "stellar_dex", price: 1.0002, timestamp: "2026-03-27T12:00:00Z" },
        { source: "circle", price: 1.0000, timestamp: "2026-03-27T12:00:00Z" },
        { source: "coinbase", price: 1.0001, timestamp: "2026-03-27T12:00:00Z" },
      ],
      deviation: 0.0002,
      lastUpdated: "2026-03-27T12:00:00Z",
    },
  },
  {
    id: "list-bridges",
    method: "GET",
    path: "/api/v1/bridges",
    summary: "Bridge status overview",
    description: "Returns status and supply data for all monitored cross-chain bridges, including TVL and supply mismatch percentage.",
    category: "Bridges",
    responseCodes: [
      { code: 200, description: "Success" },
      { code: 429, description: "Rate limit exceeded" },
      { code: 500, description: "Internal server error" },
    ],
    exampleResponse: {
      bridges: [
        {
          name: "Circle USDC Bridge",
          status: "healthy",
          totalValueLocked: 83000000,
          supplyOnStellar: 83000000,
          supplyOnSource: 83050000,
          mismatchPercentage: 0.06,
        },
      ],
    },
  },
  {
    id: "get-bridge-stats",
    method: "GET",
    path: "/api/v1/bridges/:bridge/stats",
    summary: "Bridge statistics",
    description: "Returns volume statistics, transaction counts, average transfer time, and 30-day uptime for a specific bridge.",
    category: "Bridges",
    pathParams: [
      { name: "bridge", type: "string", required: true, description: "Bridge name (URL-encoded)", example: "Circle%20USDC%20Bridge" },
    ],
    responseCodes: [
      { code: 200, description: "Success" },
      { code: 404, description: "Bridge not found" },
      { code: 429, description: "Rate limit exceeded" },
    ],
    exampleResponse: {
      name: "Circle USDC Bridge",
      volume24h: 1200000,
      volume7d: 8400000,
      volume30d: 36000000,
      totalTransactions: 14200,
      averageTransferTime: 45,
      uptime30d: 99.9,
    },
  },
  {
    id: "websocket",
    method: "WS",
    path: "/api/v1/ws",
    summary: "Real-time updates",
    description: "WebSocket connection for real-time price updates, health score changes, and bridge status events. Connect and receive a stream of typed event objects.",
    category: "WebSocket",
    responseCodes: [],
    exampleResponse: {
      type: "price_update",
      symbol: "USDC",
      price: 1.0001,
      source: "stellar_dex",
      timestamp: "2026-03-27T12:00:00Z",
    },
  },
];

export function generateSnippet(
  endpoint: Endpoint,
  lang: "curl" | "js" | "python",
  baseUrl = "https://api.bridgewatch.stellar.org"
): string {
  const examplePath = endpoint.path.replace(
    /:(\w+)/g,
    (_, p) => endpoint.pathParams?.find((x) => x.name === p)?.example ?? p
  );
  const url = `${baseUrl}${examplePath}`;

  if (endpoint.method === "WS") {
    const wsUrl = url.replace("https://", "wss://");
    if (lang === "curl") return `# WebSocket — use wscat\nwscat -c ${wsUrl}`;
    if (lang === "js") return `const ws = new WebSocket("${wsUrl}");\nws.onmessage = (e) => console.log(JSON.parse(e.data));`;
    return `import websocket, json\nws = websocket.create_connection("${wsUrl}")\nprint(json.loads(ws.recv()))`;
  }

  if (lang === "curl") return `curl -X ${endpoint.method} "${url}" \\\n  -H "Accept: application/json"`;
  if (lang === "js") return `const res = await fetch("${url}");\nconst data = await res.json();\nconsole.log(data);`;
  return `import requests\nres = requests.get("${url}")\nprint(res.json())`;
}
