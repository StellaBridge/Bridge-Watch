import SkeletonText from "./SkeletonText";

export interface SkeletonChartProps {
  title?: string;
  width?: string | number;
  height?: string | number;
  className?: string;
}

export default function SkeletonChart({
  title,
  width = "100%",
  height = 220,
  className,
}: SkeletonChartProps) {
  const getSize = (value: string | number) =>
    typeof value === "number" ? `${value}px` : value;

  const chartHeight = typeof height === "number" ? Math.max(80, height - 40) : "180px";

  return (
    <section
      className={`bg-stellar-card border border-stellar-border rounded-lg p-4 ${className ?? ""}`}
      style={{ width: getSize(width), minHeight: getSize(height) }}
      aria-label={title ? `Loading ${title}` : "Loading chart"}
    >
      {title && <SkeletonText lines={1} width="40%" height={16} className="mb-3" />}
      <div
        className="rounded-lg bg-stellar-border animate-shimmer skeleton w-full"
        style={{ height: getSize(chartHeight) }}
        aria-hidden="true"
      />
    </section>
  );
}
