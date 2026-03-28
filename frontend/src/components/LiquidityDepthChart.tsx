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
import { SkeletonChart } from "./Skeleton";

interface LiquidityDataPoint {
  dex: string;
  bidDepth: number;
  askDepth: number;
  totalLiquidity: number;
}

interface LiquidityDepthChartProps {
  symbol: string;
  data: LiquidityDataPoint[];
  isLoading: boolean;
}

export default function LiquidityDepthChart({
  symbol,
  data,
  isLoading,
}: LiquidityDepthChartProps) {
  const titleId = `liquidity-chart-title-${symbol}`;
  const descId = `liquidity-chart-desc-${symbol}`;

  if (isLoading) {
    return <SkeletonChart height={340} ariaLabel={`${symbol} liquidity chart loading`} />;
  }

  if (data.length === 0) {
    return (
      <div className="bg-stellar-card border border-stellar-border rounded-lg p-6">
        <h3 id={titleId} className="text-lg font-semibold text-white mb-4">
          {symbol} Liquidity Depth
        </h3>
        <div className="h-64 flex items-center justify-center" role="status" aria-live="polite">
          <span className="text-stellar-text-secondary">
            No liquidity data available
          </span>
        </div>
      </div>
    );
  }

  return (
    <figure
      className="bg-stellar-card border border-stellar-border rounded-lg p-6"
      aria-labelledby={titleId}
      aria-describedby={descId}
    >
      <figcaption>
        <h3 id={titleId} className="text-lg font-semibold text-white mb-1">
          {symbol} Liquidity Depth by DEX
        </h3>
        <p id={descId} className="sr-only">
          Bar chart showing bid and ask depth for {symbol} across decentralized exchanges.
        </p>
      </figcaption>
      <div role="img" aria-label={`${symbol} liquidity depth chart`} className="mt-3">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1E2340" />
          <XAxis dataKey="dex" stroke="#8A8FA8" tick={{ fontSize: 12 }} />
          <YAxis stroke="#8A8FA8" tick={{ fontSize: 12 }} />
          <Tooltip
            contentStyle={{
              backgroundColor: "#141829",
              border: "1px solid #1E2340",
              borderRadius: "8px",
              color: "#FFFFFF",
            }}
            formatter={(value: number) => [`$${value.toLocaleString()}`, ""]}
          />
          <Legend />
          <Bar dataKey="bidDepth" name="Bid Depth" fill="#00D4AA" radius={[4, 4, 0, 0]} />
          <Bar dataKey="askDepth" name="Ask Depth" fill="#0057FF" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
