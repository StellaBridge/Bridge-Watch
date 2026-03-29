import { ReactNode } from "react";

export interface BreadcrumbItemConfig {
  /** Display label */
  label: string;
  /** Route path — omit for current (last) item */
  href?: string;
  /** Optional icon rendered before the label */
  icon?: ReactNode;
}

export interface BreadcrumbProps {
  /** Manual override items — when provided, auto-generation is skipped */
  items?: BreadcrumbItemConfig[];
  /** Max characters before a segment label is truncated (default: 24) */
  maxLabelLength?: number;
  /** Hide the leading Home link (default: false) */
  hideHome?: boolean;
  /** Additional CSS class on the nav wrapper */
  className?: string;
}
