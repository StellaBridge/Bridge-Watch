/**
 * Supply Chain Service
 *
 * Aggregates chain nodes, bridge edges, and per-asset supply breakdown for
 * the frontend supply-chain visualisation.  Data is assembled from:
 *   - Static chain registry (updated via config)
 *   - Bridge health and volume metrics from the existing bridge service
 *   - Asset supply snapshots from the existing price/reserve services
 */

import { redis } from "../utils/redis.js";
import { logger } from "../utils/logger.js";

const CACHE_KEY = "supply-chain:graph";
const CACHE_TTL_SEC = 60;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AssetSupply {
  symbol: string;
  lockedAmount: number;
  mintedAmount: number;
}

export interface ChainNodeData {
  id: string;
  label: string;
  chain: string;
  color: string;
  totalSupplyUsd: number;
  lockedSupplyUsd: number;
  healthScore: number;
  assets: AssetSupply[];
  position: { x: number; y: number };
}

export interface BridgeEdgeData {
  id: string;
  source: string;
  target: string;
  bridgeName: string;
  protocol: string;
  volume24hUsd: number;
  assets: string[];
  status: "healthy" | "degraded" | "offline";
  flowDirection: "bidirectional" | "source-to-target" | "target-to-source";
  latencyMs: number;
}

export interface SupplyChainGraph {
  nodes: ChainNodeData[];
  edges: BridgeEdgeData[];
  totalSupplyUsd: number;
  totalBridgeVolumeUsd: number;
  lastUpdated: string;
}

// ---------------------------------------------------------------------------
// Static chain registry
// ---------------------------------------------------------------------------

const CHAIN_REGISTRY: Omit<ChainNodeData, "totalSupplyUsd" | "lockedSupplyUsd" | "healthScore" | "assets">[] = [
  { id: "stellar",  label: "Stellar",  chain: "stellar",  color: "#7B64FF", position: { x: 400, y: 300 } },
  { id: "ethereum", label: "Ethereum", chain: "ethereum", color: "#627EEA", position: { x: 220, y: 140 } },
  { id: "polygon",  label: "Polygon",  chain: "polygon",  color: "#8247E5", position: { x: 600, y: 140 } },
  { id: "bsc",      label: "BSC",      chain: "bsc",      color: "#F0B90B", position: { x: 680, y: 340 } },
  { id: "avalanche",label: "Avalanche",chain: "avalanche",color: "#E84142", position: { x: 480, y: 500 } },
  { id: "tron",     label: "Tron",     chain: "tron",     color: "#FF0013", position: { x: 160, y: 420 } },
];

const BRIDGE_REGISTRY: Omit<BridgeEdgeData, "volume24hUsd" | "status" | "latencyMs">[] = [
  {
    id: "stellar-ethereum-allbridge",
    source: "stellar", target: "ethereum",
    bridgeName: "Allbridge", protocol: "allbridge",
    assets: ["USDC", "USDT"], flowDirection: "bidirectional",
  },
  {
    id: "stellar-polygon-allbridge",
    source: "stellar", target: "polygon",
    bridgeName: "Allbridge", protocol: "allbridge",
    assets: ["USDC"], flowDirection: "bidirectional",
  },
  {
    id: "stellar-bsc-allbridge",
    source: "stellar", target: "bsc",
    bridgeName: "Allbridge", protocol: "allbridge",
    assets: ["USDC", "USDT"], flowDirection: "bidirectional",
  },
  {
    id: "stellar-tron-ultrastellar",
    source: "stellar", target: "tron",
    bridgeName: "UltraStellar", protocol: "ultrastellar",
    assets: ["USDT"], flowDirection: "bidirectional",
  },
  {
    id: "ethereum-polygon-pos",
    source: "ethereum", target: "polygon",
    bridgeName: "Polygon PoS Bridge", protocol: "polygon-pos",
    assets: ["USDC", "USDT", "WBTC", "WETH"], flowDirection: "bidirectional",
  },
  {
    id: "ethereum-avalanche-avalanche-bridge",
    source: "ethereum", target: "avalanche",
    bridgeName: "Avalanche Bridge", protocol: "avalanche-bridge",
    assets: ["USDC", "WBTC", "WETH"], flowDirection: "bidirectional",
  },
  {
    id: "stellar-avalanche-allbridge",
    source: "stellar", target: "avalanche",
    bridgeName: "Allbridge", protocol: "allbridge",
    assets: ["USDC"], flowDirection: "bidirectional",
  },
];

// ---------------------------------------------------------------------------
// Simulated live metrics (replace with DB/service calls in production)
// ---------------------------------------------------------------------------

