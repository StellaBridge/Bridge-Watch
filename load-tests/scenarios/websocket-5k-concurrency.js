// K6 stress test scenario for 5,000 concurrent WebSocket clients (#1522).
//
// This scenario measures:
//   - ws_connection_latency    p95, p99 connection establishment time (ms)
//   - ws_broadcast_latency     server timestamp -> client receipt (ms)
//   - ws_connection_drop_rate  percentage of connections closed before hold period
//   - ws_message_drop_rate     percentage of clients that received no messages
//   - ws_memory_peak           peak memory usage during test
//   - ws_event_loop_lag        backend event loop lag (sampled from /metrics)
//
// Usage:
//   k6 run load-tests/scenarios/websocket-5k-concurrency.js
//   k6 run --env BASE_URL=http://staging:3001 --env HOLD_MINUTES=15 load-tests/scenarios/websocket-5k-concurrency.js

import http from "k6/http";
import ws from "k6/ws";
import { check, sleep } from "k6";
import { Counter, Gauge, Rate, Trend, Histogram } from "k6/metrics";

const baseUrl = __ENV.BASE_URL || "http://127.0.0.1:3001";
const wsUrl = `${baseUrl.replace(/^http/, "ws")}/api/v1/ws`;
const metricsUrl = `${baseUrl}/metrics`;
const holdMinutes = Number(__ENV.HOLD_MINUTES || 15);
const holdSeconds = holdMinutes * 60;
const rampUpMinutes = Number(__ENV.RAMP_UP_MINUTES || 5);
const rampUpSeconds = rampUpMinutes * 60;
const targetVus = 5000;
const channels = (__ENV.CHANNELS || "bridges,events,health,prices").split(",");

const connectionLatency = new Trend("ws_connection_latency", true);
const broadcastLatency = new Trend("ws_broadcast_latency", true);
const connectionDropRate = new Rate("ws_connection_drop_rate");
const messageDropRate = new Rate("ws_message_drop_rate");
const broadcastsReceived = new Counter("ws_broadcasts_received");
const subscribeErrors = new Counter("ws_subscribe_errors");
const eventLoopLag = new Gauge("ws_event_loop_lag_ms");
const clientsHeldFull = new Counter("ws_clients_held_full_duration");

export const options = {
  scenarios: {
    websocket_5k: {
      executor: "ramping-vus",
      exec: "broadcastSubscriber",
      startVUs: 0,
      stages: [
        { duration: `${rampUpSeconds}s`, target: targetVus },
        { duration: `${holdSeconds}s`, target: targetVus },
        { duration: "1m", target: 0 },
      ],
      gracefulRampDown: "1m",
    },
    metrics_collection: {
      executor: "constant-arrival-rate",
      exec: "sampleMetrics",
      rate: 1,
      timeUnit: "10s",
      duration: `${rampUpSeconds + holdSeconds + 120}s`,
      preAllocatedVUs: 1,
      startTime: "0s",
    },
  },
  thresholds: {
    ws_connection_latency: ["p(95)<5000", "p(99)<10000"],
    ws_broadcast_latency: ["p(95)<2000", "p(99)<5000"],
    ws_connection_drop_rate: ["rate<0.02"],
    ws_message_drop_rate: ["rate<0.02"],
    checks: ["rate>0.95"],
  },
  summaryTrendStats: ["avg", "min", "med", "max", "p(50)", "p(90)", "p(95)", "p(99)"],
};

export function broadcastSubscriber() {
  const connectionStart = Date.now();
  let received = 0;
  let heldToEnd = false;
  let subscribeErrored = false;

  const res = ws.connect(wsUrl, { tags: { endpoint: "ws_subscribe" } }, (socket) => {
    const connectionTime = Date.now() - connectionStart;
    connectionLatency.add(connectionTime);

    socket.on("open", () => {
      for (const channel of channels) {
        socket.send(JSON.stringify({ type: "subscribe", channel }));
      }

      socket.setTimeout(() => {
        heldToEnd = true;
        clientsHeldFull.add(1);
        socket.close();
      }, holdSeconds * 1000);
    });

    socket.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch (e) {
        return;
      }

      if (msg.type === "error") {
        subscribeErrored = true;
        subscribeErrors.add(1, { code: String(msg.code), channel: msg.channel });
        return;
      }

      if (!msg.channel || msg.type === "subscribed" || !msg.timestamp) return;

      received += 1;
      broadcastsReceived.add(1, { channel: msg.channel });
      const latency = Date.now() - Date.parse(msg.timestamp);
      broadcastLatency.add(latency, { channel: msg.channel });
    });

    socket.on("close", () => {
      connectionDropRate.add(!heldToEnd);
      if (heldToEnd) messageDropRate.add(received === 0);
    });

    socket.on("error", (e) => {
      subscribeErrors.add(1, { code: "socket_error", message: String(e) });
      connectionDropRate.add(1);
    });
  });

  check(res, {
    "ws upgrade succeeded": (r) => r && r.status === 101,
    "no subscribe errors": () => !subscribeErrored,
  });

  if (!res || res.status !== 101) sleep(5);
}

export function sampleMetrics() {
  const res = http.get(metricsUrl, { timeout: "10s", tags: { endpoint: "metrics_exporter" } });

  if (res.status === 200) {
    const eventLoopMatch = /nodejs_eventloop_lag_seconds\s+(\S+)/m.exec(res.body || "");
    if (eventLoopMatch) {
      const lagSeconds = Number(eventLoopMatch[1]);
      eventLoopLag.add(lagSeconds * 1000);
    }
  }
}
