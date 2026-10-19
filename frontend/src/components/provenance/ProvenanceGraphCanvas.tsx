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

const GRAPH_W = 900;
const GRAPH_H = 480;
const NODE_R = 26;

interface LayoutNode extends ProvenanceNode {
  x: number;
  y: number;
}

function abbreviate(label: string, max = 8): string {
  return label.length > max ? label.slice(0, max - 1) + "…" : label;
}

function GraphNode({
  node,
  selected,
  dimmed,
  onClick,
}: {
  node: LayoutNode;
  selected: boolean;
  dimmed: boolean;
  onClick: () => void;
}) {
  const color = KIND_COLORS[node.kind];
  return (
    <g
      transform={`translate(${node.x},${node.y})`}
      className="cursor-pointer"
      onClick={onClick}
      role="button"
      aria-label={`${node.label} (${node.kind}, ${node.freshness})`}
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      style={{ opacity: dimmed ? 0.25 : 1, transition: "opacity 0.2s" }}
    >
      {/* Selection ring */}
      <circle r={NODE_R + 6} fill="transparent" stroke={selected ? color : "transparent"} strokeWidth={2} />
      {/* Node body */}
      <circle
        r={NODE_R}
        fill="#1e293b"
        stroke={color}
        strokeWidth={selected ? 2.5 : 1.5}
        style={{ transition: "stroke-width 0.15s" }}
      />
      {/* Freshness dot */}
      <circle
        r={5}
        cx={NODE_R - 4}
        cy={-(NODE_R - 4)}
        fill={
          node.freshness === "fresh"
            ? "#22c55e"
            : node.freshness === "stale"
            ? "#f59e0b"
            : "#6b7280"
        }
        stroke="#0f172a"
        strokeWidth={1.5}
      />
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={9}
        fill="#e2e8f0"
        className="select-none pointer-events-none"
        style={{ fontWeight: selected ? 700 : 400 }}
      >
        {abbreviate(node.label)}
      </text>
      <text
        y={NODE_R + 13}
        textAnchor="middle"
        fontSize={8}
        fill="#94a3b8"
        className="select-none pointer-events-none"
      >
        {KIND_LABEL[node.kind]}
      </text>
    </g>
  );
}

function EdgeLine({
  from,
  to,
  transformKind,
  latencyMs,
  highlight,
}: {
  from: LayoutNode;
  to: LayoutNode;
  transformKind: string;
  latencyMs: number | null;
  highlight: boolean;
}) {
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  return (
    <g>
      <line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke={highlight ? "#60a5fa" : "#334155"}
        strokeWidth={highlight ? 2 : 1}
        markerEnd="url(#prov-arrow)"
        style={{ transition: "stroke 0.2s" }}
      />
      {highlight && (
        <>
          <text
            x={mx}
            y={my - 8}
            textAnchor="middle"
            fontSize={8}
            fill="#60a5fa"
            className="select-none pointer-events-none"
          >
            {transformKind}
          </text>
          {latencyMs !== null && (
            <text
              x={mx}
              y={my + 4}
              textAnchor="middle"
              fontSize={7}
              fill="#94a3b8"
              className="select-none pointer-events-none"
            >
              {latencyMs}ms
            </text>
          )}
        </>
      )}
    </g>
  );
}

interface ProvenanceGraphCanvasProps {
  graphData: ProvenanceGraph | undefined;
  laidOut: LayoutNode[];
  laidOutMap: Map<string, LayoutNode>;
  filteredIds: Set<string>;
  selectedNodeId: string | null;
  connectedIds: Set<string>;
  visibleEdges: ProvenanceGraph["edges"];
  onNodeClick: (id: string) => void;
}

export function ProvenanceGraphCanvas({
  graphData,
  laidOut,
  laidOutMap,
  filteredIds,
  selectedNodeId,
  connectedIds,
  visibleEdges,
  onNodeClick,
}: ProvenanceGraphCanvasProps) {
  if (!graphData) return null;

  return (
    <div className="flex-1 rounded-xl border border-stellar-border bg-stellar-card overflow-hidden relative">
      <svg
        viewBox={`0 0 ${GRAPH_W} ${GRAPH_H}`}
        className="w-full h-full"
        aria-label="Data provenance lineage graph"
      >
        <defs>
          <marker
            id="prov-arrow"
            markerWidth="8"
            markerHeight="8"
            refX="6"
            refY="3"
            orient="auto"
          >
            <path d="M0,0 L0,6 L8,3 z" fill="#475569" />
          </marker>
        </defs>

        {/* Column headers */}
        {(["source", "transform", "destination"] as ProvenanceNodeKind[]).map((kind) => {
          const cols = (["source", "transform", "destination"] as ProvenanceNodeKind[]).filter(
            (k) => (graphData?.nodes ?? []).some((n) => n.kind === k)
          );
          const colIdx = cols.indexOf(kind);
          if (colIdx === -1) return null;
          const colW = GRAPH_W / (cols.length + 1);
          return (
            <text
              key={kind}
              x={colW * (colIdx + 1)}
              y={22}
              textAnchor="middle"
              fontSize={10}
              fill={KIND_COLORS[kind]}
              className="select-none"
              fontWeight={600}
              letterSpacing={1}
            >
              {KIND_LABEL[kind].toUpperCase()}
            </text>
          );
        })}

        {/* Edges */}
        {visibleEdges.map((e, i) => {
          const from = laidOutMap.get(e.from);
          const to = laidOutMap.get(e.to);
          if (!from || !to) return null;
          const hl = selectedNodeId === e.from || selectedNodeId === e.to;
          return (
            <EdgeLine
              key={i}
              from={from}
              to={to}
              transformKind={e.transformKind}
              latencyMs={e.latencyMs}
              highlight={hl}
            />
          );
        })}

        {/* Nodes */}
        {laidOut
          .filter((n) => filteredIds.has(n.id))
          .map((n) => (
            <GraphNode
              key={n.id}
              node={n}
              selected={selectedNodeId === n.id}
              dimmed={
                selectedNodeId !== null &&
                selectedNodeId !== n.id &&
                !connectedIds.has(n.id)
              }
              onClick={() => onNodeClick(n.id)}
            />
          ))}
      </svg>
    </div>
  );
}