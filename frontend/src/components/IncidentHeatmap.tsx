import { useState, useMemo } from "react";
import type { HeatmapBucket } from "../services/api";
import { useIncidentHeatmap } from "../hooks/useIncidentHeatmap";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#EF4444",
  high: "#F97316",
  medium: "#EAB308",
  low: "#22C55E",
};

const SEVERITY_BG: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-yellow-500",
  low: "bg-green-500",
};

function getCellColor(count: number): string {
  if (count === 0) return "bg-stellar-border";
  if (count <= 1) return "bg-green-900/60";
  if (count <= 3) return "bg-yellow-900/60";
  if (count <= 5) return "bg-orange-900/60";
  return "bg-red-900/60";
}

function getCellBorder(count: number): string {
  if (count === 0) return "border-stellar-border";
  if (count <= 1) return "border-green-800/40";
  if (count <= 3) return "border-yellow-800/40";
  if (count <= 5) return "border-orange-800/40";
  return "border-red-800/40";
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function IncidentHeatmap() {
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0]!;
  });
  const [endDate, setEndDate] = useState(() =>
    new Date().toISOString().split("T")[0]!
  );
  const [assetFilter, setAssetFilter] = useState<string>("");
  const [hoveredBucket, setHoveredBucket] = useState<HeatmapBucket | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const { data, isLoading } = useIncidentHeatmap({
    startDate,
    endDate,
    assetSymbol: assetFilter || undefined,
  });

  const gridData = useMemo(() => {
    if (!data?.buckets) return { dates: [], hours: [] as number[], cellMap: new Map<string, HeatmapBucket>() };

    const dates = [...new Set(data.buckets.map((b) => b.date))].sort();
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const cellMap = new Map<string, HeatmapBucket>();

    for (const bucket of data.buckets) {
      const key = `${bucket.date}T${bucket.hour}`;
      cellMap.set(key, bucket);
    }

    return { dates, hours, cellMap };
  }, [data]);

  const handleMouseEnter = (bucket: HeatmapBucket, e: React.MouseEvent) => {
    setHoveredBucket(bucket);
    setTooltipPos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    setTooltipPos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseLeave = () => {
    setHoveredBucket(null);
  };

  return (
    <div className="bg-stellar-card border border-stellar-border rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-white">Incident Heatmap</h2>
        {data && (
          <span className="text-sm text-stellar-text-secondary">
            {data.totalIncidents} incidents
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-4 mb-6">
        <div>
          <label
            htmlFor="heatmap-start"
            className="block text-xs text-stellar-text-secondary mb-1"
          >
            Start Date
          </label>
          <input
            id="heatmap-start"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="bg-stellar-dark border border-stellar-border rounded px-3 py-1.5 text-sm text-white"
          />
        </div>
        <div>
          <label
            htmlFor="heatmap-end"
            className="block text-xs text-stellar-text-secondary mb-1"
          >
            End Date
          </label>
          <input
            id="heatmap-end"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="bg-stellar-dark border border-stellar-border rounded px-3 py-1.5 text-sm text-white"
          />
        </div>
        {data && data.assets.length > 0 && (
          <div>
            <label
              htmlFor="heatmap-asset"
              className="block text-xs text-stellar-text-secondary mb-1"
            >
              Asset
            </label>
            <select
              id="heatmap-asset"
              value={assetFilter}
              onChange={(e) => setAssetFilter(e.target.value)}
              className="bg-stellar-dark border border-stellar-border rounded px-3 py-1.5 text-sm text-white"
            >
              <option value="">All Assets</option>
              {data.assets.map((asset) => (
                <option key={asset} value={asset}>
                  {asset}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="h-64 flex items-center justify-center">
          <span className="text-stellar-text-secondary">
            Loading heatmap data...
          </span>
        </div>
      ) : !data || data.buckets.length === 0 ? (
        <div className="h-64 flex items-center justify-center">
          <span className="text-stellar-text-secondary">
            No incident data available for the selected range
          </span>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[800px]">
            <div className="flex">
              <div className="w-16 shrink-0" />
              {gridData.dates.map((date) => (
                <div
                  key={date}
                  className="flex-1 text-center text-xs text-stellar-text-secondary"
                >
                  {formatDate(date)}
                </div>
              ))}
            </div>

            {gridData.hours.map((hour) => (
              <div key={hour} className="flex items-center">
                <div className="w-16 shrink-0 text-xs text-stellar-text-secondary text-right pr-2">
                  {String(hour).padStart(2, "0")}:00
                </div>
                {gridData.dates.map((date) => {
                  const key = `${date}T${hour}`;
                  const bucket = gridData.cellMap.get(key);
                  const count = bucket?.count ?? 0;

                  return (
                    <div
                      key={key}
                      className={`flex-1 h-6 border ${getCellBorder(count)} ${getCellColor(count)} m-px rounded-sm cursor-pointer transition-colors hover:opacity-80`}
                      onMouseEnter={(e) =>
                        bucket && handleMouseEnter(bucket, e)
                      }
                      onMouseMove={handleMouseMove}
                      onMouseLeave={handleMouseLeave}
                      role="gridcell"
                      aria-label={`${date} ${String(hour).padStart(2, "0")}:00 - ${count} incidents`}
                    />
                  );
                })}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-4 mt-4 text-xs text-stellar-text-secondary">
            <span>Less</span>
            <div className="flex gap-1">
              {[
                "bg-stellar-border",
                "bg-green-900/60",
                "bg-yellow-900/60",
                "bg-orange-900/60",
                "bg-red-900/60",
              ].map((cls, i) => (
                <div
                  key={i}
                  className={`w-4 h-4 rounded-sm border border-stellar-border ${cls}`}
                />
              ))}
            </div>
            <span>More</span>

            <div className="flex items-center gap-3 ml-6">
              {Object.entries(SEVERITY_COLORS).map(([severity, color]) => (
                <div key={severity} className="flex items-center gap-1">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span className="capitalize">{severity}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {hoveredBucket && (
        <div
          className="fixed z-50 bg-stellar-card border border-stellar-border rounded-lg p-3 shadow-lg pointer-events-none"
          style={{ left: tooltipPos.x + 12, top: tooltipPos.y + 12 }}
        >
          <p className="text-sm font-semibold text-white mb-1">
            {formatDate(hoveredBucket.date)} at{" "}
            {String(hoveredBucket.hour).padStart(2, "0")}:00
          </p>
          <p className="text-sm text-stellar-text-secondary mb-2">
            {hoveredBucket.count} incident{hoveredBucket.count !== 1 ? "s" : ""}
          </p>
          {Object.entries(hoveredBucket.bySeverity).length > 0 && (
            <div className="flex gap-2 mb-2">
              {Object.entries(hoveredBucket.bySeverity).map(([sev, cnt]) => (
                <div key={sev} className="flex items-center gap-1">
                  <div
                    className={`w-2 h-2 rounded-full ${SEVERITY_BG[sev]}`}
                  />
                  <span className="text-xs text-white">
                    {sev}: {cnt}
                  </span>
                </div>
              ))}
            </div>
          )}
          {hoveredBucket.incidents.slice(0, 3).map((inc) => (
            <p key={inc.id} className="text-xs text-stellar-text-secondary">
              {inc.title} ({inc.asset_symbol})
            </p>
          ))}
          {hoveredBucket.incidents.length > 3 && (
            <p className="text-xs text-stellar-text-secondary italic">
              +{hoveredBucket.incidents.length - 3} more
            </p>
          )}
        </div>
      )}
    </div>
  );
}
