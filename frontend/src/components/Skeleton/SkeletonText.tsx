import React from "react";

type SkeletonTextVariant = "title" | "subtitle" | "text" | "small";

interface SkeletonTextProps {
  width?: string | number;
  height?: string | number;
  variant?: SkeletonTextVariant;
  className?: string;
  ariaLabel?: string;
}

const variantDefaults: Record<SkeletonTextVariant, { width: string; height: string }> = {
  title: { width: "40%", height: "1.375rem" },
  subtitle: { width: "60%", height: "1rem" },
  text: { width: "100%", height: "0.875rem" },
  small: { width: "80%", height: "0.75rem" },
};

export default function SkeletonText({
  width,
  height,
  variant = "text",
  className = "",
  ariaLabel = "Loading text",
}: SkeletonTextProps) {
  const defaults = variantDefaults[variant];

  const style: React.CSSProperties = {
    width: width != null ? (typeof width === "number" ? `${width}px` : width) : defaults.width,
    height: height != null ? (typeof height === "number" ? `${height}px` : height) : defaults.height,
  };

  return (
    <span
      className={`skeleton inline-block rounded ${className}`}
      style={style}
      aria-label={ariaLabel}
      role="status"
    />
  );
}
