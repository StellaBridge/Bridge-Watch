import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { HealthFactors, HealthStatus, HealthHistoryPoint } from "../types";

interface HealthBreakdownProps {
  factors: HealthFactors | null;
  history: HealthHistoryPoint[];
  isHistoryLoading: boolean;
}

const FACTOR_CONFIG: Record<
  keyof HealthFactors,
  { label: string; description: string }
> = {
  liquidityDepth: {
    label: "Liquidity Depth",
    description: "Aggregate DEX bid/ask depth",
  },
  priceStability: {
    label: "Price Stability",
    description: "Cross-source price deviation",
  },
  bridgeUptime: {
    label: "Bridge Uptime",
    description: "Bridge operational status over 30d",
  },
  reserveBacking: {
    label: "Reserve Backing",
    description: "On-chain supply vs source reserves",
  },
  volumeTrend: {
    label: "Volume Trend",
    description: "Trading volume momentum",
  },
};

function getHealthStatus(score: number): HealthStatus {
  if (score >= 80) return "healthy";
  if (score >= 50) return "warning";
  return "critical";
}

function getStatusColor(status: HealthStatus): string {
  switch (status) {
    case "healthy":
      return "#22c55e";
    case "warning":
      return "#eab308";
    case "critical":
      return "#ef4444";
  }
}

export default function HealthBreakdown({
  factors,
  history,
  isHistoryLoading,
}: HealthBreakdownProps) {
  return (
    <div className="space-y-6">
      {/* Factor breakdown */}
      <div className="bg-stellar-card border border-stellar-border rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">
          Health Score Breakdown
        </h3>

        {factors ? (
          <div className="space-y-4">
            {(Object.entries(factors) as [keyof HealthFactors, number][]).map(
              ([key, value]) => {
                const config = FACTOR_CONFIG[key];
                const status = getHealthStatus(value);
                const color = getStatusColor(status);

                return (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div>
                        <span className="text-sm text-white font-medium">
                          {config.label}
                        </span>
                        <p className="text-xs text-stellar-text-secondary">
                          {config.description}
                        </p>
                      </div>
                      <span
                        className="text-lg font-bold tabular-nums"
                        style={{ color }}
                      >
                        {value}
                      </span>
                    </div>
                    <div
                      className="w-full h-2 bg-stellar-border rounded-full overflow-hidden"
                      role="progressbar"
                      aria-valuenow={value}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${value}%`, backgroundColor: color }}
                      />
                    </div>
                  </div>
                );
              }
            )}
          </div>
        ) : (
          <div className="h-48 flex items-center justify-center">
            <span className="text-stellar-text-secondary">
              No health factor data available
            </span>
          </div>
        )}
      </div>

      {/* Health history chart */}
      <div className="bg-stellar-card border border-stellar-border rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">
          Health Score Trend
        </h3>

        {isHistoryLoading ? (
          <div className="h-64 flex items-center justify-center">
            <span className="text-stellar-text-secondary">
              Loading health history...
            </span>
          </div>
        ) : history.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={history}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E2340" />
              <XAxis
                dataKey="timestamp"
                stroke="#8A8FA8"
                tick={{ fontSize: 12 }}
                tickFormatter={(val: string) =>
                  new Date(val).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })
                }
              />
              <YAxis
                stroke="#8A8FA8"
                tick={{ fontSize: 12 }}
                domain={[0, 100]}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#141829",
                  border: "1px solid #1E2340",
                  borderRadius: "8px",
                  color: "#FFFFFF",
                }}
                labelFormatter={(label: string) =>
                  new Date(label).toLocaleString()
                }
                formatter={(value: number) => [value, "Health Score"]}
              />
              <Line
                type="monotone"
                dataKey="score"
                stroke="#0057FF"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: "#0057FF" }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-64 flex items-center justify-center">
            <span className="text-stellar-text-secondary">
              No health history data available
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
