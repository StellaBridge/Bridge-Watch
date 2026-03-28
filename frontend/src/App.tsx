import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import { NotificationProvider } from "./context/NotificationContext";
import { useNotifications } from "./hooks/useNotifications";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const AssetDetail = lazy(() => import("./pages/AssetDetail"));
const Bridges = lazy(() => import("./pages/Bridges"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Reports = lazy(() => import("./pages/Reports"));
const Landing = lazy(() => import("./pages/Landing"));
const Settings = lazy(() => import("./pages/Settings"));
const WatchlistPage = lazy(() => import("./pages/Watchlist"));
const Transactions = lazy(() => import("./pages/Transactions"));
const ApiKeys = lazy(() => import("./pages/ApiKeys"));

function NotificationInitializer() {
  useNotifications();
  return null;
}

function App() {
  return (
    <NotificationProvider>
      <NotificationInitializer />
      <Suspense
        fallback={
          <div className="min-h-screen bg-stellar-dark flex items-center justify-center text-stellar-text-secondary">
            Loading page…
          </div>
        }
      >
        <Routes>
          <Route path="/" element={<Landing />} />

          <Route element={<Layout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/assets/:symbol" element={<AssetDetail />} />
            <Route path="/bridges" element={<Bridges />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/watchlist" element={<WatchlistPage />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/admin/api-keys" element={<ApiKeys />} />
          </Route>
        </Routes>
      </Suspense>
    </NotificationProvider>
  );
}

export default App;
