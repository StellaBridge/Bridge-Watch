import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { PriceTimeframe } from "../types";

interface PriceDataPoint {
  timestamp: string;
  price: number;
  source: string;
}

interface PriceChartProps {
  symbol: string;
  data: PriceDataPoint[];
  isLoading: boolean;
}

interface EnhancedPriceChartProps extends PriceChartProps {
  timeframe: PriceTimeframe;
  onTimeframeChange: (tf: PriceTimeframe) => void;
}

const SOURCE_COLORS: Record<string, string> = {
  sdex: "#0057FF",
  circle: "#00D4AA",
  coinbase: "#0052FF",
  amm: "#FF6B35",
};

const TIMEFRAMES: PriceTimeframe[] = ["1H", "24H", "7D", "30D"];

function getTimeframeTickFormatter(timeframe: PriceTimeframe) {
  return (val: string) => {
    const date = new Date(val);
    switch (timeframe) {
      case "1H":
        return date.toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
        });
      case "24H":
        return date.toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
        });
      case "7D":
        return date.toLocaleDateString(undefined, {
          weekday: "short",
        });
      case "30D":
        return date.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        });
    }
  };
}

export default function PriceChart({ symbol, data, isLoading }: PriceChartProps) {
  const titleId = `price-chart-title-${symbol}`;
  const descId = `price-chart-desc-${symbol}`;

  if (isLoading) {
    return (
      <div className="bg-stellar-card border border-stellar-border rounded-lg p-6">
        <h3 id={titleId} className="text-lg font-semibold text-white mb-4">
          {symbol} Price History
        </h3>
        <div className="h-64 flex items-center justify-center" role="status" aria-live="polite">
          <span className="text-stellar-text-secondary">Loading chart data…</span>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-stellar-card border border-stellar-border rounded-lg p-6">
        <h3 id={titleId} className="text-lg font-semibold text-white mb-4">
          {symbol} Price History
        </h3>
        <div className="h-64 flex items-center justify-center" role="status" aria-live="polite">
          <span className="text-stellar-text-secondary">No price data available</span>
        </div>
      </div>
    );
  }

  // Group data by source for multi-line rendering
  const sources = [...new Set(data.map((d) => d.source))];

  return (
    <figure
      className="bg-stellar-card border border-stellar-border rounded-lg p-6"
      aria-labelledby={titleId}
      aria-describedby={descId}
    >
      <figcaption>
        <h3 id={titleId} className="text-lg font-semibold text-white mb-1">
          {symbol} Price History
        </h3>
        <p id={descId} className="sr-only">
          Line chart showing price history for {symbol} across sources.
        </p>
      </figcaption>
      <div role="img" aria-label={`${symbol} price history chart`} className="mt-3">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1E2340" />
          <XAxis dataKey="timestamp" stroke="#8A8FA8" tick={{ fontSize: 12 }} />
          <YAxis stroke="#8A8FA8" tick={{ fontSize: 12 }} domain={["auto", "auto"]} />
          <Tooltip
            contentStyle={{
              backgroundColor: "#141829",
              border: "1px solid #1E2340",
              borderRadius: "8px",
              color: "#FFFFFF",
            }}
          />
          <Legend />
          {sources.map((source) => (
            <Line
              key={source}
              type="monotone"
              dataKey="price"
              name={source}
              stroke={SOURCE_COLORS[source] || "#8A8FA8"}
              dot={false}
              strokeWidth={2}
            />
          ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

export function EnhancedPriceChart({
  symbol,
  data,
  isLoading,
  timeframe,
  onTimeframeChange,
}: EnhancedPriceChartProps) {
  const sources = data.length > 0 ? [...new Set(data.map((d) => d.source))] : [];

  return (
    <div className="bg-stellar-card border border-stellar-border rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">
          {symbol} Price History
        </h3>
        <div className="flex items-center gap-1 bg-stellar-dark rounded-lg p-1">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => onTimeframeChange(tf)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                tf === timeframe
                  ? "bg-stellar-blue text-white"
                  : "text-stellar-text-secondary hover:text-white"
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="h-72 flex items-center justify-center">
          <span className="text-stellar-text-secondary">
            Loading chart data...
          </span>
        </div>
      ) : data.length === 0 ? (
        <div className="h-72 flex items-center justify-center">
          <span className="text-stellar-text-secondary">
            No price data available for {timeframe}
          </span>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1E2340" />
            <XAxis
              dataKey="timestamp"
              stroke="#8A8FA8"
              tick={{ fontSize: 12 }}
              tickFormatter={getTimeframeTickFormatter(timeframe)}
            />
            <YAxis
              stroke="#8A8FA8"
              tick={{ fontSize: 12 }}
              domain={["auto", "auto"]}
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
            />
            <Legend />
            {sources.map((source) => (
              <Line
                key={source}
                type="monotone"
                dataKey="price"
                name={source}
                stroke={SOURCE_COLORS[source] || "#8A8FA8"}
                dot={false}
                strokeWidth={2}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
