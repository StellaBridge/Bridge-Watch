import React from "react";
import SkeletonText from "./SkeletonText";
import SkeletonAvatar from "./SkeletonAvatar";

export interface SkeletonCardProps {
  width?: string | number;
  height?: string | number;
  variant?: "default" | "compact" | "bridge" | "dashboard";
  headerLines?: number;
  bodyLines?: number;
  className?: string;
}

export default function SkeletonCard({
  width = "100%",
  height,
  variant = "default",
  headerLines = 2,
  bodyLines = 3,
  className,
}: SkeletonCardProps) {
  const wrapperStyle: React.CSSProperties = {
    width: typeof width === "number" ? `${width}px` : width,
    ...(height ? { height: typeof height === "number" ? `${height}px` : height } : {}),
  };

  const variantGap = variant === "dashboard" ? "gap-3" : "gap-2";

  return (
    <article
      className={`bg-stellar-card border border-stellar-border rounded-lg p-4 ${variantGap} ${className ?? ""}`}
      style={wrapperStyle}
      role="status"
      aria-label="Loading card content"
    >
      <div className="flex items-center gap-3 mb-3">
        <SkeletonAvatar size={32} />
        <SkeletonText lines={headerLines} width={["55%", "80%"]} height={14} />
      </div>
      <SkeletonText lines={bodyLines} width={"100%"} height={12} />
      {variant !== "compact" && <SkeletonText lines={1} width="80%" height={12} />}
    </article>
  );
}
