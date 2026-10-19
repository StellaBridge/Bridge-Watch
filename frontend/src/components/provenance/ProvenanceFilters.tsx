import type { ProvenanceListItem, ProvenanceNodeKind } from "../../types";

interface ProvenanceFiltersProps {
  filterAsset: string;
  setFilterAsset: (v: string) => void;
  filterBridge: string;
  setFilterBridge: (v: string) => void;
  filterMetric: string;
  setFilterMetric: (v: string) => void;
  filterKind: ProvenanceNodeKind | "all";
  setFilterKind: (v: ProvenanceNodeKind | "all") => void;
  metricsLoading: boolean;
  metrics: ProvenanceListItem[];
  selectedMetric: ProvenanceListItem | null;
  setSelectedMetric: (item: ProvenanceListItem | null) => void;
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  graphData: { nodes: { freshness: string; kind: ProvenanceNodeKind }[]; edges: unknown[] } | undefined;
}

export function ProvenanceFilters({
  filterAsset,
  setFilterAsset,
  filterBridge,
  setFilterBridge,
  filterMetric,
  setFilterMetric,
  filterKind,
  setFilterKind,
  metricsLoading,
  metrics,
  selectedMetric,
  setSelectedMetric,
  selectedNodeId,
  setSelectedNodeId,
  graphData,
}: ProvenanceFiltersProps) {
  const freshCount = graphData?.nodes.filter((n) => n.freshness === "fresh").length ?? 0;
  const staleCount = graphData?.nodes.filter((n) => n.freshness === "stale").length ?? 0;

  return (
    <section aria-label="Metric filters and selector">
      <div className="flex flex-wrap gap-3 items-center mb-4">
        <input
          type="text"
          placeholder="Filter by asset…"
          value={filterAsset}
          onChange={(e) => setFilterAsset(e.target.value)}
          className="rounded-lg border border-stellar-border bg-stellar-dark px-3 py-1.5 text-sm text-stellar-text-primary placeholder-stellar-text-secondary focus:outline-none focus:ring-2 focus:ring-stellar-blue w-40"
        />
        <input
          type="text"
          placeholder="Filter by bridge…"
          value={filterBridge}
          onChange={(e) => setFilterBridge(e.target.value)}
          className="rounded-lg border border-stellar-border bg-stellar-dark px-3 py-1.5 text-sm text-stellar-text-primary placeholder-stellar-text-secondary focus:outline-none focus:ring-2 focus:ring-stellar-blue w-40"
        />
        <select
          value={filterMetric}
          onChange={(e) => setFilterMetric(e.target.value)}
          className="rounded-lg border border-stellar-border bg-stellar-dark px-3 py-1.5 text-sm text-stellar-text-primary focus:outline-none focus:ring-2 focus:ring-stellar-blue"
        >
          <option value="">All metric types</option>
          {["price", "health", "tvl", "alerts"].map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      {metricsLoading && (
        <p className="text-sm text-stellar-text-secondary">Loading metrics…</p>
      )}

      {!metricsLoading && metrics.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {metrics.map((item) => {
            const key = `${item.metric}:${item.asset ?? item.bridge ?? ""}`;
            const selKey = selectedMetric
              ? `${selectedMetric.metric}:${selectedMetric.asset ?? selectedMetric.bridge ?? ""}`
              : null;
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setSelectedMetric(item);
                  setSelectedNodeId(null);
                }}
                className={`rounded-lg border px-3 py-2 text-sm transition-colors text-left ${
                  key === selKey
                    ? "border-stellar-blue bg-stellar-blue/10 text-white"
                    : "border-stellar-border bg-stellar-card text-stellar-text-secondary hover:text-white hover:border-stellar-blue/50"
                }`}
              >
                <p className="font-medium capitalize">
                  {item.asset
                    ? `${item.metric} · ${item.asset}`
                    : item.bridge
                    ? `${item.metric} · ${item.bridge}`
                    : item.metric}
                </p>
                <p className="text-xs text-stellar-text-secondary mt-0.5">{item.nodeCount} nodes</p>
              </button>
            );
          })}
        </div>
      )}

      {!metricsLoading && metrics.length === 0 && (
        <p className="text-sm text-stellar-text-secondary">No metrics match the current filters.</p>
      )}

      {selectedMetric && graphData && (
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="flex flex-wrap gap-3">
            {[
              { label: "Total nodes", value: graphData.nodes.length, color: "" },
              { label: "Fresh", value: freshCount, color: "text-green-400" },
              { label: "Stale", value: staleCount, color: "text-yellow-400" },
              { label: "Edges", value: graphData.edges.length, color: "" },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-lg border border-stellar-border bg-stellar-card px-4 py-3 min-w-[100px]"
              >
                <p className="text-xs text-stellar-text-secondary">{s.label}</p>
                <p className={`text-2xl font-bold ${s.color || "text-stellar-text-primary"}`}>
                  {s.value}
                </p>
              </div>
            ))}

            <div className="ml-auto flex items-center gap-3">
              <select
                value={filterKind}
                onChange={(e) => setFilterKind(e.target.value as ProvenanceNodeKind | "all")}
                className="rounded-lg border border-stellar-border bg-stellar-dark px-3 py-1.5 text-sm text-stellar-text-primary focus:outline-none focus:ring-2 focus:ring-stellar-blue"
              >
                <option value="all">All node kinds</option>
                <option value="source">Source</option>
                <option value="transform">Transform</option>
                <option value="destination">Destination</option>
              </select>

              {selectedNodeId && (
                <button
                  type="button"
                  onClick={() => setSelectedNodeId(null)}
                  className="rounded-lg border border-stellar-border bg-stellar-dark px-3 py-1.5 text-sm text-stellar-text-secondary hover:text-white transition-colors"
                >
                  Clear selection
                </button>
              )}
            </div>
          </div>

          {/* Kind legend */}
          <div className="flex gap-4 flex-wrap text-xs text-stellar-text-secondary items-center w-full">
            {(["source", "transform", "destination"] as ProvenanceNodeKind[]).map((k) => (
              <span key={k} className="flex items-center gap-1.5">
                <span
                  className="inline-block w-3 h-3 rounded-full"
                  style={{ background: KIND_COLORS[k] }}
                />
                {KIND_LABEL[k]}
              </span>
            ))}
            <span className="flex items-center gap-1.5 ml-4">
              <span className="inline-block w-3 h-3 rounded-full bg-green-500" /> Fresh
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-full bg-yellow-500" /> Stale
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-full bg-gray-500" /> Unknown
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

const KIND_COLORS: Record<string, string> = {
  source: "#818cf8",
  transform: "#f59e0b",
  destination: "#22c55e",
};

const KIND_LABEL: Record<string, string> = {
  source: "Source",
  transform: "Transform",
  destination: "Destination",
};