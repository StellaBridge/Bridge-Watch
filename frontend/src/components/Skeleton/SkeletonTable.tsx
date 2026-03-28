import React from "react";

interface SkeletonTableProps {
  rows?: number;
  columns?: number;
  rowHeight?: number;
  className?: string;
  ariaLabel?: string;
}

export default function SkeletonTable({
  rows = 5,
  columns = 6,
  rowHeight = 24,
  className = "",
  ariaLabel = "Loading table",
}: SkeletonTableProps) {
  return (
    <div
      className={`bg-stellar-card border border-stellar-border rounded-lg p-4 overflow-hidden ${className}`}
      aria-label={ariaLabel}
      aria-busy="true"
      role="status"
    >
      <div className="mb-3 space-y-2">
        <div className="skeleton h-4 w-3/5 rounded" />
        <div className="skeleton h-3 w-2/5 rounded" />
      </div>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div
            key={rowIndex}
            className="flex gap-2"
            style={{ height: `${rowHeight}px` }}
          >
            {Array.from({ length: columns }).map((_, colIndex) => (
              <div
                key={colIndex}
                className="skeleton rounded"
                style={{ width: "100%", height: `${rowHeight - 5}px` }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
