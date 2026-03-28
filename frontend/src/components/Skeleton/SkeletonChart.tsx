interface SkeletonChartProps {
  width?: string | number;
  height?: string | number;
  className?: string;
  ariaLabel?: string;
}

export default function SkeletonChart({
  width = "100%",
  height = 280,
  className = "",
  ariaLabel = "Loading chart",
}: SkeletonChartProps) {
  const style = {
    width: typeof width === "number" ? `${width}px` : width,
    height: typeof height === "number" ? `${height}px` : height,
  };

  return (
    <div
      className={`skeleton bg-stellar-card border border-stellar-border rounded-lg p-4 transition-opacity duration-300 ${className}`}
      style={style}
      aria-label={ariaLabel}
      aria-busy="true"
      role="status"
    >
      <div className="skeleton h-5 w-1/3 rounded mb-4" />
      <div className="grid grid-cols-8 gap-2 h-full">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="skeleton rounded" style={{ height: `${20 + (i % 4) * 12}px` }} />
        ))}
      </div>
    </div>
  );
}
