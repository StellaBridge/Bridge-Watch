import type { ProvenanceNodeKind, ProvenanceGraph } from "../../types";

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

interface ProvenanceNodeListProps {
  graphData: ProvenanceGraph | undefined;
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
}

export function ProvenanceNodeList({
  graphData,
  selectedNodeId,
  setSelectedNodeId,
}: ProvenanceNodeListProps) {
  if (!graphData) return null;

  return (
    <details className="rounded-xl border border-stellar-border bg-stellar-card">
      <summary className="px-5 py-3 text-sm font-medium text-stellar-text-primary cursor-pointer select-none">
        Node list ({graphData.nodes.length})
      </summary>
      <div className="px-5 pb-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stellar-border text-left">
              {["Label", "Kind", "Entity", "Freshness", "Last updated"].map((h) => (
                <th key={h} className="py-2 pr-4 text-xs text-stellar-text-secondary font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {graphData.nodes.map((n) => (
              <tr
                key={n.id}
                className={`border-b border-stellar-border/40 cursor-pointer hover:bg-stellar-dark/50 transition-colors ${
                  selectedNodeId === n.id ? "bg-stellar-blue/10" : ""
                }`}
                onClick={() => setSelectedNodeId(selectedNodeId === n.id ? null : n.id)}
              >
                <td className="py-2 pr-4 text-stellar-text-primary font-medium">{n.label}</td>
                <td className="py-2 pr-4">
                  <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border"
                    style={{
                      color: KIND_COLORS[n.kind],
                      borderColor: KIND_COLORS[n.kind] + "55",
                      background: KIND_COLORS[n.kind] + "15",
                    }}
                  >
                    {KIND_LABEL[n.kind]}
                  </span>
                </td>
                <td className="py-2 pr-4 text-stellar-text-secondary text-xs">
                  {n.entityType} · {n.entityId}
                </td>
                <td className="py-2 pr-4">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${FRESHNESS_BADGE[n.freshness]}`}>
                    {n.freshness}
                  </span>
                </td>
                <td className="py-2 pr-4 text-stellar-text-secondary text-xs">
                  {new Date(n.timestamp).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}