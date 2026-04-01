import { desktopNavItems } from "../MobileNav/navigation";

/** Known route-to-label mapping built from the navigation config. */
const routeLabelMap: Record<string, string> = {};

for (const item of desktopNavItems) {
  routeLabelMap[item.to] = item.label;
}

// Add nested routes that aren't in the nav list
routeLabelMap["/admin"] = "Admin";
routeLabelMap["/assets"] = "Assets";

/**
 * Resolve a human-readable label for a route segment.
 *
 * Priority:
 *  1. Exact match in `routeLabelMap` (from navigation config)
 *  2. Title-case the last path segment (e.g. "api-keys" → "Api Keys")
 */
export function resolveLabel(path: string, segment: string): string {
  if (routeLabelMap[path]) return routeLabelMap[path];

  // Title-case: replace hyphens/underscores with spaces & capitalise each word
  return segment
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Truncate a label to `max` characters, appending "…" when truncated.
 */
export function truncateLabel(label: string, max: number): string {
  if (label.length <= max) return label;
  return label.slice(0, max - 1).trimEnd() + "…";
}
