import { useState, useEffect, useCallback } from "react";
import type {
  PoolSnapshot,
  PoolEvent,
  PoolHealthStatus,
  MetricsQueryOptions,
  EventsQueryOptions,
} from "../../models/db-pool-metrics/pool.model.js";

export interface UsePoolDataOptions {
  enabled?: boolean;
  pollIntervalMs?: number;
}

/**
 * Hook for fetching and managing database pool data
 */
export function usePoolData(options: UsePoolDataOptions = {}) {
  const { enabled = true, pollIntervalMs = 30000 } = options;

  const [metrics, setMetrics] = useState<any[]>([]);
  const [events, setEvents] = useState<PoolEvent[]>([]);
  const [status, setStatus] = useState<PoolHealthStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiBase = process.env.REACT_APP_API_URL || "http://localhost:3001";

  const getAuthHeaders = () => {
    const token = localStorage.getItem("authToken");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const fetchMetrics = useCallback(
    async (options: MetricsQueryOptions = {}) => {
      try {
        const params = new URLSearchParams();
        if (options.range) params.append("range", options.range);
        if (options.resolution) params.append("resolution", options.resolution);
        if (options.pool_id) params.append("pool_id", options.pool_id);

        const response = await fetch(
          `${apiBase}/api/v1/db-pool/metrics?${params}`,
          { headers: getAuthHeaders() }
        );

        if (!response.ok) throw new Error("Failed to fetch metrics");
        const data = await response.json();
        setMetrics(data.data || []);
        return data.data;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setError(message);
        throw err;
      }
    },
    [apiBase]
  );

  const fetchEvents = useCallback(
    async (options: EventsQueryOptions = {}) => {
      try {
        const params = new URLSearchParams();
        if (options.range) params.append("range", options.range);
        if (options.event_type) params.append("event_type", options.event_type);
        if (options.severity) params.append("severity", options.severity);
        if (options.pool_id) params.append("pool_id", options.pool_id);
        if (options.limit) params.append("limit", String(options.limit));
        if (options.offset) params.append("offset", String(options.offset));

        const response = await fetch(
          `${apiBase}/api/v1/db-pool/events?${params}`,
          { headers: getAuthHeaders() }
        );

        if (!response.ok) throw new Error("Failed to fetch events");
        const data = await response.json();
        setEvents(data.data || []);
        return data.data;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setError(message);
        throw err;
      }
    },
    [apiBase]
  );

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch(`${apiBase}/api/v1/db-pool/status`, {
        headers: getAuthHeaders(),
      });

      if (!response.ok) throw new Error("Failed to fetch status");
      const data = await response.json();
      setStatus(data.data || null);
      return data.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      throw err;
    }
  }, [apiBase]);

  const refresh = useCallback(async () => {
    if (!enabled) return;

    setLoading(true);
    try {
      await Promise.all([
        fetchMetrics({ range: "24h", resolution: "1h" }),
        fetchEvents({ range: "24h", limit: 50 }),
        fetchStatus(),
      ]);
      setError(null);
    } catch (err) {
      // Error already set in individual fetch calls
    } finally {
      setLoading(false);
    }
  }, [enabled, fetchMetrics, fetchEvents, fetchStatus]);

  // Auto-refresh on interval
  useEffect(() => {
    if (!enabled) return;

    refresh();
    const interval = setInterval(refresh, pollIntervalMs);

    return () => clearInterval(interval);
  }, [enabled, refresh, pollIntervalMs]);

  return {
    metrics,
    events,
    status,
    loading,
    error,
    refresh,
    fetchMetrics,
    fetchEvents,
    fetchStatus,
  };
}
