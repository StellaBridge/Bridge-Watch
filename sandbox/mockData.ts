export const MOCK_ASSETS = [
  {
    symbol: "USDC",
    name: "USD Coin",
    issuer: "GA5ZSEJYB37JTH5GBUAITQCYZPbz9KJNJW6BRYHKOCPOYGC26PHWEBB4",
    asset_type: "credit_alphanum4",
    bridge_provider: "Circle",
    source_chain: "Ethereum",
    is_active: true,
  },
  {
    symbol: "EURC",
    name: "Euro Coin",
    issuer: "GA5ZSEJYB37JTH5GBUAITQCYZPbz9KJNJW6BRYHKOCPOYGC26PHWEBB4",
    asset_type: "credit_alphanum4",
    bridge_provider: "Circle",
    source_chain: "Ethereum",
    is_active: true,
  },
  {
    symbol: "AQUA",
    name: "Aquarius",
    issuer: "GBNZUDSTIDZ2W7MT7B6MM33VZCJVEK2YAL2UQFO6FHMTV5NCZTMCYVO2",
    asset_type: "credit_alphanum4",
    bridge_provider: null,
    source_chain: null,
    is_active: true,
  },
  {
    symbol: "yUSDC",
    name: "Yearn USDC",
    issuer: "GDCHZVYICNQ5VN3G6NC5YB2GI5GA3LXQHPJH3GWGN4ZCM4422DPO7757",
    asset_type: "credit_alphanum4",
    bridge_provider: "Wormhole",
    source_chain: "Ethereum",
    is_active: true,
  },
  {
    symbol: "BTC",
    name: "Bitcoin",
    issuer: "GDPNKLEMKFYJSJNNLMXUQFRNQFZA26BNDVIE7YJ2R5QW7S5W7I6LJ3R5",
    asset_type: "credit_alphanum12",
    bridge_provider: "Stellar Bridge",
    source_chain: "Bitcoin",
    is_active: true,
  },
];

export const MOCK_BRIDGES = [
  {
    name: "Circle",
    source_chain: "Ethereum",
    status: "healthy",
    total_value_locked: 1250000000,
    supply_on_stellar: 580000000,
    supply_on_source: 579200000,
    is_active: true,
  },
  {
    name: "Wormhole",
    source_chain: "Ethereum",
    status: "degraded",
    total_value_locked: 420000000,
    supply_on_stellar: 190000000,
    supply_on_source: 189500000,
    is_active: true,
  },
  {
    name: "Stellar Bridge",
    source_chain: "Bitcoin",
    status: "healthy",
    total_value_locked: 310000000,
    supply_on_stellar: 310000000,
    supply_on_source: 310000000,
    is_active: true,
  },
];

export const MOCK_PRICES: Record<string, Array<{ price: number; source: string; offset_hours: number }>> = {
  USDC: [
    { price: 1.0001, source: "sdex", offset_hours: 0 },
    { price: 0.9998, source: "circle", offset_hours: 0 },
    { price: 1.0002, source: "coinbase", offset_hours: 0 },
  ],
  EURC: [
    { price: 1.0872, source: "sdex", offset_hours: 0 },
    { price: 1.0865, source: "circle", offset_hours: 0 },
  ],
  AQUA: [
    { price: 0.0234, source: "sdex", offset_hours: 0 },
  ],
  yUSDC: [
    { price: 1.0015, source: "sdex", offset_hours: 0 },
  ],
  BTC: [
    { price: 67420.50, source: "sdex", offset_hours: 0 },
  ],
};

export function generatePriceHistory(
  basePrice: number,
  days: number,
  volatility = 0.02
): Array<{ time: Date; price: number; source: string }> {
  const history: Array<{ time: Date; price: number; source: string }> = [];
  const now = new Date();

  for (let d = days; d >= 0; d--) {
    for (let h = 0; h < 24; h += 6) {
      const time = new Date(now);
      time.setDate(time.getDate() - d);
      time.setHours(h, 0, 0, 0);

      const noise = (Math.sin(d * 0.5 + h * 0.1) * volatility) * basePrice;
      const price = basePrice + noise;

      history.push({ time, price, source: "sdex" });
      history.push({ time, price: price * (1 + volatility * 0.1), source: "circle" });
    }
  }

  return history;
}

