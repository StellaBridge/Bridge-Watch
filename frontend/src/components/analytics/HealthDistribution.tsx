import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { HealthDistributionItem } from "../../hooks/useAnalytics";

interface HealthDistributionProps {
  data: HealthDistributionItem[];
  isLoading: boolean;
}

const CustomTooltip = ({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { name: string; value: number; payload: HealthDistributionItem }[];
}) => {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  return (
    <div className="bg-stellar-card border border-stellar-border rounded-lg p-3 text-xs shadow-xl">
      <p style={{ color: entry.payload.color }} className="font-semibold">
        {entry.name}
      </p>
      <p className="text-white mt-0.5">{entry.value} assets</p>
    </div>
  );
};

export default function HealthDistribution({ data, isLoading }: HealthDistributionProps) {
  if (isLoading) {
    return (
      <div className="bg-stellar-card border border-stellar-border rounded-lg p-6">
        <div className="h-5 w-48 bg-stellar-border rounded animate-pulse mb-4" />
        <div className="h-56 bg-stellar-border/30 rounded animate-pulse" />
      </div>
    );
  }

  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="bg-stellar-card border border-stellar-border rounded-lg p-6">
      <h2 className="text-lg font-semibold text-white mb-1">Asset Health Distribution</h2>
      <p className="text-xs text-stellar-text-secondary mb-4">{total} assets total</p>

      {data.length === 0 ? (
        <div className="h-56 flex items-center justify-center text-stellar-text-secondary text-sm">
          No health data available
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={3}
                dataKey="value"
              >
                {data.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} stroke="transparent" />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend
                formatter={(value) => (
                  <span style={{ color: "#8A8FA8", fontSize: 12 }}>{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>

          {/* Percentage breakdown */}
          <div className="mt-3 grid grid-cols-3 gap-2">
            {data.map((d) => (
              <div key={d.name} className="text-center">
                <p className="text-lg font-bold" style={{ color: d.color }}>
                  {total > 0 ? Math.round((d.value / total) * 100) : 0}%
                </p>
                <p className="text-xs text-stellar-text-secondary">{d.name}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
