import type { ChainNode, BridgeEdge } from "./types";

interface Props {
  node?: ChainNode;
  edge?: BridgeEdge;
  allNodes: ChainNode[];
  onClose: () => void;
}

function formatUsd(value: number): string {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  return `$${value.toLocaleString()}`;
}

function healthLabel(score: number): { text: string; color: string } {
  if (score >= 85) return { text: "Healthy", color: "text-green-400" };
  if (score >= 60) return { text: "Moderate", color: "text-yellow-400" };
  return { text: "Critical", color: "text-red-400" };
}

function statusBadge(status: BridgeEdge["status"]) {
  const map = {
    healthy: "bg-green-900/50 text-green-400 border-green-700",
    degraded: "bg-yellow-900/50 text-yellow-400 border-yellow-700",
    offline: "bg-red-900/50 text-red-400 border-red-700",
  };
  return `text-xs px-2 py-0.5 rounded border ${map[status]}`;
}

function NodeBreakdown({ node, onClose }: { node: ChainNode; onClose: () => void }) {
  const { text, color } = healthLabel(node.healthScore);

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-white text-base">{node.label}</h3>
          <p className="text-slate-400 text-xs capitalize">{node.chain} network</p>
        </div>
        <button
          onClick={onClose}
          className="text-slate-500 hover:text-white text-lg leading-none"
          aria-label="Close panel"
        >
          ×
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-slate-800 rounded p-2">
          <p className="text-slate-500 text-[10px] uppercase tracking-wide">Total Supply</p>
          <p className="text-white font-semibold text-sm">{formatUsd(node.totalSupplyUsd)}</p>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <p className="text-slate-500 text-[10px] uppercase tracking-wide">Locked</p>
          <p className="text-white font-semibold text-sm">{formatUsd(node.lockedSupplyUsd)}</p>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <p className="text-slate-500 text-[10px] uppercase tracking-wide">Health Score</p>
          <p className={`font-semibold text-sm ${color}`}>{node.healthScore} — {text}</p>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <p className="text-slate-500 text-[10px] uppercase tracking-wide">Assets</p>
          <p className="text-white font-semibold text-sm">{node.assets.length}</p>
        </div>
      </div>

      <div>
        <p className="text-slate-400 text-xs font-medium mb-1">Asset Breakdown</p>
        <div className="space-y-1">
          {node.assets.map((a) => (
            <div key={a.symbol} className="flex items-center justify-between text-xs bg-slate-800 rounded px-2 py-1.5">
              <span
                className="font-mono font-semibold"
                style={{ color: node.color }}
              >
                {a.symbol}
              </span>
              <div className="flex gap-4 text-slate-400">
                <span>Locked: {formatUsd(a.lockedAmount)}</span>
                {a.mintedAmount > 0 && (
                  <span>Minted: {formatUsd(a.mintedAmount)}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EdgeBreakdown({
  edge,
  allNodes,
  onClose,
}: {
  edge: BridgeEdge;
  allNodes: ChainNode[];
  onClose: () => void;
}) {
  const src = allNodes.find((n) => n.id === edge.source);
  const tgt = allNodes.find((n) => n.id === edge.target);

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-white text-base">{edge.bridgeName}</h3>
          <p className="text-slate-400 text-xs">
            {src?.label} ↔ {tgt?.label}
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-slate-500 hover:text-white text-lg leading-none"
          aria-label="Close panel"
        >
          ×
        </button>
      </div>

      <div className="flex items-center gap-2">
        <span className={statusBadge(edge.status)}>{edge.status}</span>
        {edge.latencyMs > 0 && (
          <span className="text-xs text-slate-500">{edge.latencyMs} ms</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-slate-800 rounded p-2">
          <p className="text-slate-500 text-[10px] uppercase tracking-wide">24h Volume</p>
          <p className="text-white font-semibold text-sm">{formatUsd(edge.volume24hUsd)}</p>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <p className="text-slate-500 text-[10px] uppercase tracking-wide">Direction</p>
          <p className="text-white font-semibold text-xs capitalize">
            {edge.flowDirection.replace(/-/g, " ")}
          </p>
        </div>
      </div>

      <div>
        <p className="text-slate-400 text-xs font-medium mb-1">Bridged Assets</p>
        <div className="flex flex-wrap gap-1">
          {edge.assets.map((asset) => (
            <span
              key={asset}
              className="text-xs font-mono bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-slate-300"
            >
              {asset}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function SupplyBreakdown({ node, edge, allNodes, onClose }: Props) {
  if (!node && !edge) return null;

  return (
    <div className="absolute top-4 right-4 w-64 bg-slate-900/95 border border-slate-700 rounded-xl shadow-2xl text-slate-300 overflow-hidden">
      {node && <NodeBreakdown node={node} onClose={onClose} />}
      {edge && !node && (
        <EdgeBreakdown edge={edge} allNodes={allNodes} onClose={onClose} />
      )}
    </div>
  );
}
