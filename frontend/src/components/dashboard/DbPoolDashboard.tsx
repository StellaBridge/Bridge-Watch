import React, { useEffect, useState, useCallback } from "react";
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Grid,
  Gauge,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  CircularProgress,
  Chip,
  Stack,
  Typography,
} from "@mui/material";
import { format } from "date-fns";

interface PoolMetric {
  bucket: string;
  avg_active: number;
  avg_idle: number;
  avg_waiting: number;
  max_active: number;
  max_waiting: number;
  min_active: number;
  pool_id: string;
}

interface PoolEvent {
  id: number;
  timestamp: string;
  pool_id: string;
  event_type: string;
  severity: "info" | "warning" | "critical";
  details: Record<string, any>;
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

const getSeverityColor = (severity: string) => {
  switch (severity) {
    case "critical":
      return "error";
    case "warning":
      return "warning";
    case "info":
      return "info";
    default:
      return "default";
  }
};

/**
 * Database Connection Pool Dashboard
 * Displays real-time and historical pool metrics with controls
 */
export const DbPoolDashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<PoolMetric[]>([]);
  const [events, setEvents] = useState<PoolEvent[]>([]);
  const [status, setStatus] = useState<PoolStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [controlDialogOpen, setControlDialogOpen] = useState(false);
  const [selectedAction, setSelectedAction] = useState<string>("");
  const [actionParams, setActionParams] = useState<Record<string, any>>({});
  const [executing, setExecuting] = useState(false);

  const apiBase = process.env.REACT_APP_API_URL || "http://localhost:3001";

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem("authToken");
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      // Fetch metrics
      const metricsRes = await fetch(`${apiBase}/api/v1/db-pool/metrics?range=24h&resolution=1h`, {
        headers,
      });
      if (metricsRes.ok) {
        const data = await metricsRes.json();
        setMetrics(data.data || []);
      }

      // Fetch events
      const eventsRes = await fetch(`${apiBase}/api/v1/db-pool/events?range=24h&limit=50`, {
        headers,
      });
      if (eventsRes.ok) {
        const data = await eventsRes.json();
        setEvents(data.data || []);
      }

