import type { ChainNode as ChainNodeType } from "./types";

interface Props {
  node: ChainNodeType;
  isSelected: boolean;
  isHovered: boolean;
  isDimmed: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}

const RADIUS = 38;

function healthColor(score: number): string {
  if (score >= 85) return "#22c55e";
  if (score >= 60) return "#f59e0b";
  return "#ef4444";
}

function formatSupply(value: number): string {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  return `$${value.toLocaleString()}`;
}

export default function ChainNode({
  node,
  isSelected,
  isHovered,
  isDimmed,
  onSelect,
  onHover,
}: Props) {
  const { position: { x, y }, color, label, healthScore, totalSupplyUsd } = node;
  const ringRadius = RADIUS + 6;
  const hc = healthColor(healthScore);
  const opacity = isDimmed ? 0.25 : 1;

  return (
    <g
      transform={`translate(${x},${y})`}
      style={{ cursor: "pointer", opacity, transition: "opacity 0.2s" }}
      onClick={() => onSelect(node.id)}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
      role="button"
      aria-label={`${label} chain node`}
    >
      {/* Outer health ring */}
      <circle
        r={ringRadius}
        fill="none"
        stroke={hc}
        strokeWidth={isSelected || isHovered ? 3 : 1.5}
        strokeDasharray={isSelected ? "none" : "6 3"}
        style={{ transition: "stroke-width 0.15s" }}
      />

      {/* Selection glow */}
      {(isSelected || isHovered) && (
        <circle
          r={ringRadius + 5}
          fill="none"
          stroke={color}
          strokeWidth={1}
          opacity={0.3}
        />
      )}

      {/* Node body */}
      <circle
        r={RADIUS}
        fill={`${color}22`}
        stroke={color}
        strokeWidth={isSelected ? 2.5 : 1.5}
        style={{ transition: "stroke-width 0.15s" }}
      />

      {/* Chain icon letter */}
      <text
        textAnchor="middle"
        dominantBaseline="central"
        y={-6}
        fontSize={13}
        fontWeight="700"
        fill={color}
        style={{ userSelect: "none", pointerEvents: "none" }}
      >
        {label.slice(0, 3).toUpperCase()}
      </text>

      {/* Supply value */}
      <text
        textAnchor="middle"
        dominantBaseline="central"
        y={10}
        fontSize={9}
        fill="#94a3b8"
        style={{ userSelect: "none", pointerEvents: "none" }}
      >
        {formatSupply(totalSupplyUsd)}
      </text>

      {/* Chain label below node */}
      <text
        textAnchor="middle"
        y={RADIUS + 18}
        fontSize={11}
        fontWeight={isSelected ? "700" : "500"}
        fill={isSelected ? color : "#cbd5e1"}
        style={{ userSelect: "none", pointerEvents: "none" }}
      >
        {label}
      </text>

      {/* Health score badge */}
      <g transform={`translate(${RADIUS - 4}, ${-RADIUS + 4})`}>
        <circle r={10} fill="#1e293b" stroke={hc} strokeWidth={1.5} />
        <text
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={7}
          fontWeight="700"
          fill={hc}
          style={{ userSelect: "none", pointerEvents: "none" }}
        >
          {healthScore}
        </text>
      </g>
    </g>
  );
}
