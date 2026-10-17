import React, { Suspense } from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { registerAction } from "./utils/commandRegistry";
import { TimeRangeProvider } from "./hooks/useTimeRange";
import { WatchlistProvider } from "./hooks/useWatchlist";
import { WebSocketProvider } from "./contexts/WebSocketContext";
import ThemeProvider from "./theme/ThemeProvider";
import "./i18n/config";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchInterval: 60_000,
    },
  },
});

// Register a few built-in actions for the command palette
registerAction({ id: "goto-dashboard", title: "Go to Dashboard", href: "/dashboard", keywords: ["home", "dashboard"] });
registerAction({ id: "create-incident", title: "Create Incident", href: "/incidents", keywords: ["incident", "alert", "create"] });
registerAction({ id: "toggle-theme", title: "Toggle Dark Mode", onExecute: () => window.dispatchEvent(new CustomEvent('bridgewatch:toggle-theme')), keywords: ["theme", "dark", "light"] });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Suspense
      fallback={
        <div className="min-h-screen bg-stellar-dark flex items-center justify-center text-stellar-text-secondary">
          Loading...
        </div>
      }
    >
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <WebSocketProvider>
              <WatchlistProvider>
                <TimeRangeProvider>
                  <App />
                </TimeRangeProvider>
              </WatchlistProvider>
            </WebSocketProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </ThemeProvider>
    </Suspense>
  </React.StrictMode>
);

// Register service worker for offline bridge monitoring and asset caching
if (typeof window !== "undefined" && "serviceWorker" in navigator && process.env.NODE_ENV !== "test") {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        registration.addEventListener("updatefound", () => {
          const installingWorker = registration.installing;
          if (installingWorker) {
            installingWorker.addEventListener("statechange", () => {
              if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
                console.info("Bridge Watch PWA content updated. Reload to view latest version.");
              }
            });
          }
        });
      })
      .catch((error) => {
        console.warn("ServiceWorker registration failed:", error);
      });
  });
}

