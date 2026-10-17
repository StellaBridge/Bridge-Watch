import { useState, useCallback, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Navbar from "./Navbar";
import { Breadcrumb } from "./Breadcrumb";
import { ComponentErrorBoundary } from "./ErrorBoundary";
import ShortcutHelp from "./ShortcutHelp";
import CommandPalette from "./CommandPalette";
import MaintenanceBanner from "./MaintenanceBanner";
import OfflineIndicator from "./OfflineIndicator";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { MetricsSidebar } from "./MetricsSidebar";
import { useMetricsSidebarStore } from "../stores/metricsSidebarStore";

export default function Layout() {
  const { pathname } = useLocation();
  const showBreadcrumbs = pathname !== "/dashboard";

  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const openHelp = useCallback(() => setShortcutHelpOpen(true), []);
  const closeHelp = useCallback(() => setShortcutHelpOpen(false), []);

  // Listen for open-shortcuts event dispatched by Navbar "?" button
  useEffect(() => {
    window.addEventListener("bridgewatch:open-shortcuts", openHelp);
    return () => window.removeEventListener("bridgewatch:open-shortcuts", openHelp);
  }, [openHelp]);

  // Forward "/" shortcut to GlobalSearch via custom event (avoids tight coupling)
  const openSearch = useCallback(() => {
    window.dispatchEvent(new CustomEvent("bridgewatch:open-search"));
  }, []);

  useKeyboardShortcuts({ onOpenHelp: openHelp, onOpenSearch: openSearch });

  const sidebarPinnedCount = useMetricsSidebarStore((s) => s.pinned.length);
  const isSidebarOpen = useMetricsSidebarStore((s) => s.isOpen);
  const isSidebarCollapsed = useMetricsSidebarStore((s) => s.isCollapsed);
  const sidebarWidth = sidebarPinnedCount > 0 && isSidebarOpen && !isSidebarCollapsed ? "pr-64" : sidebarPinnedCount > 0 && isSidebarOpen ? "pr-10" : "";

  return (
    <div className="min-h-screen bg-stellar-dark">
      <Navbar />
      <OfflineIndicator />
      <MaintenanceBanner />
      <main
        id="main-content"
        tabIndex={-1}
        className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 focus:outline-none transition-all duration-300 ${sidebarWidth}`}
      >
        {/* Command Palette */}
        <CommandPalette />
        {showBreadcrumbs && <Breadcrumb />}
        <ComponentErrorBoundary context="PageContent" severity="high">
          <Outlet />
        </ComponentErrorBoundary>
      </main>

      {isSidebarOpen && sidebarPinnedCount > 0 && <MetricsSidebar />}

      <ShortcutHelp isOpen={shortcutHelpOpen} onClose={closeHelp} />
    </div>
  );
}
