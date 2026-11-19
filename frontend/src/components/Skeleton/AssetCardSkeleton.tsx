import SkeletonText from "./SkeletonText";
import SkeletonAvatar from "./SkeletonAvatar";

interface AssetCardSkeletonProps {
  ariaLabel?: string;
}

export default function AssetCardSkeleton({
  ariaLabel = "Loading asset card",
}: AssetCardSkeletonProps) {
  return (
    <article
      className="bg-stellar-card border border-stellar-border rounded-lg p-6 transition-opacity duration-300"
      aria-label={ariaLabel}
      aria-busy="true"
      role="status"
    >
      <div className="flex items-start gap-4 mb-4">
        <SkeletonAvatar size={48} />
        <div className="flex-1 space-y-2">
          <SkeletonText variant="subtitle" width="70%" />
          <SkeletonText variant="small" width="50%" />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex justify-between">
          <SkeletonText variant="small" width="45%" />
          <SkeletonText variant="small" width="30%" />
        </div>

        <div className="flex justify-between">
          <SkeletonText variant="small" width="40%" />
          <SkeletonText variant="small" width="35%" />
        </div>

        <div className="flex justify-between">
          <SkeletonText variant="small" width="50%" />
          <SkeletonText variant="small" width="25%" />
        </div>

        <div className="flex justify-between">
          <SkeletonText variant="small" width="35%" />
          <SkeletonText variant="small" width="40%" />
        </div>
      </div>
    </article>
  );
}
