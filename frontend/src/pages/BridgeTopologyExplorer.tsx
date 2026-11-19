import { useMemo, useState } from "react";
import SupplyChainViz from "../components/SupplyChainViz";
import { useSupplyChainData } from "../hooks/useSupplyChainData";
import { Breadcrumb } from "../components/Breadcrumb/Breadcrumb";
import type { BridgeEdge, ChainNode } from "../components/SupplyChainViz/types";

function TopologyDetailPanel({
  node,
  edge,
}: {
  node: ChainNode | null;
  edge: BridgeEdge | null;
}) {
  if (!node && !edge) {
    return (
      <p className="text-sm text-stellar-text-secondary">
        Click a chain node or bridge edge to inspect topology details.
      </p>
    );
  }

  if (node) {
    return (
      <div className="space-y-3 text-sm">
        <h3 className="text-lg font-semibold text-white">{node.label}</h3>
        <dl className="space-y-2">
          <div>
            <dt className="text-stellar-text-secondary">Chain ID</dt>
            <dd className="text-white">{node.id}</dd>
          </div>
          <div>
            <dt className="text-stellar-text-secondary">Health score</dt>
            <dd className="text-white">{node.healthScore}</dd>
          </div>
          <div>
            <dt className="text-stellar-text-secondary">Total supply (USD)</dt>
            <dd className="text-white">${node.totalSupplyUsd.toLocaleString()}</dd>
          </div>
        </dl>
        <div>
          <p className="text-stellar-text-secondary">Assets</p>
          <ul className="mt-1 space-y-1">
            {node.assets.map((asset) => (
              <li key={asset.symbol} className="text-white">
                {asset.symbol}: locked {asset.lockedAmount.toLocaleString()}, minted{" "}
                {asset.mintedAmount.toLocaleString()}
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  if (edge) {
    return (
      <div className="space-y-3 text-sm">
        <h3 className="text-lg font-semibold text-white">{edge.bridgeName}</h3>
        <dl className="space-y-2">
          <div>
            <dt className="text-stellar-text-secondary">Route</dt>
            <dd className="text-white">
              {edge.source} → {edge.target}
            </dd>
          </div>
          <div>
            <dt className="text-stellar-text-secondary">Status</dt>
            <dd className="text-white">{edge.status}</dd>
          </div>
          <div>
            <dt className="text-stellar-text-secondary">24h volume (USD)</dt>
            <dd className="text-white">${edge.volume24hUsd.toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-stellar-text-secondary">Assets</dt>
            <dd className="text-white">{edge.assets.join(", ")}</dd>
          </div>
        </dl>
      </div>
    );
  }

  return null;
}

export type StatusFilterType = "all" | "healthy" | "degraded" | "offline";

export default function BridgeTopologyExplorer() {
  const { data, isLoading, error } = useSupplyChainData();
  const [chainFilter, setChainFilter] = useState("");
  const [bridgeFilter, setBridgeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilterType>("all");

  const graph = data ?? {
    nodes: [],
    edges: [],
    totalSupplyUsd: 0,
    totalBridgeVolumeUsd: 0,
    lastUpdated: new Date().toISOString(),
  };

  const filteredGraph = useMemo(() => {
    const chainQuery = chainFilter.trim().toLowerCase();
    const bridgeQuery = bridgeFilter.trim().toLowerCase();

    let nodes = graph.nodes;
    let edges = graph.edges;

    // Filter by bridge status; keep only chains connected by a matching bridge
    if (statusFilter !== "all") {
      edges = edges.filter((edge) => edge.status === statusFilter);
      const connected = new Set(edges.flatMap((e) => [e.source, e.target]));
      nodes = nodes.filter((node) => connected.has(node.id));
    }

    if (chainQuery) {
      nodes = nodes.filter(
        (node) =>
          node.id.toLowerCase().includes(chainQuery) ||
          node.label.toLowerCase().includes(chainQuery),
      );
      const nodeIds = new Set(nodes.map((n) => n.id));
      edges = edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
    }

    if (bridgeQuery) {
      edges = edges.filter(
        (edge) =>
          edge.bridgeName.toLowerCase().includes(bridgeQuery) ||
          edge.protocol.toLowerCase().includes(bridgeQuery),
      );
      const connected = new Set(edges.flatMap((e) => [e.source, e.target]));
      nodes = nodes.filter((node) => connected.has(node.id));
    }

    return { ...graph, nodes, edges };
  }, [graph, chainFilter, bridgeFilter, statusFilter]);

  const highlightedEdge = filteredGraph.edges[0] ?? null;
  const detailNode = filteredGraph.nodes[0] ?? null;

  return (
    <div className="flex h-full flex-col gap-4">
      <Breadcrumb />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-stellar-text-primary">Bridge Topology Explorer</h1>
          <p className="mt-2 text-stellar-text-secondary">
            Interactive graph of bridge connections, chain nodes, and routed assets.
          </p>
        </div>
        <a
          href="/docs/bridge-topology-model.md"
          className="text-sm text-stellar-blue hover:underline"
        >
          Topology model docs
        </a>
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="text-sm text-stellar-text-secondary">
          Filter chains
          <input
            className="ml-2 rounded-md border border-stellar-border bg-stellar-dark px-3 py-1.5 text-white"
            value={chainFilter}
            onChange={(e) => setChainFilter(e.target.value)}
            placeholder="stellar, ethereum..."
            aria-label="Filter chains"
          />
        </label>
        <label className="text-sm text-stellar-text-secondary">
          Filter bridges
          <input
            className="ml-2 rounded-md border border-stellar-border bg-stellar-dark px-3 py-1.5 text-white"
            value={bridgeFilter}
            onChange={(e) => setBridgeFilter(e.target.value)}
            placeholder="allbridge, wormhole..."
            aria-label="Filter bridges"
          />
        </label>
        <label className="text-sm text-stellar-text-secondary">
          Filter by status
          <select
            className="ml-2 rounded-md border border-stellar-border bg-stellar-dark px-3 py-1.5 text-white cursor-pointer"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilterType)}
            aria-label="Filter by status"
          >
            <option value="all">All</option>
            <option value="healthy">Healthy</option>
            <option value="degraded">Degraded</option>
            <option value="offline">Offline</option>
          </select>
        </label>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1fr_300px]">
        <div className="min-h-[480px] rounded-xl overflow-hidden border border-stellar-border">
          <SupplyChainViz data={filteredGraph} isLoading={isLoading} error={error?.message ?? null} />
        </div>
        <aside className="rounded-xl border border-stellar-border bg-stellar-card p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stellar-text-secondary">
            Drill-down
          </h2>
          <div className="mt-4 space-y-6">
            <TopologyDetailPanel node={detailNode} edge={null} />
            {highlightedEdge && <TopologyDetailPanel node={null} edge={highlightedEdge} />}
          </div>
        </aside>
      </div>
    </div>
  );
}
