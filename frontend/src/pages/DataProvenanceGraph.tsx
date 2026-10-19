import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getProvenanceMetrics, getProvenanceLineage } from "../services/api";
import type {
  ProvenanceGraph,
  ProvenanceNode,
  ProvenanceNodeKind,
  ProvenanceListItem,
} from "../types";
import { ProvenanceGraphCanvas } from "../components/provenance/ProvenanceGraphCanvas";
import { ProvenanceNodeDetail } from "../components/provenance/ProvenanceNodeDetail";
import { ProvenanceFilters } from "../components/provenance/ProvenanceFilters";
import { ProvenanceNodeList } from "../components/provenance/ProvenanceNodeList";

export default function DataProvenanceGraph() {
  const [filterAsset, setFilterAsset] = useState("");
  const [filterBridge, setFilterBridge] = useState("");
  const [filterMetric, setFilterMetric] = useState("");
  const [selectedMetric, setSelectedMetric] = useState<ProvenanceListItem | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [filterKind, setFilterKind] = useState<ProvenanceNodeKind | "all">("all");

  const { data: metricsData, isLoading: metricsLoading } = useQuery({
    queryKey: ["provenance-metrics", filterAsset, filterBridge, filterMetric],
    queryFn: () =>
      getProvenanceMetrics({
        asset: filterAsset || undefined,
        bridge: filterBridge || undefined,
        metric: filterMetric || undefined,
      }),
    staleTime: 30_000,
  });

  const { data: graphData, isLoading: _graphLoading, error: _graphError } = useQuery<ProvenanceGraph, Error>({
    queryKey: [
      "provenance-lineage",
      selectedMetric?.metric,
      selectedMetric?.asset,
      selectedMetric?.bridge,
    ],
    queryFn: () =>
      getProvenanceLineage(
        selectedMetric!.metric,
        selectedMetric!.asset ?? undefined,
        selectedMetric!.bridge ?? undefined
      ),
    enabled: !!selectedMetric,
    staleTime: 30_000,
  });

  const laidOut = useMemo(() => layoutNodes(graphData?.nodes ?? []), [graphData]);
  const laidOutMap = useMemo(() => new Map(laidOut.map((n) => [n.id, n])), [laidOut]);

  const filteredNodes = useMemo(() => {
    if (filterKind === "all" || !graphData) return graphData?.nodes ?? [];
    return graphData.nodes.filter((n: ProvenanceNode) => n.kind === filterKind);
  }, [graphData, filterKind]);
  const filteredIds = useMemo(() => new Set<string>(filteredNodes.map((n: ProvenanceNode) => n.id)), [filteredNodes]);

  const visibleEdges = useMemo(
    () => (graphData?.edges ?? []).filter((e: { from: string; to: string }) => filteredIds.has(e.from) && filteredIds.has(e.to)),
    [graphData, filteredIds]
  );

  const connectedIds = useMemo(() => {
    if (!selectedNodeId || !graphData) return new Set<string>();
    const ids = new Set<string>();
    for (const e of graphData.edges) {
      if (e.from === selectedNodeId) ids.add(e.to);
      if (e.to === selectedNodeId) ids.add(e.from);
    }
    return ids;
  }, [selectedNodeId, graphData]);

  const metrics = metricsData?.metrics ?? [];

  return (
    <div className="flex flex-col gap-6 h-full">
      <div>
        <h1 className="text-3xl font-bold text-stellar-text-primary mb-1">
          Data Provenance Graph
        </h1>
        <p className="text-stellar-text-secondary text-sm">
          Trace each metric back to its source, transform steps, timestamps, and freshness markers.
        </p>
      </div>

      <ProvenanceFilters
        filterAsset={filterAsset}
        setFilterAsset={setFilterAsset}
        filterBridge={filterBridge}
        setFilterBridge={setFilterBridge}
        filterMetric={filterMetric}
        setFilterMetric={setFilterMetric}
        filterKind={filterKind}
        setFilterKind={setFilterKind}
        metricsLoading={metricsLoading}
        metrics={metrics}
        selectedMetric={selectedMetric}
        setSelectedMetric={setSelectedMetric}
        selectedNodeId={selectedNodeId}
        setSelectedNodeId={setSelectedNodeId}
        graphData={graphData}
      />

      {selectedMetric && (
        <div className="flex gap-4 flex-1 min-h-0" style={{ minHeight: 400 }}>
          <ProvenanceGraphCanvas
            graphData={graphData}
            laidOut={laidOut}
            laidOutMap={laidOutMap}
            filteredIds={filteredIds}
            selectedNodeId={selectedNodeId}
            connectedIds={connectedIds}
            visibleEdges={visibleEdges}
            onNodeClick={(id) => setSelectedNodeId(selectedNodeId === id ? null : id)}
          />
          {selectedNodeId && laidOutMap.get(selectedNodeId) && (
            <ProvenanceNodeDetail
              node={laidOutMap.get(selectedNodeId)!}
              edges={graphData?.edges ?? []}
              nodeMap={laidOutMap}
              onSelectNode={(id) => setSelectedNodeId(id)}
              onClose={() => setSelectedNodeId(null)}
            />
          )}
        </div>
      )}

      <ProvenanceNodeList
        graphData={graphData}
        selectedNodeId={selectedNodeId}
        setSelectedNodeId={setSelectedNodeId}
      />

      {!selectedMetric && !metricsLoading && (
        <div className="flex-1 flex items-center justify-center rounded-xl border border-stellar-border bg-stellar-card text-stellar-text-secondary text-sm">
          Select a metric above to view its full lineage graph.
        </div>
      )}
    </div>
  );
}

const GRAPH_W = 900;
const GRAPH_H = 480;

interface LayoutNode extends ProvenanceNode {
  x: number;
  y: number;
}

function layoutNodes(nodes: ProvenanceNode[]): LayoutNode[] {
  if (nodes.length === 0) return [];

  const byKind = new Map<ProvenanceNodeKind, ProvenanceNode[]>([
    ["source", []],
    ["transform", []],
    ["destination", []],
  ]);

  for (const n of nodes) {
    byKind.get(n.kind)?.push(n);
  }

  const cols = (["source", "transform", "destination"] as ProvenanceNodeKind[]).filter(
    (k) => (byKind.get(k)?.length ?? 0) > 0
  );
  const colW = GRAPH_W / (cols.length + 1);

  const laid: LayoutNode[] = [];
  cols.forEach((kind, ci) => {
    const group = byKind.get(kind) ?? [];
    const rowH = GRAPH_H / (group.length + 1);
    group.forEach((n, ri) => {
      laid.push({ ...n, x: colW * (ci + 1), y: rowH * (ri + 1) });
    });
  });

  return laid;
}