function simulateChainMetrics(chainId: string): {
  totalSupplyUsd: number;
  lockedSupplyUsd: number;
  healthScore: number;
  assets: AssetSupply[];
} {
  const base: Record<string, { totalSupplyUsd: number; lockedSupplyUsd: number; healthScore: number; assets: AssetSupply[] }> = {
    stellar:   { totalSupplyUsd: 4_200_000_000, lockedSupplyUsd: 1_800_000_000, healthScore: 94, assets: [
      { symbol: "USDC", lockedAmount: 950_000_000, mintedAmount: 0 },
      { symbol: "USDT", lockedAmount: 620_000_000, mintedAmount: 0 },
      { symbol: "WBTC", lockedAmount: 180_000_000, mintedAmount: 0 },
      { symbol: "WETH", lockedAmount: 50_000_000, mintedAmount: 0 },
    ]},
    ethereum:  { totalSupplyUsd: 12_000_000_000, lockedSupplyUsd: 3_200_000_000, healthScore: 98, assets: [
      { symbol: "USDC", lockedAmount: 1_800_000_000, mintedAmount: 950_000_000 },
      { symbol: "USDT", lockedAmount: 900_000_000, mintedAmount: 620_000_000 },
      { symbol: "WBTC", lockedAmount: 350_000_000, mintedAmount: 180_000_000 },
      { symbol: "WETH", lockedAmount: 150_000_000, mintedAmount: 50_000_000 },
    ]},
    polygon:   { totalSupplyUsd: 1_900_000_000, lockedSupplyUsd: 420_000_000, healthScore: 91, assets: [
      { symbol: "USDC", lockedAmount: 280_000_000, mintedAmount: 200_000_000 },
      { symbol: "USDT", lockedAmount: 140_000_000, mintedAmount: 100_000_000 },
    ]},
    bsc:       { totalSupplyUsd: 2_100_000_000, lockedSupplyUsd: 540_000_000, healthScore: 87, assets: [
      { symbol: "USDC", lockedAmount: 210_000_000, mintedAmount: 0 },
      { symbol: "USDT", lockedAmount: 330_000_000, mintedAmount: 0 },
    ]},
    avalanche: { totalSupplyUsd: 980_000_000, lockedSupplyUsd: 280_000_000, healthScore: 89, assets: [
      { symbol: "USDC", lockedAmount: 180_000_000, mintedAmount: 0 },
      { symbol: "WBTC", lockedAmount: 60_000_000, mintedAmount: 0 },
      { symbol: "WETH", lockedAmount: 40_000_000, mintedAmount: 0 },
    ]},
    tron:      { totalSupplyUsd: 3_500_000_000, lockedSupplyUsd: 1_100_000_000, healthScore: 82, assets: [
      { symbol: "USDT", lockedAmount: 900_000_000, mintedAmount: 0 },
      { symbol: "USDC", lockedAmount: 200_000_000, mintedAmount: 0 },
    ]},
  };
  return base[chainId] ?? { totalSupplyUsd: 0, lockedSupplyUsd: 0, healthScore: 0, assets: [] };
}

function simulateBridgeMetrics(bridgeId: string): {
  volume24hUsd: number;
  status: "healthy" | "degraded" | "offline";
  latencyMs: number;
} {
  const base: Record<string, { volume24hUsd: number; status: "healthy" | "degraded" | "offline"; latencyMs: number }> = {
    "stellar-ethereum-allbridge": { volume24hUsd: 18_500_000, status: "healthy", latencyMs: 180 },
    "stellar-polygon-allbridge": { volume24hUsd: 5_200_000, status: "healthy", latencyMs: 210 },
    "stellar-bsc-allbridge": { volume24hUsd: 7_800_000, status: "degraded", latencyMs: 450 },
    "stellar-tron-ultrastellar": { volume24hUsd: 12_000_000, status: "healthy", latencyMs: 120 },
    "ethereum-polygon-pos": { volume24hUsd: 45_000_000, status: "healthy", latencyMs: 240 },
    "ethereum-avalanche-avalanche-bridge": { volume24hUsd: 22_000_000, status: "healthy", latencyMs: 195 },
    "stellar-avalanche-allbridge": { volume24hUsd: 3_100_000, status: "offline", latencyMs: 0 },
  };
  return base[bridgeId] ?? { volume24hUsd: 0, status: "offline", latencyMs: 0 };
}

// ---------------------------------------------------------------------------
// SupplyChainService
// ---------------------------------------------------------------------------

export class SupplyChainService {
  async getGraph(): Promise<SupplyChainGraph> {
    // --- cache read ---
    try {
      const cached = await redis.get(CACHE_KEY);
      if (cached) {
        logger.debug("Supply chain graph cache hit");
        return JSON.parse(cached) as SupplyChainGraph;
      }
    } catch (err) {
      logger.warn({ err }, "Supply chain cache read error");
    }

    const graph = this.buildGraph();

    try {
      await redis.set(CACHE_KEY, JSON.stringify(graph), "EX", CACHE_TTL_SEC);
    } catch (err) {
      logger.warn({ err }, "Supply chain cache write error");
    }

    return graph;
  }

  private buildGraph(): SupplyChainGraph {
    const nodes: ChainNodeData[] = CHAIN_REGISTRY.map((base) => ({
      ...base,
      ...simulateChainMetrics(base.id),
    }));

    const edges: BridgeEdgeData[] = BRIDGE_REGISTRY.map((base) => ({
      ...base,
      ...simulateBridgeMetrics(base.id),
    }));

    const totalSupplyUsd = nodes.reduce((s, n) => s + n.totalSupplyUsd, 0);
    const totalBridgeVolumeUsd = edges.reduce((s, e) => s + e.volume24hUsd, 0);

    return {
      nodes,
      edges,
      totalSupplyUsd,
      totalBridgeVolumeUsd,
      lastUpdated: new Date().toISOString(),
    };
  }
}
