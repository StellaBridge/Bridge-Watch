import { Outlet } from "react-router-dom";
import { Suspense } from "react";
import Navbar from "./Navbar";
import ErrorBoundary from "./Skeleton/ErrorBoundary";
import LoadingSpinner from "./Skeleton/LoadingSpinner";

export default function Layout() {
  return (
    <div className="min-h-screen bg-stellar-dark">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <ErrorBoundary>
          <Suspense fallback={<LoadingSpinner message="Loading page content..." showProgress />}> 
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  );
}
