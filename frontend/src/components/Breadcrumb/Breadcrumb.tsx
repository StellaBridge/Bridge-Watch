import { Fragment, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { BreadcrumbItem } from "./BreadcrumbItem";
import { resolveLabel } from "./routeUtils";
import type { BreadcrumbItemConfig, BreadcrumbProps } from "./types";

const HomeIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 20 20"
    fill="currentColor"
    className="w-4 h-4"
    aria-hidden="true"
  >
    <path
      fillRule="evenodd"
      d="M9.293 2.293a1 1 0 0 1 1.414 0l7 7A1 1 0 0 1 17 11h-1v6a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6H3a1 1 0 0 1-.707-1.707l7-7Z"
      clipRule="evenodd"
    />
  </svg>
);

const ChevronSeparator = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 20 20"
    fill="currentColor"
    className="w-4 h-4 text-stellar-text-secondary/50 flex-shrink-0"
    aria-hidden="true"
  >
    <path
      fillRule="evenodd"
      d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z"
      clipRule="evenodd"
    />
  </svg>
);

/**
 * Build breadcrumb items automatically from the current URL path.
 *
 * `/admin/api-keys` → [ { label: "Admin", href: "/admin" }, { label: "API Keys" } ]
 */
function buildItemsFromPath(pathname: string): BreadcrumbItemConfig[] {
  const segments = pathname.split("/").filter(Boolean);
  const items: BreadcrumbItemConfig[] = [];

  segments.forEach((segment, idx) => {
    const path = "/" + segments.slice(0, idx + 1).join("/");
    const isLast = idx === segments.length - 1;

    items.push({
      label: resolveLabel(path, segment),
      href: isLast ? undefined : path,
    });
  });

  return items;
}

/**
 * Generate JSON-LD structured data for SEO breadcrumbs.
 * @see https://schema.org/BreadcrumbList
 */
function buildStructuredData(
  items: BreadcrumbItemConfig[],
  includeHome: boolean,
) {
  const list: Array<{
    "@type": string;
    position: number;
    name: string;
    item?: string;
  }> = [];

  let position = 1;

  if (includeHome) {
    list.push({
      "@type": "ListItem",
      position: position++,
      name: "Home",
      item: window.location.origin + "/dashboard",
    });
  }

  for (const crumb of items) {
    const entry: (typeof list)[number] = {
      "@type": "ListItem",
      position: position++,
      name: crumb.label,
    };
    if (crumb.href) {
      entry.item = window.location.origin + crumb.href;
    }
    list.push(entry);
  }

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: list,
  };
}

export function Breadcrumb({
  items: manualItems,
  maxLabelLength = 24,
  hideHome = false,
  className = "",
}: BreadcrumbProps) {
  const { pathname } = useLocation();

  const items = useMemo(
    () => manualItems ?? buildItemsFromPath(pathname),
    [manualItems, pathname],
  );

  // Don't render breadcrumbs on the root dashboard (single segment)
  if (items.length === 0) return null;

  const showHome = !hideHome;
  const structuredData = buildStructuredData(items, showHome);

  return (
    <>
      {/* SEO Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <nav
        aria-label="Breadcrumb"
        className={`mb-4 ${className}`}
      >
        <ol className="flex flex-wrap items-center gap-1 text-sm min-w-0">
          {/* Home link */}
          {showHome && (
            <>
              <BreadcrumbItem
                item={{
                  label: "Home",
                  href: "/dashboard",
                  icon: <HomeIcon />,
                }}
                isLast={items.length === 0}
                maxLabelLength={maxLabelLength}
              />
              {items.length > 0 && (
                <li role="presentation" aria-hidden="true">
                  <ChevronSeparator />
                </li>
              )}
            </>
          )}

          {/* Route items */}
          {items.map((item, idx) => {
            const isLast = idx === items.length - 1;
            return (
              <Fragment key={item.href ?? item.label}>
                <BreadcrumbItem
                  item={item}
                  isLast={isLast}
                  maxLabelLength={maxLabelLength}
                />
                {!isLast && (
                  <li role="presentation" aria-hidden="true">
                    <ChevronSeparator />
                  </li>
                )}
              </Fragment>
            );
          })}
        </ol>
      </nav>
    </>
  );
}
