import SkeletonText from "./SkeletonText";
import SkeletonAvatar from "./SkeletonAvatar";

interface SkeletonCardProps {
  width?: string | number;
  height?: string | number;
  rows?: number;
  showHeader?: boolean;
  className?: string;
  ariaLabel?: string;
}

export default function SkeletonCard({
  width = "100%",
  height,
  rows = 4,
  showHeader = true,
  className = "",
  ariaLabel = "Loading content",
}: SkeletonCardProps) {
  const style = {
    width: typeof width === "number" ? `${width}px` : width,
    minHeight: height ? (typeof height === "number" ? `${height}px` : height) : undefined,
  };

  return (
    <article
      className={`bg-stellar-card border border-stellar-border rounded-lg p-4 shadow-sm ${className} transition-opacity duration-300`} 
      style={style}
      aria-label={ariaLabel}
      aria-busy="true"
      role="status"
    >
      {showHeader && (
        <div className="mb-4 flex items-center gap-3">
          <SkeletonAvatar size={32} />
          <div className="flex-1 space-y-2">
            <SkeletonText variant="subtitle" />
            <SkeletonText variant="small" width="50%" />
          </div>
        </div>
      )}
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonText key={i} />
        ))}
      </div>
    </article>
  );
}
