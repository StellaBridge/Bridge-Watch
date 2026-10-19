import type { ProvenanceGraph, ProvenanceNode, ProvenanceNodeKind } from "../../types";

const KIND_COLORS: Record<ProvenanceNodeKind, string> = {
  source: "#818cf8",
  transform: "#f59e0b",
  destination: "#22c55e",
};

const KIND_LABEL: Record<ProvenanceNodeKind, string> = {
  source: "Source",
  transform: "Transform",
  destination: "Destination",
};

const FRESHNESS_BADGE: Record<string, string> = {
  fresh: "bg-green-500/20 text-green-400 border border-green-500/30",
  stale: "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30",
  unknown: "bg-gray-500/20 text-gray-400 border border-gray-500/30",
};

interface ProvenanceNodeDetailProps {
  node: ProvenanceNode;
  edges: ProvenanceGraph["edges"];
  nodeMap: Map<string, ProvenanceNode>;
  onSelectNode: (id: string) => void;
  onClose: () => void;
}

export function ProvenanceNodeDetail({
  node,
  edges,
  nodeMap,
  onSelectNode,
  onClose,
}: ProvenanceNodeDetailProps) {
  const connected = edges.filter((e) => e.from === node.id || e.to === node.id);

  return (
    <aside
      className="w-72 shrink-0 rounded-xl border border-stellar-border bg-stellar-card p-5 space-y-4 overflow-y-auto"
      aria-label="Node detail drawer"
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-base font-semibold text-stellar-text-primary leading-tight">
          {node.label}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="text-stellar-text-secondary hover:text-white text-lg leading-none shrink-0"
          aria-label="Close detail drawer"
        >
          ×
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <span
          className="rounded-full px-2 py-0.5 text-xs font-medium border"
          style={{
            color: KIND_COLORS[node.kind],
            borderColor: KIND_COLORS[node.kind] + "55",
            background: KIND_COLORS[node.kind] + "15",
          }}
        >
          {KIND_LABEL[node.kind]}
        </span>
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${FRESHNESS_BADGE[node.freshness]}`}>
          {node.freshness}
        </span>
      </div>

      <div className="text-xs text-stellar-text-secondary space-y-1.5">
        <p>
          <span className="text-stellar-text-primary font-medium">ID: </span>
          <span className="font-mono">{node.id}</span>
        </p>
        <p>
          <span className="text-stellar-text-primary font-medium">Entity: </span>
          {node.entityType} · {node.entityId}
        </p>
        <p>
          <span className="text-stellar-text-primary font-medium">Last updated: </span>
          {new Date(node.timestamp).toLocaleString()}
        </p>
      </div>

      {node.description && (
        <p className="text-sm text-stellar-text-secondary">{node.description}</p>
      )}

      {Object.keys(node.metadata).length > 0 && (
        <div className="rounded-lg border border-stellar-border bg-stellar-dark p-3">
          <p className="text-xs font-medium text-stellar-text-primary mb-2">Metadata</p>
          <dl className="space-y-1">
            {Object.entries(node.metadata).map(([k, v]) => (
              <div key={k} className="flex gap-2 text-xs">
                <dt className="text-stellar-text-secondary shrink-0">{k}</dt>
                <dd className="text-stellar-text-primary font-mono truncate">{String(v)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {connected.length > 0 && (
        <div>
          <p className="text-xs font-medium text-stellar-text-primary mb-2">
            Connections ({connected.length})
          </p>
          <ul className="space-y-1.5">
            {connected.map((e, i) => {
              const isOut = e.from === node.id;
              const otherId = isOut ? e.to : e.from;
              const other = nodeMap.get(otherId);
              return (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => onSelectNode(otherId)}
                    className="w-full text-left rounded-md border border-stellar-border bg-stellar-dark px-3 py-1.5 text-xs hover:bg-stellar-border/40 transition-colors flex items-center justify-between gap-2"
                  >
                    <span className="flex items-center gap-1 truncate">
                      <span className="text-stellar-text-secondary">{isOut ? "→" : "←"}</span>
                      <span className="text-stellar-text-primary truncate">
                        {other?.label ?? otherId}
                      </span>
                    </span>
                    <span className="text-stellar-text-secondary shrink-0 font-mono">
                      {e.transformKind}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </aside>
  );
}