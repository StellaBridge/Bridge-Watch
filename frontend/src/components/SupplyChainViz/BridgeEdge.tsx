import { useMemo } from "react";
import type { BridgeEdge as BridgeEdgeType, ChainNode } from "./types";

interface Props {
  edge: BridgeEdgeType;
  nodes: ChainNode[];
  isSelected: boolean;
  isHovered: boolean;
  isDimmed: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}

const STATUS_COLORS: Record<BridgeEdgeType["status"], string> = {
  healthy: "#22c55e",
  degraded: "#f59e0b",
  offline: "#ef4444",
};

function formatVolume(value: number): string {
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

/** Cubic bezier control point offset — pulls the curve toward the graph centre */
function cubicPath(
  x1: number, y1: number,
  x2: number, y2: number,
  cx: number, cy: number
): string {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const bend = 0.15;
  const cpx = mx + bend * (cx - mx);
  const cpy = my + bend * (cy - my);
  return `M ${x1} ${y1} Q ${cpx} ${cpy} ${x2} ${y2}`;
}

export default function BridgeEdge({
  edge,
  nodes,
  isSelected,
  isHovered,
  isDimmed,
  onSelect,
  onHover,
}: Props) {
  const src = nodes.find((n) => n.id === edge.source);
  const tgt = nodes.find((n) => n.id === edge.target);

  const path = useMemo(() => {
    if (!src || !tgt) return "";
    // Centre of the graph (approx) as the control-point attractor
    const cx = nodes.reduce((s, n) => s + n.position.x, 0) / nodes.length;
    const cy = nodes.reduce((s, n) => s + n.position.y, 0) / nodes.length;
    return cubicPath(
      src.position.x, src.position.y,
      tgt.position.x, tgt.position.y,
      cx, cy
    );
  }, [src, tgt, nodes]);

  if (!src || !tgt || !path) return null;

  const color = STATUS_COLORS[edge.status];
  const strokeWidth = isSelected || isHovered ? 2.5 : edge.status === "offline" ? 0.8 : 1.5;
  const opacity = isDimmed ? 0.15 : edge.status === "offline" ? 0.35 : 1;
  const dashLen = Math.max(4, Math.min(12, edge.volume24hUsd / 3_000_000));
  const animationDuration = edge.volume24hUsd > 10_000_000 ? "2s" : "4s";

  // Mid-point of the bezier for label placement
  const mx = (src.position.x + tgt.position.x) / 2;
  const my = (src.position.y + tgt.position.y) / 2;

  return (
    <g
      style={{ cursor: "pointer", opacity, transition: "opacity 0.2s" }}
      onClick={() => onSelect(edge.id)}
      onMouseEnter={() => onHover(edge.id)}
      onMouseLeave={() => onHover(null)}
    >
      {/* Hit area (invisible wide path for easier click) */}
      <path d={path} fill="none" stroke="transparent" strokeWidth={16} />

      {/* Static base line */}
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeOpacity={0.3}
        style={{ transition: "stroke-width 0.15s" }}
      />

      {/* Animated flow dashes */}
      {edge.status !== "offline" && (
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={`${dashLen} ${dashLen * 2.5}`}
          style={{
            animation: `supply-flow ${animationDuration} linear infinite`,
          }}
        />
      )}

      {/* Bidirectional arrow markers */}
      {edge.flowDirection === "bidirectional" && (
        <>
          <circle cx={src.position.x} cy={src.position.y} r={3} fill={color} opacity={0.6} />
          <circle cx={tgt.position.x} cy={tgt.position.y} r={3} fill={color} opacity={0.6} />
        </>
      )}

      {/* Volume label at mid-point */}
      {(isSelected || isHovered) && (
        <g transform={`translate(${mx},${my})`}>
          <rect x={-28} y={-10} width={56} height={20} rx={4} fill="#1e293b" stroke={color} strokeWidth={1} />
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={9}
            fill={color}
            fontWeight="600"
            style={{ userSelect: "none", pointerEvents: "none" }}
          >
            {formatVolume(edge.volume24hUsd)}
          </text>
        </g>
      )}
    </g>
  );
}
