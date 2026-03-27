export interface SkeletonAvatarProps {
  size?: number;
  className?: string;
}

export default function SkeletonAvatar({
  size = 40,
  className,
}: SkeletonAvatarProps) {
  const sizeStr = `${size}px`;

  return (
    <div
      className={`rounded-full bg-stellar-border animate-shimmer skeleton transition-opacity duration-300 ${className ?? ""}`}
      style={{ width: sizeStr, height: sizeStr }}
      aria-hidden="true"
    />
  );
}
