// WebSocket broadcast scalability test (#1296).
//
// Ramps to TARGET_VUS concurrent clients on /api/v1/ws, each subscribing to the
// public bridge-event channels, then holds the connections open and measures:
//   - ws_broadcast_latency     server `timestamp` -> client receipt (ms)
//   - ws_message_drop_rate     share of sessions that received no broadcast
//                              while subscribed for HOLD_SECONDS
//   - ws_connection_drop_rate  share of sessions closed before the hold ended
//   - redis_memory_used_bytes  sampled from a redis_exporter when
//                              REDIS_EXPORTER_URL is set
//
// k6 run load-tests/websocket-concurrency.js
// k6 run --env TARGET_VUS=500 --env BASE_URL=http://staging:3001 load-tests/websocket-concurrency.js
import http from "k6/http";
import ws from "k6/ws";
import { check, sleep } from "k6";
import { Counter, Gauge, Rate, Trend } from "k6/metrics";

const baseUrl = __ENV.BASE_URL || "http://127.0.0.1:3001";
const wsUrl = `${baseUrl.replace(/^http/, "ws")}/api/v1/ws`;
const targetVus = Number(__ENV.TARGET_VUS || 5000);
const holdSeconds = Number(__ENV.HOLD_SECONDS || 60);
const redisExporterUrl = __ENV.REDIS_EXPORTER_URL;
// "alerts" is private (requires a token), so only public bridge-event channels.
const channels = (__ENV.CHANNELS || "bridges,events,health,prices").split(",");

const broadcastLatency = new Trend("ws_broadcast_latency", true);
const broadcastsReceived = new Counter("ws_broadcasts_received");
const messageDropRate = new Rate("ws_message_drop_rate");
const connectionDropRate = new Rate("ws_connection_drop_rate");
const subscribeErrors = new Counter("ws_subscribe_errors");
const redisMemory = new Gauge("redis_memory_used_bytes");

const scenarios = {
  subscribers: {
    executor: "ramping-vus",
    exec: "subscriber",
    startVUs: 0,
    stages: [
      { duration: __ENV.RAMP_UP || "2m", target: targetVus },
      { duration: `${holdSeconds}s`, target: targetVus },
      { duration: "30s", target: 0 },
    ],
    gracefulRampDown: "30s",
  },
};

if (redisExporterUrl) {
  scenarios.redis_memory = {
    executor: "constant-arrival-rate",
    exec: "sampleRedisMemory",
    rate: 1,
    timeUnit: "5s",
    duration: `${150 + holdSeconds}s`,
    preAllocatedVUs: 1,
  };
}

export const options = {
  scenarios,
  thresholds: {
    ws_connecting: ["p(95)<2000"],
    ws_broadcast_latency: ["p(95)<1000", "p(99)<2500"],
    ws_message_drop_rate: ["rate<0.01"],
    ws_connection_drop_rate: ["rate<0.01"],
    checks: ["rate>0.99"],
  },
  summaryTrendStats: ["avg", "min", "med", "max", "p(90)", "p(95)", "p(99)"],
};

export function subscriber() {
  let received = 0;
  let heldToEnd = false;

  const res = ws.connect(wsUrl, { tags: { endpoint: "ws_subscribe" } }, (socket) => {
    socket.on("open", () => {
      for (const channel of channels) {
        socket.send(JSON.stringify({ type: "subscribe", channel }));
      }
      socket.setTimeout(() => {
        heldToEnd = true;
        socket.close();
      }, holdSeconds * 1000);
    });

    socket.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      if (msg.type === "error") {
        subscribeErrors.add(1, { code: String(msg.code) });
        return;
      }
      if (!msg.channel || msg.type === "subscribed" || !msg.timestamp) return;
      received += 1;
      broadcastsReceived.add(1, { channel: msg.channel });
      broadcastLatency.add(Date.now() - Date.parse(msg.timestamp), { channel: msg.channel });
    });
  });

  const connected = check(res, { "ws upgrade is 101": (r) => r && r.status === 101 });
  connectionDropRate.add(!heldToEnd);
  if (heldToEnd) messageDropRate.add(received === 0);
  // Back off before reconnecting so a failing server isn't hammered in a tight loop.
  if (!connected) sleep(1);
}

export function sampleRedisMemory() {
  const res = http.get(redisExporterUrl, { tags: { endpoint: "redis_exporter" } });
  const match = /^redis_memory_used_bytes\s+(\S+)/m.exec(res.body || "");
  if (match) redisMemory.add(Number(match[1]));
}
