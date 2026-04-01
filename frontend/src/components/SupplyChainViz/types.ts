export interface AssetSupply {
  symbol: string;
  lockedAmount: number;
  mintedAmount: number;
}

export interface ChainNode {
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

export interface BridgeEdge {
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
  nodes: ChainNode[];
  edges: BridgeEdge[];
  totalSupplyUsd: number;
  totalBridgeVolumeUsd: number;
  lastUpdated: string;
}

export interface ViewTransform {
  x: number;
  y: number;
  scale: number;
}

export type EdgeStatus = BridgeEdge["status"];
