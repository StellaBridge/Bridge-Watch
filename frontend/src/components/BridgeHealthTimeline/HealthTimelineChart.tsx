import { useState, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceDot,
  ResponsiveContainer,
} from "recharts";
import type { BridgeHealthPoint } from "../../services/api";
import type { HealthPeriod } from "../../hooks/useBridgeHealthTimeline";

export interface Props {
  points: BridgeHealthPoint[];
  period: HealthPeriod;
  bridgeName: string;
  isMockData: boolean;
}

export interface DailyUptimeBlock {
  date: string;
  uptimePercent: number;
  incidentCount: number;
  status: "healthy" | "degraded" | "down" | "empty";
}

export function formatXAxis(timestamp: string, period: HealthPeriod): string {
  const d = new Date(timestamp);
  if (period === "24h") {
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  if (period === "7d") {
    return d.toLocaleDateString("en-US", { weekday: "short" }) + " " +
      d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function scoreColor(score: number): string {
  if (score >= 80) return "#22c55e";
  if (score >= 50) return "#eab308";
  return "#ef4444";
}

export function calculate90DayUptimeBlocks(
  points: BridgeHealthPoint[],
  referenceDate?: Date
): DailyUptimeBlock[] {
  const blocks: DailyUptimeBlock[] = [];
  const pointsByDate = new Map<string, BridgeHealthPoint[]>();

  let latestPointTime = 0;
  for (const pt of points) {
    const time = new Date(pt.timestamp).getTime();
    if (!isNaN(time) && time > latestPointTime) {
      latestPointTime = time;
    }
    const dateStr = pt.timestamp.split("T")[0];
    if (!pointsByDate.has(dateStr)) {
      pointsByDate.set(dateStr, []);
    }
    pointsByDate.get(dateStr)!.push(pt);
  }

  // Anchor to the referenceDate if passed, or the latest point's date, or now
  const anchor =
    referenceDate ?? (latestPointTime > 0 ? new Date(latestPointTime) : new Date());

  // Generate 90 contiguous days up to anchor without gaps
  for (let i = 89; i >= 0; i--) {
    const d = new Date(anchor);
    d.setUTCDate(d.getUTCDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    const dayPoints = pointsByDate.get(dateStr);

    if (dayPoints && dayPoints.length > 0) {
      const avgScore =
        dayPoints.reduce((sum, p) => sum + p.score, 0) / dayPoints.length;
      const uptimePercent = Math.round(avgScore * 10) / 10;
      const incidentCount = dayPoints.filter(
        (p) => Boolean(p.annotation) || p.score < 80
      ).length;

      let status: "healthy" | "degraded" | "down" = "healthy";
      if (uptimePercent < 50) {
        status = "down";
      } else if (uptimePercent < 80) {
        status = "degraded";
      }

      blocks.push({
        date: dateStr,
        uptimePercent,
        incidentCount,
        status,
      });
    } else {
      // Empty day handling without rendering gaps
      blocks.push({
        date: dateStr,
        uptimePercent: 100,
        incidentCount: 0,
        status: "empty",
      });
    }
  }

  return blocks;
}

const CustomTooltip = ({
  active,
  payload,
  label,
  period,
}: {
  active?: boolean;
  payload?: Array<{ value: number; payload: BridgeHealthPoint }>;
  label?: string;
  period: HealthPeriod;
}) => {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  const score = payload[0]?.value ?? 0;
  return (
    <div className="bg-stellar-card border border-stellar-border rounded-lg p-3 text-xs shadow-xl min-w-[160px]">
      <p className="text-stellar-text-secondary mb-1">
        {label ? formatXAxis(label, period) : ""}
      </p>
      <p className="text-white font-semibold text-base" style={{ color: scoreColor(score) }}>
        {score}
        <span className="text-stellar-text-secondary font-normal ml-1">/ 100</span>
      </p>
      {point?.annotation && (
        <p className="mt-1 text-yellow-400 flex items-center gap-1">
          <span>&#9679;</span> {point.annotation}
        </p>
      )}
      <p className="mt-1 text-stellar-text-secondary">
        {score >= 80 ? "Healthy" : score >= 50 ? "Warning" : "Critical"}
      </p>
    </div>
  );
};

export default function HealthTimelineChart({ points, period, bridgeName, isMockData }: Props) {
  const [hoveredBlock, setHoveredBlock] = useState<DailyUptimeBlock | null>(null);

  const uptimeBlocks = useMemo(() => {
    return calculate90DayUptimeBlocks(points);
  }, [points]);

  const overallUptime = useMemo(() => {
    const scoredBlocks = uptimeBlocks.filter((b) => b.status !== "empty");
    if (scoredBlocks.length === 0) return "100.0";
    const sum = scoredBlocks.reduce((acc, b) => acc + b.uptimePercent, 0);
    return (sum / scoredBlocks.length).toFixed(1);
  }, [uptimeBlocks]);

  if (points.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-stellar-text-secondary text-sm">
        No health history available for {bridgeName}
      </div>
    );
  }

  const annotations = points.filter((p) => p.annotation);
  const tickInterval = Math.max(1, Math.floor(points.length / 6));

  return (
    <div className="relative space-y-4">
      {isMockData && (
        <div className="absolute top-0 right-0 z-10 text-xs text-stellar-text-muted bg-stellar-dark/80 rounded px-2 py-1">
          Demo data
        </div>
      )}

      {/* 90-day uptime blocks */}
      <div>
        <div className="flex items-center justify-between text-xs text-stellar-text-secondary mb-1.5">
          <span>90-Day Uptime History</span>
          <span className="font-mono text-white font-medium">{overallUptime}%</span>
        </div>
        <div
          role="region"
          aria-label="90-day uptime timeline"
          className="relative flex gap-0.5 sm:gap-1 items-center"
        >
          {uptimeBlocks.map((block) => {
            const colorClass =
              block.status === "healthy"
                ? "bg-emerald-500 hover:bg-emerald-400"
                : block.status === "degraded"
                ? "bg-amber-500 hover:bg-amber-400"
                : block.status === "down"
                ? "bg-red-500 hover:bg-red-400"
                : "bg-stellar-border hover:bg-stellar-text-secondary";

            return (
              <div
                key={block.date}
                data-testid="uptime-block"
                data-status={block.status}
                tabIndex={0}
                role="button"
                aria-label={`${block.date}: ${block.uptimePercent}% uptime, ${block.incidentCount} incident(s)`}
                onMouseEnter={() => setHoveredBlock(block)}
                onMouseLeave={() => setHoveredBlock(null)}
                onFocus={() => setHoveredBlock(block)}
                onBlur={() => setHoveredBlock(null)}
                className={`flex-1 h-5 sm:h-6 rounded-sm cursor-pointer transition-transform hover:scale-110 ${colorClass}`}
              />
            );
          })}

          {hoveredBlock && (
            <div
              role="tooltip"
              data-testid="uptime-tooltip"
              className="absolute -top-12 left-1/2 -translate-x-1/2 z-20 bg-stellar-card border border-stellar-border px-3 py-1.5 rounded text-xs text-white shadow-xl whitespace-nowrap pointer-events-none"
            >
              <div className="font-semibold">{hoveredBlock.date}</div>
              <div>
                {hoveredBlock.uptimePercent}% uptime &bull; {hoveredBlock.incidentCount} incident(s)
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Latency and Health Area Chart */}
      <div data-testid="chart-container" className="w-full">
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={points} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="healthGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0057FF" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#0057FF" stopOpacity={0.02} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />

            <XAxis
              dataKey="timestamp"
              tickFormatter={(v) => formatXAxis(v, period)}
              interval={tickInterval}
              tick={{ fill: "#8A8FA8", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tick={{ fill: "#8A8FA8", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={32}
            />

            <Tooltip content={<CustomTooltip period={period} />} />

            <ReferenceLine y={80} stroke="#22c55e" strokeDasharray="4 4" strokeOpacity={0.5} label={{ value: "Healthy", fill: "#22c55e", fontSize: 10, position: "insideTopRight" }} />
            <ReferenceLine y={50} stroke="#eab308" strokeDasharray="4 4" strokeOpacity={0.5} label={{ value: "Warning", fill: "#eab308", fontSize: 10, position: "insideTopRight" }} />

            <Area
              type="monotone"
              dataKey="score"
              stroke="#0057FF"
              strokeWidth={2}
              fill="url(#healthGradient)"
              dot={false}
              activeDot={{ r: 4, fill: "#0057FF", stroke: "#fff", strokeWidth: 1.5 }}
            />

            {annotations.map((point, i) => (
              <ReferenceDot
                key={i}
                x={point.timestamp}
                y={point.score}
                r={5}
                fill="#f59e0b"
                stroke="#0057FF"
                strokeWidth={1.5}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
