import SkeletonText from "./SkeletonText";

interface BridgeCardSkeletonProps {
  ariaLabel?: string;
}

export default function BridgeCardSkeleton({
  ariaLabel = "Loading bridge card",
}: BridgeCardSkeletonProps) {
  return (
    <article
      className="block bg-stellar-card border border-stellar-border rounded-lg p-6 transition-opacity duration-300"
      aria-label={ariaLabel}
      aria-busy="true"
      role="status"
    >
      <div className="flex items-center justify-between mb-4">
        <SkeletonText variant="title" width="60%" />
        <SkeletonText width="80px" height="24px" />
      </div>

      <div className="space-y-3">
        <div className="flex justify-between">
          <SkeletonText variant="small" width="40%" />
          <SkeletonText variant="small" width="30%" />
        </div>

        <div className="flex justify-between">
          <SkeletonText variant="small" width="35%" />
          <SkeletonText variant="small" width="25%" />
        </div>

        <div className="flex justify-between">
          <SkeletonText variant="small" width="45%" />
          <SkeletonText variant="small" width="35%" />
        </div>

        <div className="flex justify-between">
          <SkeletonText variant="small" width="50%" />
          <SkeletonText variant="small" width="30%" />
        </div>

        <div className="flex justify-between">
          <SkeletonText variant="small" width="40%" />
          <SkeletonText variant="small" width="20%" />
        </div>
      </div>
    </article>
  );
}
