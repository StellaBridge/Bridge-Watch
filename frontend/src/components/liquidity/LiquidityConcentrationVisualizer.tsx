import React, { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { LiquidityConcentrationData } from "../../types/liquidity";
import { SkeletonChart } from "../Skeleton";

interface Props {
  data: LiquidityConcentrationData | null;
  isLoading: boolean;
  pair: string;
}

interface TooltipPayloadEntry {
  value: number;
  name: string;
  color: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
}

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-stellar-dark border border-stellar-border rounded-lg p-3 text-xs shadow-lg">
      <p className="text-stellar-text-secondary mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {p.value.toLocaleString(undefined, { maximumFractionDigits: 4 })}
        </p>
      ))}
    </div>
  );
};

const GAP_THRESHOLD = 0.001;

const LiquidityConcentrationVisualizer = React.memo(function LiquidityConcentrationVisualizer({
  data,
  isLoading,
  pair,
}: Props) {
  const chartData = useMemo(() => {
    if (!data) return [];
    return data.buckets.map((b) => ({
      label: b.label,
      Bids: b.bidVolume,
      Asks: b.askVolume,
    }));
  }, [data]);

  if (isLoading) {
    return <SkeletonChart height={360} ariaLabel={`${pair} concentration chart loading`} />;
  }

  if (!data || chartData.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-stellar-text-secondary text-sm">
        No concentration data available for {pair}
      </div>
    );
  }

  const gapCount = data.gaps.filter((g) => g.severity >= GAP_THRESHOLD).length;

  return (
    <div>
      {/* Summary row */}
      <div className="flex flex-wrap gap-4 mb-4 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-stellar-text-secondary">Spread:</span>
          <span className="text-white font-medium">
            {data.spreadPct.toFixed(4)}%
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-stellar-text-secondary">Bid depth:</span>
          <span className="text-emerald-400 font-medium">
            {data.bidTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-stellar-text-secondary">Ask depth:</span>
          <span className="text-red-400 font-medium">
            {data.askTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </span>
        </div>
        {gapCount > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-amber-400 font-medium">
              {gapCount} low-liquidity zone{gapCount !== 1 ? "s" : ""} detected
            </span>
          </div>
        )}
      </div>

      {/* Concentration bar chart */}
      <ResponsiveContainer width="100%" height={360}>
        <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1E2340" />
          <XAxis
            dataKey="label"
            stroke="#8A8FA8"
            tick={{ fontSize: 10 }}
          />
          <YAxis
            stroke="#8A8FA8"
            tick={{ fontSize: 10 }}
            tickFormatter={(v: number) =>
              v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)
            }
            width={48}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: 11, color: "#8A8FA8" }}
          />
          <Bar
            dataKey="Bids"
            fill="#00D4AA"
            radius={[2, 2, 0, 0]}
            maxBarSize={48}
          />
          <Bar
            dataKey="Asks"
            fill="#FF4D4D"
            radius={[2, 2, 0, 0]}
            maxBarSize={48}
          />
        </BarChart>
      </ResponsiveContainer>

      {/* Low-liquidity gaps table */}
      {data.gaps.filter((g) => g.severity >= GAP_THRESHOLD).length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-white mb-2">
            Low-Liquidity Zones
          </h3>
          <table className="w-full text-xs" aria-label="Detected liquidity gaps">
            <thead>
              <tr className="text-stellar-text-secondary border-b border-stellar-border">
                <th className="text-left pb-2">Price Range</th>
                <th className="text-right pb-2">Depth</th>
                <th className="text-right pb-2">Severity</th>
              </tr>
            </thead>
            <tbody>
              {data.gaps
                .filter((g) => g.severity >= GAP_THRESHOLD)
                .map((gap, i) => (
                  <tr key={i} className="border-b border-stellar-border/50">
                    <td className="py-2 text-white">
                      {gap.startPrice.toFixed(7)} – {gap.endPrice.toFixed(7)}
                    </td>
                    <td className="py-2 text-right text-stellar-text-secondary">
                      {gap.depth.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                    </td>
                    <td className="py-2 text-right">
                      <span
                        className={
                          gap.severity > 0.7
                            ? "text-red-400 font-medium"
                            : gap.severity > 0.3
                              ? "text-amber-400"
                              : "text-stellar-text-secondary"
                        }
                      >
                        {(gap.severity * 100).toFixed(0)}%
                      </span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
});

export default LiquidityConcentrationVisualizer;
