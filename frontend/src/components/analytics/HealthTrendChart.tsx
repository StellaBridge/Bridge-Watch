import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { HealthTimeSeriesPoint } from "../../hooks/useAnalytics";

interface HealthTrendChartProps {
  data: HealthTimeSeriesPoint[];
  isLoading: boolean;
  period: string;
}

// One colour per tracked asset (max 5 in current config)
const LINE_COLORS = ["#0057FF", "#00D4AA", "#FF6B35", "#8B5CF6", "#EAB308"];

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
      <p className="text-stellar-text-secondary mb-1">{label}</p>
      {payload
        .slice()
        .sort((a, b) => b.value - a.value)
        .map((p) => (
          <p key={p.name} className="flex justify-between gap-4" style={{ color: p.color }}>
            <span>{p.name}</span>
            <span className="font-medium">{p.value.toFixed(1)}</span>
          </p>
        ))}
    </div>
  );
};

export default function HealthTrendChart({
  data,
  isLoading,
  period,
}: HealthTrendChartProps) {
  if (isLoading) {
    return (
      <div className="bg-stellar-card border border-stellar-border rounded-lg p-6">
        <div className="h-5 w-48 bg-stellar-border rounded animate-pulse mb-4" />
        <div className="h-64 bg-stellar-border/30 rounded animate-pulse" />
      </div>
    );
  }

  const assetKeys =
    data.length > 0 ? Object.keys(data[0]).filter((k) => k !== "date") : [];

  // Thin out ticks when the period is large for readability
  const tickEvery = data.length > 60 ? 14 : data.length > 20 ? 7 : 1;
  const tickData = data.filter((_, i) => i % tickEvery === 0 || i === data.length - 1);
  const tickDates = new Set(tickData.map((d) => d.date));

  return (
    <div className="bg-stellar-card border border-stellar-border rounded-lg p-6">
      <h2 className="text-lg font-semibold text-white mb-0.5">Health Score Trends</h2>
      <p className="text-xs text-stellar-text-secondary mb-4">
        Per-asset composite health score over {period}
      </p>

      {data.length === 0 || assetKeys.length === 0 ? (
        <div className="h-64 flex items-center justify-center text-stellar-text-secondary text-sm">
          No health data available
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={data}>
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
              domain={[0, 100]}
              tick={{ fill: "#8A8FA8", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={32}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12, color: "#8A8FA8" }} />
            {assetKeys.map((key, i) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={LINE_COLORS[i % LINE_COLORS.length]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
