import { useState } from "react";
import StatCard from "./StatCard";
import { computeStats } from "./statsUtils";
import type { QuickStatsProps } from "./types";

export default function QuickStatsWidget({ assets, bridges, isLoading }: QuickStatsProps) {
  const [expanded, setExpanded] = useState(false);
  const stats = computeStats(assets, bridges);

  // Show first 4 stats collapsed, all when expanded
  const visibleStats = expanded ? stats : stats.slice(0, 4);

  if (isLoading) {
    return (
      <section aria-labelledby="quick-stats-heading" data-testid="quick-stats-widget">
        <div className="flex items-center justify-between mb-4">
          <h2 id="quick-stats-heading" className="text-xl font-semibold text-stellar-text-primary">
            Quick Stats
          </h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="bg-stellar-card border border-stellar-border rounded-lg p-4 animate-pulse"
              aria-label={`Loading stat ${i}`}
            >
              <div className="h-4 w-20 bg-stellar-border rounded mb-3" />
              <div className="h-7 w-16 bg-stellar-border rounded mb-2" />
              <div className="h-3 w-14 bg-stellar-border rounded" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="quick-stats-heading" data-testid="quick-stats-widget">
      <div className="flex items-center justify-between mb-4">
        <h2 id="quick-stats-heading" className="text-xl font-semibold text-stellar-text-primary">
          Quick Stats
        </h2>
        {stats.length > 4 && (
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="text-sm text-stellar-blue hover:underline focus:outline-none focus:ring-2 focus:ring-stellar-blue rounded-md px-2 py-1"
            aria-expanded={expanded}
            aria-controls="quick-stats-grid"
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        )}
      </div>
      <div
        id="quick-stats-grid"
        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4"
        role="list"
      >
        {visibleStats.map((stat) => (
          <div key={stat.id} role="listitem">
            <StatCard stat={stat} />
          </div>
        ))}
      </div>
    </section>
  );
}
