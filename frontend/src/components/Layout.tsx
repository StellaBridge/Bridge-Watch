import { Outlet, useLocation } from "react-router-dom";
import Navbar from "./Navbar";
import { Breadcrumb } from "./Breadcrumb";
import { ComponentErrorBoundary } from "./ErrorBoundary";

export default function Layout() {
  const { pathname } = useLocation();
  // Don't show breadcrumbs on the main dashboard (it's the home page)
  const showBreadcrumbs = pathname !== "/dashboard";

  return (
    <div className="min-h-screen bg-stellar-dark">
      <Navbar />
      <main
        id="main-content"
        tabIndex={-1}
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 focus:outline-none"
      >
        {showBreadcrumbs && <Breadcrumb />}
        <ComponentErrorBoundary context="PageContent" severity="high">
          <Outlet />
        </ComponentErrorBoundary>
      </main>
    </div>
  );
}
