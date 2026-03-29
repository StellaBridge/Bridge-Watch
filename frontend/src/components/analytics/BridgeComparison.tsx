import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { BridgeAnalytics } from "../../hooks/useAnalytics";

interface BridgeComparisonProps {
  bridges: BridgeAnalytics[];
  isLoading: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  healthy: "#22c55e",
  degraded: "#eab308",
  down: "#ef4444",
  unknown: "#8A8FA8",
};

function formatMillions(v: number) {
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-stellar-card border border-stellar-border rounded-lg p-3 text-xs shadow-xl">
      <p className="text-white font-semibold mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }} className="flex justify-between gap-4">
          <span>{p.name}</span>
          <span className="font-medium">{formatMillions(p.value)}</span>
        </p>
      ))}
    </div>
  );
};

export default function BridgeComparison({ bridges, isLoading }: BridgeComparisonProps) {
  if (isLoading) {
    return (
      <div className="bg-stellar-card border border-stellar-border rounded-lg p-6">
        <div className="h-5 w-48 bg-stellar-border rounded animate-pulse mb-4" />
        <div className="h-64 bg-stellar-border/30 rounded animate-pulse" />
      </div>
    );
  }

  const data = bridges.map((b) => ({
    name: b.name.replace(" Bridge", "").replace("Stellar-", ""),
    TVL: b.tvl,
    "Vol 24h": b.volume24h,
    "Vol 7d": b.volume7d,
    _status: b.status,
  }));

  if (data.length === 0) {
    return (
      <div className="bg-stellar-card border border-stellar-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Bridge Comparison</h2>
        <div className="h-64 flex items-center justify-center text-stellar-text-secondary text-sm">
          No bridge data available
        </div>
      </div>
    );
  }

  return (
    <div className="bg-stellar-card border border-stellar-border rounded-lg p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-semibold text-white">Bridge Comparison</h2>
        <div className="flex items-center gap-3">
          {bridges.map((b) => (
            <span key={b.name} className="flex items-center gap-1 text-xs text-stellar-text-secondary">
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: STATUS_COLORS[b.status] ?? STATUS_COLORS.unknown }}
              />
              {b.name.replace(" Bridge", "")}
            </span>
          ))}
        </div>
      </div>
      <p className="text-xs text-stellar-text-secondary mb-4">TVL · 24h Volume · 7d Volume</p>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} barGap={4}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1E2340" vertical={false} />
          <XAxis dataKey="name" tick={{ fill: "#8A8FA8", fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={(v) => formatMillions(v)} tick={{ fill: "#8A8FA8", fontSize: 11 }} axisLine={false} tickLine={false} width={60} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
          <Legend wrapperStyle={{ fontSize: 12, color: "#8A8FA8" }} />
          <Bar dataKey="TVL" fill="#0057FF" radius={[3, 3, 0, 0]} />
          <Bar dataKey="Vol 24h" fill="#00D4AA" radius={[3, 3, 0, 0]} />
          <Bar dataKey="Vol 7d" fill="#8B5CF6" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
