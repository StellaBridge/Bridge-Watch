import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import ChartTooltip from "./Tooltip/ChartTooltip.js";
import { useEffect, useMemo, useState } from "react";
import { useTimeRange } from "../hooks/useTimeRange";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";
import { filterSeriesByTimeRange } from "../utils/timeRange";
import {
  generateDynamicColor,
  getColorblindModePreference,
  getVisualizationTheme,
} from "../styles/colors";
import type { ChartAnnotation } from "../hooks/useChartAnnotations";
import HelpIcon from "./help/HelpIcon";
import ChartLegendControls, {
  type LegendSortMode,
  type LegendSeries,
} from "./ChartLegendControls";

interface PriceDataPoint {
  timestamp: string;
  price: number;
  source: string;
}

interface PriceChartProps {
  symbol: string;
  data: PriceDataPoint[];
  isLoading: boolean;
  chartId: string;
  annotations?: ChartAnnotation[];
  thresholdValue?: number;
}

export default function PriceChart({
  symbol,
  data,
  isLoading,
  chartId,
  annotations = [],
  thresholdValue,
}: PriceChartProps) {
  const { getEffectiveSelection } = useTimeRange();
  const selection = getEffectiveSelection(chartId);
  const prefersReducedMotion = usePrefersReducedMotion();
  const theme = getVisualizationTheme({
    theme: "dark",
    colorblindMode: getColorblindModePreference(),
  });

  const filteredData = useMemo(
    () => filterSeriesByTimeRange(data, (item) => item.timestamp, selection),
    [data, selection],
  );

  const chartData = useMemo(() => {
    const grouped = new Map<
      string,
      { timestamp: string } & Record<string, number | string>
    >();

    filteredData.forEach((entry) => {
      const key = entry.timestamp;
      const base = grouped.get(key) ?? { timestamp: key };

      grouped.set(key, {
        ...base,
        [entry.source]: entry.price,
      });
    });

    return Array.from(grouped.values()).sort(
      (a, b) =>
        new Date(String(a.timestamp)).getTime() -
        new Date(String(b.timestamp)).getTime(),
    );
  }, [filteredData]);

  const sources = useMemo(
    () => [...new Set(filteredData.map((entry) => entry.source))],
    [filteredData],
  );
  const [visibleSources, setVisibleSources] = useState<string[]>([]);
  const [legendSortMode, setLegendSortMode] = useState<LegendSortMode>("name");

  const annotationMarks = useMemo(
    () =>
      annotations.filter((annotation) =>
        filteredData.some((entry) => entry.timestamp === annotation.timestamp),
      ),
    [annotations, filteredData],
  );

  const sourceColors = useMemo(
    () =>
      sources.reduce<Record<string, string>>((acc, source, index) => {
        acc[source] =
          theme.categorical[index] ??
          generateDynamicColor(source.toLowerCase());
        return acc;
      }, {}),
    [sources, theme.categorical],
  );

  useEffect(() => {
    setVisibleSources((current) => {
      if (current.length === 0) return sources;
      const next = current.filter((source) => sources.includes(source));
      const missing = sources.filter((source) => !next.includes(source));
      return [...next, ...missing];
    });
  }, [sources]);

  const legendSeries = useMemo<LegendSeries[]>(
    () =>
      sources.map((source) => {
        const latestPoint = [...filteredData]
          .reverse()
          .find(
            (entry) =>
              entry.source === source && typeof entry.price === "number",
          );

        return {
          id: source,
          label: source,
          color: sourceColors[source],
          latestValue: latestPoint?.price,
        };
      }),
    [filteredData, sourceColors, sources],
  );

  const toggleSource = (source: string) => {
    setVisibleSources((current) => {
      if (current.includes(source)) {
        return current.length === 1
          ? current
          : current.filter((item) => item !== source);
      }
      return [...current, source];
    });
  };

  if (isLoading) {
    return (
      <div className="bg-stellar-card border border-stellar-border rounded-lg p-6">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-white mb-4">
          {symbol} Price History
          <HelpIcon
            content="Aggregated price feeds from multiple oracle sources. Each line represents a distinct data provider. Divergence between lines may indicate a price anomaly."
            placement="auto"
          />
        </h3>
        <div className="h-64 flex items-center justify-center">
          <span className="text-stellar-text-secondary">
            Loading chart data...
          </span>
        </div>
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="bg-stellar-card border border-stellar-border rounded-lg p-6">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-white mb-4">
          {symbol} Price History
          <HelpIcon
            content="Aggregated price feeds from multiple oracle sources. Each line represents a distinct data provider. Divergence between lines may indicate a price anomaly."
            placement="auto"
          />
        </h3>
        <div className="h-64 flex items-center justify-center">
          <span className="text-stellar-text-secondary">
            No price data available in selected range
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-stellar-card border border-stellar-border rounded-lg p-6">
      <h3 className="flex items-center gap-2 text-lg font-semibold text-white mb-4">
        {symbol} Price History
        <HelpIcon
          content="Aggregated price feeds from multiple oracle sources. Each line represents a distinct data provider. Divergence between lines may indicate a price anomaly."
          placement="auto"
        />
      </h3>
      <div className="mb-4">
        <ChartLegendControls
          series={legendSeries}
          visibleSeries={visibleSources}
          sortMode={legendSortMode}
          compact={sources.length > 5}
          valueFormatter={(value) => `$${value.toFixed(4)}`}
          onToggleSeries={toggleSource}
          onSortModeChange={setLegendSortMode}
        />
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData} isAnimationActive={!prefersReducedMotion}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} />
          <XAxis
            dataKey="timestamp"
            stroke={theme.axis}
            tick={{ fontSize: 12 }}
          />
          <YAxis
            stroke={theme.axis}
            tick={{ fontSize: 12 }}
            domain={["auto", "auto"]}
          />
          <Tooltip
            content={
              <ChartTooltip
                labelFormatter={(lbl) => new Date(lbl).toLocaleString()}
                formatter={(value) =>
                  typeof value === "number"
                    ? `$${value.toFixed(4)}`
                    : String(value)
                }
                showCopy
              />
            }
          />
          {sources
            .filter((source) => visibleSources.includes(source))
            .map((source) => (
              <Line
                key={source}
                type="monotone"
                dataKey={source}
                name={source}
                stroke={sourceColors[source]}
                dot={false}
                strokeWidth={2}
                isAnimationActive={!prefersReducedMotion}
              />
            ))}
          {annotationMarks.map((annotation) => (
            <ReferenceLine
              key={annotation.id}
              x={annotation.timestamp}
              stroke={annotation.color}
              strokeDasharray="4 4"
              ifOverflow="extendDomain"
              label={{
                value: annotation.label,
                fill: annotation.color,
                fontSize: 11,
                position: "top",
              }}
            />
          ))}
          {thresholdValue !== undefined && (
            <ReferenceLine
              y={thresholdValue}
              stroke="#f59e0b"
              strokeDasharray="5 5"
              strokeWidth={2}
              label={{
                value: `Threshold: ${thresholdValue.toFixed(4)}`,
                fill: "#f59e0b",
                fontSize: 11,
                position: "right",
              }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
