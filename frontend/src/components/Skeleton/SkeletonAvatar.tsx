import React from "react";

interface SkeletonAvatarProps {
  size?: number | string;
  className?: string;
  ariaLabel?: string;
}

export default function SkeletonAvatar({
  size = 40,
  className = "",
  ariaLabel = "Loading avatar",
}: SkeletonAvatarProps) {
  const resolvedSize = typeof size === "number" ? `${size}px` : size;

  return (
    <div
      className={`skeleton rounded-full ${className}`}
      style={{ width: resolvedSize, height: resolvedSize }}
      aria-label={ariaLabel}
      role="status"
    />
  );
}
