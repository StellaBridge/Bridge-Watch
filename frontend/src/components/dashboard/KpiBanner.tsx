export type KpiTrendDirection = "up" | "down" | "neutral";

export interface KpiBannerItem {
  id: string;
  label: string;
  value: string | number;
  delta: string;
  trend: KpiTrendDirection;
  description: string;
}

interface KpiBannerProps {
  items: KpiBannerItem[];
  loading?: boolean;
  layout?: "compact" | "expanded";
  onDrilldown: (item: KpiBannerItem) => void;
  onInspectMetric?: (item: KpiBannerItem) => void;
}

const trendClasses: Record<KpiTrendDirection, string> = {
  up: "border-green-400/30 bg-green-500/10 text-green-800 dark:text-green-300",
  down: "border-red-400/30 bg-red-500/10 text-red-800 dark:text-red-300",
  neutral: "border-stellar-border bg-stellar-dark/50 text-stellar-text-secondary",
};

const trendGlyph: Record<KpiTrendDirection, string> = {
  up: "+",
  down: "-",
  neutral: "->",
};

function KpiSkeleton({ expanded }: { expanded: boolean }) {
  return (
    <div className="rounded-lg border border-stellar-border bg-stellar-card p-4">
      <div className="animate-pulse space-y-3">
        <div className="h-3 w-24 rounded bg-stellar-border" />
        <div className="h-7 w-32 rounded bg-stellar-border" />
        <div className="h-5 w-20 rounded bg-stellar-border" />
        {expanded ? <div className="h-3 w-full rounded bg-stellar-border" /> : null}
      </div>
    </div>
  );
}

export default function KpiBanner({
  items,
  loading = false,
  layout = "compact",
  onDrilldown,
  onInspectMetric,
}: KpiBannerProps) {
  const expanded = layout === "expanded";

  return (
    <section aria-labelledby="dashboard-kpis" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="dashboard-kpis" className="text-lg font-semibold text-white">
            Key metrics
          </h2>
          <p className="text-sm text-stellar-text-secondary">
            Live dashboard KPIs with drilldowns for fast triage.
          </p>
        </div>
        <span className="rounded-full border border-stellar-border px-3 py-1 text-xs text-stellar-text-secondary">
          {expanded ? "Expanded" : "Compact"}
        </span>
      </div>

      <div
        className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${
          expanded ? "xl:grid-cols-4" : "lg:grid-cols-4"
        }`}
      >
        {loading
          ? Array.from({ length: 4 }, (_, index) => (
              <KpiSkeleton key={index} expanded={expanded} />
            ))
          : items.map((item) => (
              <article
                key={item.id}
                className="group min-h-32 rounded-lg border border-stellar-border bg-stellar-card p-4 transition-colors hover:border-stellar-blue"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="text-xs font-medium uppercase text-stellar-text-secondary">
                    {item.label}
                  </span>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${trendClasses[item.trend]}`}
                    >
                      <span aria-hidden="true">{trendGlyph[item.trend]}</span>
                      {item.delta}
                    </span>
                    {onInspectMetric ? (
                      <button
                        type="button"
                        onClick={() => onInspectMetric(item)}
                        className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md text-stellar-text-secondary hover:bg-stellar-dark hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue"
                        aria-label={`Explain ${item.label}`}
                        title={`Explain ${item.label}`}
                      >
                        i
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="mt-3 text-2xl font-bold text-white">{item.value}</div>
                {expanded ? (
                  <p className="mt-3 text-sm text-stellar-text-secondary">{item.description}</p>
                ) : null}
                <button
                  type="button"
                  onClick={() => onDrilldown(item)}
                  className="mt-3 inline-flex min-h-10 items-center rounded-md text-xs font-medium text-stellar-blue group-hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue"
                  aria-label={`Open ${item.label} drilldown`}
                >
                  Inspect
                </button>
              </article>
            ))}
      </div>
    </section>
  );
}
