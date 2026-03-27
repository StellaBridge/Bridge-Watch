export interface SkeletonTextProps {
  lines?: number;
  width?: string | number | Array<string | number>;
  height?: string | number;
  className?: string;
}

export default function SkeletonText({
  lines = 3,
  width = "100%",
  height = 16,
  className,
}: SkeletonTextProps) {
  const normalizeWidth = (index: number): string => {
    if (Array.isArray(width)) {
      const value = width[index] ?? width[width.length - 1];
      return typeof value === "number" ? `${value}px` : value;
    }
    return typeof width === "number" ? `${width}px` : width;
  };

  const normalizeHeight = (): string =>
    typeof height === "number" ? `${height}px` : height;

  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      {Array.from({ length: lines }).map((_, index) => (
        <div
          key={index}
          className="bg-stellar-border rounded-md animate-shimmer skeleton transition-opacity duration-300"
          style={{ width: normalizeWidth(index), height: normalizeHeight() }}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}
