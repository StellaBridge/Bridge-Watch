import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface VolumeBreakdownProps {
  data: { date: string; [bridge: string]: string | number }[];
  bridgeNames: string[];
  isLoading: boolean;
  period: string;
}

const AREA_COLORS = ["#0057FF", "#00D4AA", "#FF6B35", "#8B5CF6"];

function formatVolume(v: number) {
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
  const total = payload.reduce((s, p) => s + (p.value ?? 0), 0);
  return (
    <div className="bg-stellar-card border border-stellar-border rounded-lg p-3 text-xs shadow-xl">
      <p className="text-stellar-text-secondary mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex justify-between gap-4" style={{ color: p.color }}>
          <span>{p.name}</span>
          <span className="font-medium">{formatVolume(p.value ?? 0)}</span>
        </p>
      ))}
      <p className="text-white font-semibold mt-1 pt-1 border-t border-stellar-border flex justify-between">
        <span>Total</span>
        <span>{formatVolume(total)}</span>
      </p>
    </div>
  );
};

export default function VolumeBreakdown({
  data,
  bridgeNames,
  isLoading,
  period,
}: VolumeBreakdownProps) {
  if (isLoading) {
    return (
      <div className="bg-stellar-card border border-stellar-border rounded-lg p-6">
        <div className="h-5 w-48 bg-stellar-border rounded animate-pulse mb-4" />
        <div className="h-64 bg-stellar-border/30 rounded animate-pulse" />
      </div>
    );
  }

  const tickEvery = data.length > 60 ? 14 : data.length > 20 ? 7 : 1;
  const tickDates = new Set(
    data.filter((_, i) => i % tickEvery === 0 || i === data.length - 1).map((d) => d.date)
  );

  return (
    <div className="bg-stellar-card border border-stellar-border rounded-lg p-6">
      <h2 className="text-lg font-semibold text-white mb-0.5">Volume Breakdown</h2>
      <p className="text-xs text-stellar-text-secondary mb-4">
        Daily transfer volume by bridge over {period}
      </p>

      {data.length === 0 || bridgeNames.length === 0 ? (
        <div className="h-64 flex items-center justify-center text-stellar-text-secondary text-sm">
          No volume data available
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={data}>
            <defs>
              {bridgeNames.map((name, i) => (
                <linearGradient
                  key={name}
                  id={`vol-grad-${i}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="5%"
                    stopColor={AREA_COLORS[i % AREA_COLORS.length]}
                    stopOpacity={0.25}
                  />
                  <stop
                    offset="95%"
                    stopColor={AREA_COLORS[i % AREA_COLORS.length]}
                    stopOpacity={0}
                  />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1E2340" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: "#8A8FA8", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              tickFormatter={(v) => (tickDates.has(v) ? v : "")}
            />
            <YAxis
              tickFormatter={(v) => formatVolume(v)}
              tick={{ fill: "#8A8FA8", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={60}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12, color: "#8A8FA8" }} />
            {bridgeNames.map((name, i) => (
              <Area
                key={name}
                type="monotone"
                dataKey={name}
                stroke={AREA_COLORS[i % AREA_COLORS.length]}
                strokeWidth={2}
                fill={`url(#vol-grad-${i})`}
                dot={false}
                activeDot={{ r: 4 }}
                stackId={undefined}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
