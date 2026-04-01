import type { ChainNode, BridgeEdge, ViewTransform } from "./types";

interface Props {
  nodes: ChainNode[];
  edges: BridgeEdge[];
  transform: ViewTransform;
  viewportWidth: number;
  viewportHeight: number;
  graphWidth: number;
  graphHeight: number;
  onPan: (x: number, y: number) => void;
}

const MM_WIDTH = 140;
const MM_HEIGHT = 100;
const PADDING = 20;

const STATUS_COLORS: Record<BridgeEdge["status"], string> = {
  healthy: "#22c55e",
  degraded: "#f59e0b",
  offline: "#ef4444",
};

export default function MiniMap({
  nodes,
  edges,
  transform,
  viewportWidth,
  viewportHeight,
  graphWidth,
  graphHeight,
  onPan,
}: Props) {
  // Scale factor: map graph coords → mini-map coords
  const scaleX = (MM_WIDTH - PADDING * 2) / graphWidth;
  const scaleY = (MM_HEIGHT - PADDING * 2) / graphHeight;

  function toMM(x: number, y: number) {
    return {
      x: PADDING + x * scaleX,
      y: PADDING + y * scaleY,
    };
  }

  // Viewport rectangle in mini-map space
  const vpW = (viewportWidth / transform.scale) * scaleX;
  const vpH = (viewportHeight / transform.scale) * scaleY;
  const vpX = PADDING + (-transform.x / transform.scale) * scaleX;
  const vpY = PADDING + (-transform.y / transform.scale) * scaleY;

  function handleClick(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const mmX = e.clientX - rect.left;
    const mmY = e.clientY - rect.top;
    // Convert mini-map click to graph coords
    const gx = (mmX - PADDING) / scaleX;
    const gy = (mmY - PADDING) / scaleY;
    // New transform: centre viewport on clicked graph point
    const nx = -(gx * transform.scale - viewportWidth / 2);
    const ny = -(gy * transform.scale - viewportHeight / 2);
    onPan(nx, ny);
  }

  return (
    <div className="absolute bottom-4 right-4 bg-slate-900/90 border border-slate-700 rounded-lg overflow-hidden shadow-xl">
      <div className="px-2 py-1 border-b border-slate-700 text-xs text-slate-400 font-medium">
        Overview
      </div>
      <svg
        width={MM_WIDTH}
        height={MM_HEIGHT}
        style={{ cursor: "crosshair", display: "block" }}
        onClick={handleClick}
        role="img"
        aria-label="Mini-map navigation"
      >
        {/* Edges */}
        {edges.map((edge) => {
          const src = nodes.find((n) => n.id === edge.source);
          const tgt = nodes.find((n) => n.id === edge.target);
          if (!src || !tgt) return null;
          const s = toMM(src.position.x, src.position.y);
          const t = toMM(tgt.position.x, tgt.position.y);
          return (
            <line
              key={edge.id}
              x1={s.x} y1={s.y}
              x2={t.x} y2={t.y}
              stroke={STATUS_COLORS[edge.status]}
              strokeWidth={0.8}
              opacity={0.5}
            />
          );
        })}

        {/* Nodes */}
        {nodes.map((node) => {
          const { x, y } = toMM(node.position.x, node.position.y);
          return (
            <circle
              key={node.id}
              cx={x} cy={y}
              r={4}
              fill={node.color}
              opacity={0.9}
            />
          );
        })}

        {/* Viewport indicator */}
        <rect
          x={vpX}
          y={vpY}
          width={Math.max(vpW, 8)}
          height={Math.max(vpH, 8)}
          fill="rgba(255,255,255,0.08)"
          stroke="rgba(255,255,255,0.4)"
          strokeWidth={1}
          rx={2}
        />
      </svg>
    </div>
  );
}