      // Fetch status
      const statusRes = await fetch(`${apiBase}/api/v1/db-pool/status`, { headers });
      if (statusRes.ok) {
        const data = await statusRes.json();
        setStatus(data.data || null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch pool data");
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [fetchData]);

  const handleControlAction = async () => {
    if (!selectedAction || !status) return;

    setExecuting(true);
    try {
      const token = localStorage.getItem("authToken");
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const response = await fetch(`${apiBase}/api/v1/db-pool/control`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify({
          pool_id: status.pool_id,
          action: selectedAction,
          parameters: actionParams,
          confirmation: true,
        }),
      });

      if (response.ok) {
        alert("Control action executed successfully");
        setControlDialogOpen(false);
        setSelectedAction("");
        setActionParams({});
        await fetchData();
      } else {
        const data = await response.json();
        alert(`Action failed: ${data.error}`);
      }
    } catch (err) {
      alert(`Error executing action: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setExecuting(false);
    }
  };

  if (loading && !status) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 2 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h5" sx={{ mb: 2 }}>
        Database Connection Pool Dashboard
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Status Overview */}
      {status && (
        <Card sx={{ mb: 2 }}>
          <CardHeader title="Pool Health" />
          <CardContent>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={3}>
                <Box sx={{ textAlign: "center" }}>
                  <Gauge value={status.current_utilization * 100} max={100} />
                  <Typography variant="body2">Utilization</Typography>
                  <Typography variant="h6">
                    {(status.current_utilization * 100).toFixed(1)}%
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Box sx={{ textAlign: "center", p: 1 }}>
                  <Typography variant="h6">{status.active_connections}</Typography>
                  <Typography variant="body2">Active</Typography>
                </Box>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Box sx={{ textAlign: "center", p: 1 }}>
                  <Typography variant="h6">{status.idle_connections}</Typography>
                  <Typography variant="body2">Idle</Typography>
                </Box>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Box sx={{ textAlign: "center", p: 1 }}>
                  <Chip
                    label={status.is_healthy ? "Healthy" : "Unhealthy"}
                    color={status.is_healthy ? "success" : "error"}
                  />
                </Box>
              </Grid>
            </Grid>

            {/* Recommendations */}
            {status.recommended_actions.length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2">Recommended Actions:</Typography>
                <Stack direction="column" spacing={1}>
                  {status.recommended_actions.map((action, idx) => (
                    <Typography key={idx} variant="body2">
                      • {action}
                    </Typography>
                  ))}
                </Stack>
              </Box>
            )}
          </CardContent>
        </Card>
      )}

      {/* Metrics Chart */}
      {metrics.length > 0 && (
        <Card sx={{ mb: 2 }}>
          <CardHeader title="24-Hour Metrics" />
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={metrics}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="bucket"
                  tickFormatter={(date) => format(new Date(date), "HH:mm")}
                />
                <YAxis />
                <Tooltip
                  labelFormatter={(date) => format(new Date(date as string), "HH:mm")}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="avg_active"
                  stroke="#8884d8"
                  name="Active"
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="avg_idle"
                  stroke="#82ca9d"
                  name="Idle"
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="avg_waiting"
                  stroke="#ffc658"
                  name="Waiting"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Events Table */}
      <Card sx={{ mb: 2 }}>
        <CardHeader
          title="Recent Events"
          action={
            <Button
              variant="outlined"
              size="small"
              onClick={() => setControlDialogOpen(true)}
            >
              Pool Controls
            </Button>
          }
        />
        <CardContent>
          {events.length > 0 ? (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Time</TableCell>
                  <TableCell>Event Type</TableCell>
                  <TableCell>Severity</TableCell>
                  <TableCell>Message</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell>{format(new Date(event.timestamp), "HH:mm:ss")}</TableCell>
                    <TableCell>{event.event_type}</TableCell>
                    <TableCell>
                      <Chip
                        label={event.severity}
                        color={getSeverityColor(event.severity) as any}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>{event.message}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Typography variant="body2" color="textSecondary">
              No recent events
            </Typography>
          )}
        </CardContent>
      </Card>

      {/* Control Dialog */}
      <Dialog open={controlDialogOpen} onClose={() => setControlDialogOpen(false)}>
        <DialogTitle>Pool Control Action</DialogTitle>
        <DialogContent sx={{ minWidth: 400 }}>
          <TextField
            select
            fullWidth
            label="Action"
            value={selectedAction}
            onChange={(e) => {
              setSelectedAction(e.target.value);
              setActionParams({});
            }}
            margin="normal"
            SelectProps={{
              native: true,
            }}
          >
            <option value="">Select an action...</option>
            <option value="set_max_connections">Set Max Connections</option>
            <option value="set_min_connections">Set Min Connections</option>
            <option value="evict_idle">Evict Idle Connections</option>
            <option value="drain_pool">Drain Pool</option>
            <option value="reset_stats">Reset Statistics</option>
          </TextField>

          {selectedAction === "set_max_connections" && (
            <TextField
              fullWidth
              type="number"
              label="Max Connections"
              value={actionParams.max || ""}
              onChange={(e) =>
                setActionParams({ ...actionParams, max: parseInt(e.target.value) })
              }
              margin="normal"
              inputProps={{ min: 1, max: 1000 }}
            />
          )}

          {selectedAction === "set_min_connections" && (
            <TextField
              fullWidth
              type="number"
              label="Min Connections"
              value={actionParams.min || ""}
              onChange={(e) =>
                setActionParams({ ...actionParams, min: parseInt(e.target.value) })
              }
              margin="normal"
              inputProps={{ min: 0, max: 100 }}
            />
          )}

          <Alert severity="warning" sx={{ mt: 2 }}>
            Control actions are logged for audit purposes. Proceed with caution.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setControlDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleControlAction}
            disabled={!selectedAction || executing}
            variant="contained"
            color="error"
          >
            {executing ? "Executing..." : "Execute"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default DbPoolDashboard;
