import React, { useCallback, useEffect, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface PoolMetric {
  bucket: string;
  avg_active: number;
  avg_idle: number;
  avg_waiting: number;
  pool_id: string;
}

interface PoolEvent {
  id: number;
  timestamp: string;
  pool_id: string;
  event_type: string;
  severity: "info" | "warning" | "critical";
  message: string;
}

interface PoolStatus {
  pool_id: string;
  is_healthy: boolean;
  current_utilization: number;
  active_connections: number;
  idle_connections: number;
  waiting_requests: number;
  max_connections: number;
  recent_errors: number;
  last_heartbeat: string;
  recommended_actions: string[];
}

type ControlAction = "set_max_connections" | "set_min_connections" | "evict_idle" | "drain_pool" | "reset_stats";

/** Operational dashboard for database connection pools. */
export const DbPoolDashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<PoolMetric[]>([]);
  const [events, setEvents] = useState<PoolEvent[]>([]);
  const [status, setStatus] = useState<PoolStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [controlDialogOpen, setControlDialogOpen] = useState(false);
  const [selectedAction, setSelectedAction] = useState<ControlAction | "">("");
  const [actionParams, setActionParams] = useState<Record<string, number>>({});
  const [executing, setExecuting] = useState(false);
  const apiBase = import.meta.env.VITE_API_URL || "http://localhost:3001";

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    const token = localStorage.getItem("authToken");
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    try {
      const [metricsRes, eventsRes, statusRes] = await Promise.all([
        fetch(`${apiBase}/api/v1/db-pool/metrics?range=24h&resolution=1h`, { headers, signal }),
        fetch(`${apiBase}/api/v1/db-pool/events?range=24h&limit=50`, { headers, signal }),
        fetch(`${apiBase}/api/v1/db-pool/status`, { headers, signal }),
      ]);
      if (!metricsRes.ok || !eventsRes.ok || !statusRes.ok) {
        throw new Error("Failed to fetch database pool metrics");
      }
      const [metricsBody, eventsBody, statusBody] = await Promise.all([
        metricsRes.json(), eventsRes.json(), statusRes.json(),
      ]);
      if (signal?.aborted) return;
      setMetrics(metricsBody.data ?? []);
      setEvents(eventsBody.data ?? []);
      setStatus(statusBody.data ?? null);
    } catch (cause) {
      if (signal?.aborted) return;
      setError(cause instanceof Error ? cause.message : "Failed to fetch pool data");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchData(controller.signal);
    const interval = window.setInterval(() => {
      if (!controller.signal.aborted) void fetchData(controller.signal);
    }, 30_000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [fetchData]);

  const handleControlAction = async () => {
    if (!selectedAction || !status) return;
    setExecuting(true);
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch(`${apiBase}/api/v1/db-pool/control`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          pool_id: status.pool_id,
          action: selectedAction,
          parameters: actionParams,
          confirmation: true,
        }),
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || "Pool control action failed");
      }
      setControlDialogOpen(false);
      setSelectedAction("");
      setActionParams({});
      await fetchData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to execute control action");
    } finally {
      setExecuting(false);
    }
  };

  if (loading && !status) {
    return <div role="status" aria-label="Loading pool metrics" className="p-4">Loading pool metrics…</div>;
  }

  return (
    <section aria-label="Database Connection Pool Dashboard" className="space-y-4 p-4">
      <h2 className="text-xl font-semibold">Database Connection Pool Dashboard</h2>
      {error && <p role="alert" className="rounded border border-red-500 p-3 text-red-600">{error}</p>}
      {loading && status && <p role="status">Refreshing pool metrics…</p>}
      {!status && <p>No pool status available</p>}

      {status && (
        <section aria-label="Pool Health" className="rounded border p-4">
          <h3 className="font-semibold">Pool Health</h3>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div>
              <label htmlFor="pool-utilization">Utilization</label>
              <progress id="pool-utilization" max={100} value={status.current_utilization * 100} />
              <p>{(status.current_utilization * 100).toFixed(1)}%</p>
            </div>
            <div><p>Active</p><p>{status.active_connections}</p></div>
            <div><p>Idle</p><p>{status.idle_connections}</p></div>
            <div>
              <span>{status.is_healthy ? "Healthy" : "Unhealthy"}</span>
              {status.current_utilization > 0.8 && (
                <span role="status" className="ml-2 text-amber-800 dark:text-amber-300">High utilization warning</span>
              )}
            </div>
          </div>
          <p>{status.active_connections} of {status.max_connections} connections active</p>
          {status.recommended_actions.length > 0 && (
            <div>
              <h4>Recommended Actions:</h4>
              <ul>{status.recommended_actions.map((action, index) => <li key={index}>{action}</li>)}</ul>
            </div>
          )}
        </section>
      )}

      {metrics.length > 0 ? (
        <section aria-label="24-Hour Metrics" className="rounded border p-4">
          <h3 className="font-semibold">24-Hour Metrics</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={metrics}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="bucket" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="avg_active" stroke="#8884d8" name="Active" dot={false} />
                <Line type="monotone" dataKey="avg_idle" stroke="#82ca9d" name="Idle" dot={false} />
                <Line type="monotone" dataKey="avg_waiting" stroke="#ffc658" name="Waiting" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      ) : <p>No pool metrics available</p>}

      <section aria-label="Recent Events" className="rounded border p-4">
        <h3 className="font-semibold">Recent Events</h3>
        <button type="button" onClick={() => setControlDialogOpen(true)}>Pool Controls</button>
        {events.length === 0 ? <p>No recent events</p> : (
          <table>
            <thead><tr><th>Time</th><th>Event Type</th><th>Severity</th><th>Message</th></tr></thead>
            <tbody>{events.map(event => (
              <tr key={event.id}>
                <td>{new Date(event.timestamp).toLocaleTimeString()}</td>
                <td>{event.event_type}</td>
                <td>{event.severity}</td>
                <td>{event.message}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </section>

      {controlDialogOpen && (
        <div role="dialog" aria-label="Pool Control Action" className="rounded border p-4">
          <h3>Pool Control Action</h3>
          <label htmlFor="pool-action">Action</label>
          <select id="pool-action" value={selectedAction} onChange={event => {
            setSelectedAction(event.target.value as ControlAction | "");
            setActionParams({});
          }}>
            <option value="">Select an action...</option>
            <option value="set_max_connections">Set Max Connections</option>
            <option value="set_min_connections">Set Min Connections</option>
            <option value="evict_idle">Evict Idle Connections</option>
            <option value="drain_pool">Drain Pool</option>
            <option value="reset_stats">Reset Statistics</option>
          </select>
          {(selectedAction === "set_max_connections" || selectedAction === "set_min_connections") && (
            <label>
              {selectedAction === "set_max_connections" ? "Max Connections" : "Min Connections"}
              <input type="number" min={selectedAction === "set_max_connections" ? 1 : 0}
                max={selectedAction === "set_max_connections" ? 1000 : 100}
                value={actionParams[selectedAction === "set_max_connections" ? "max" : "min"] ?? ""}
                onChange={event => setActionParams({
                  ...actionParams,
                  [selectedAction === "set_max_connections" ? "max" : "min"]: Number(event.target.value),
                })} />
            </label>
          )}
          <p>Control actions are logged for audit purposes. Proceed with caution.</p>
          <button type="button" onClick={() => setControlDialogOpen(false)}>Cancel</button>
          <button type="button" disabled={!selectedAction || executing} onClick={() => void handleControlAction()}>
            {executing ? "Executing..." : "Execute"}
          </button>
        </div>
      )}
    </section>
  );
};

export default DbPoolDashboard;
