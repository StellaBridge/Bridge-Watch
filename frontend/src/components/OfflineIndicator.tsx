import { useEffect, useState, useCallback } from "react";
import { getQueuedRequests, retryQueuedRequests } from "../utils/offlineQueue";

export default function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" && typeof navigator.onLine === "boolean"
      ? navigator.onLine
      : true
  );
  const [showRestoredBanner, setShowRestoredBanner] = useState(false);
  const [queuedCount, setQueuedCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  const updateQueueCount = useCallback(() => {
    setQueuedCount(getQueuedRequests().length);
  }, []);

  const handleSync = useCallback(async () => {
    if (!navigator.onLine || isSyncing) return;
    setIsSyncing(true);
    try {
      await retryQueuedRequests();
      updateQueueCount();
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, updateQueueCount]);

  useEffect(() => {
    updateQueueCount();

    const handleOnline = () => {
      setIsOnline(true);
      setShowRestoredBanner(true);
      void handleSync();
      const timer = setTimeout(() => {
        setShowRestoredBanner(false);
      }, 4000);
      return () => clearTimeout(timer);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowRestoredBanner(false);
      updateQueueCount();
    };

    const handleQueueChange = () => {
      updateQueueCount();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("bridgewatch:offline-queue-change", handleQueueChange);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("bridgewatch:offline-queue-change", handleQueueChange);
    };
  }, [handleSync, updateQueueCount]);

  // When offline, render prominent warning banner
  if (!isOnline) {
    return (
      <aside
        data-testid="offline-indicator"
        role="status"
        aria-live="assertive"
        className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-3 bg-amber-500/20 border-b border-amber-500/40 px-4 py-2.5 text-amber-200 backdrop-blur-md"
      >
        <div className="flex items-center gap-2">
          <span className="flex h-2.5 w-2.5 rounded-full bg-amber-400 animate-pulse" aria-hidden="true" />
          <p className="text-sm font-medium">
            You are offline. Viewing cached bridge data.
            {queuedCount > 0 && (
              <span className="ml-1 text-xs opacity-90">
                ({queuedCount} request{queuedCount === 1 ? "" : "s"} queued to sync)
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (navigator.onLine) {
              void handleSync();
            } else {
              window.location.reload();
            }
          }}
          className="min-h-[36px] rounded-md border border-amber-400/50 bg-amber-500/20 px-3 py-1 text-xs font-semibold text-white transition hover:bg-amber-500/30 focus:outline-none focus:ring-2 focus:ring-amber-400"
        >
          Check Connection
        </button>
      </aside>
    );
  }

  // When just returned online, flash confirmation banner
  if (showRestoredBanner) {
    return (
      <aside
        data-testid="offline-indicator-restored"
        role="status"
        aria-live="polite"
        className="sticky top-0 z-50 flex items-center justify-between bg-emerald-500/20 border-b border-emerald-500/40 px-4 py-2 text-emerald-200 backdrop-blur-md transition-opacity duration-300"
      >
        <div className="flex items-center gap-2">
          <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400" aria-hidden="true" />
          <p className="text-sm font-medium">
            Connection restored! {isSyncing ? "Syncing queued requests..." : "Cached data updated."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowRestoredBanner(false)}
          className="text-xs text-emerald-300 hover:text-white px-2 py-1"
          aria-label="Dismiss banner"
        >
          ✕
        </button>
      </aside>
    );
  }

  return null;
}
