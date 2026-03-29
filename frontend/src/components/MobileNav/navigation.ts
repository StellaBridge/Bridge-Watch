export interface NavItem {
  to: string;
  label: string;
  description: string;
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  {
    id: "monitoring",
    label: "Monitoring",
    items: [
      { to: "/dashboard", label: "Dashboard", description: "Real-time asset health overview" },
      { to: "/bridges", label: "Bridges", description: "Bridge performance and incidents" },
      { to: "/transactions", label: "Transactions", description: "Recent bridge transfer activity" },
      { to: "/analytics", label: "Analytics", description: "Trend analysis and health scoring" },
      { to: "/watchlist", label: "Watchlist", description: "Tracked assets and alerts" },
      { to: "/reports", label: "Reports", description: "Operational reporting views" },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    items: [
      { to: "/admin/api-keys", label: "API Keys", description: "Manage integrator credentials" },
      { to: "/settings", label: "Settings", description: "Notification and dashboard preferences" },
    ],
  },
];

export const desktopNavItems = navGroups.flatMap((group) => group.items);

export function isNavItemActive(pathname: string, to: string): boolean {
  return pathname === to || pathname.startsWith(`${to}/`);
}