export function generateHealthScores(
  days: number
): Array<{ time: Date; symbol: string; overall: number; liquidity: number; price: number; bridge: number; reserve: number; volume: number }> {
  const scores: Array<{ time: Date; symbol: string; overall: number; liquidity: number; price: number; bridge: number; reserve: number; volume: number }> = [];
  const now = new Date();
  const symbols = ["USDC", "EURC", "AQUA", "yUSDC", "BTC"];

  for (let d = days; d >= 0; d--) {
    for (let h = 0; h < 24; h += 4) {
      const time = new Date(now);
      time.setDate(time.getDate() - d);
      time.setHours(h, 0, 0, 0);

      for (const symbol of symbols) {
        const base = symbol === "USDC" ? 92 : symbol === "EURC" ? 88 : symbol === "AQUA" ? 65 : symbol === "yUSDC" ? 75 : 80;
        const noise = Math.sin(d * 0.3) * 5;

        scores.push({
          time,
          symbol,
          overall: Math.min(100, Math.max(0, base + noise)),
          liquidity: Math.min(100, Math.max(0, base + noise + 3)),
          price: Math.min(100, Math.max(0, base + noise - 2)),
          bridge: Math.min(100, Math.max(0, base + noise + 1)),
          reserve: Math.min(100, Math.max(0, base + noise - 1)),
          volume: Math.min(100, Math.max(0, base + noise + 2)),
        });
      }
    }
  }

  return scores;
}

export function generateIncidentHistory(
  days: number
): Array<{
  time: Date;
  entity_type: string;
  entity_id: string;
  asset_symbol: string;
  severity: string;
  title: string;
  description: string;
}> {
  const incidents: Array<{
    time: Date;
    entity_type: string;
    entity_id: string;
    asset_symbol: string;
    severity: string;
    title: string;
    description: string;
  }> = [];
  const now = new Date();
  const severities = ["critical", "high", "medium", "low"];
  const templates = [
    { title: "Price deviation detected", desc: "Asset price deviated from expected peg" },
    { title: "Supply mismatch warning", desc: "Bridged supply mismatch exceeded threshold" },
    { title: "Bridge latency spike", desc: "Transfer times exceeded normal range" },
    { title: "Liquidity depth drop", desc: "Order book depth fell below minimum" },
    { title: "Health score decline", desc: "Composite health score dropped significantly" },
  ];
  const assets = ["USDC", "EURC", "yUSDC", "BTC", "AQUA"];

  for (let d = days; d >= 0; d--) {
    const incidentCount = 1 + Math.floor(Math.abs(Math.sin(d * 2.1)) * 3);
    for (let i = 0; i < incidentCount; i++) {
      const time = new Date(now);
      time.setDate(time.getDate() - d);
      time.setHours(Math.floor(Math.abs(Math.sin(d + i * 3.7)) * 24), 0, 0, 0);

      const template = templates[Math.floor(Math.abs(Math.sin(d * 1.3 + i * 2.7)) * templates.length)];
      const asset = assets[Math.floor(Math.abs(Math.sin(d * 0.9 + i * 1.7)) * assets.length)];
      const severity = severities[Math.floor(Math.abs(Math.sin(d * 1.1 + i * 3.3)) * severities.length)];

      incidents.push({
        time,
        entity_type: Math.abs(Math.sin(d + i)) > 0.5 ? "bridge" : "asset",
        entity_id: asset,
        asset_symbol: asset,
        severity,
        title: template!.title,
        description: template!.desc,
      });
    }
  }

  return incidents;
}
