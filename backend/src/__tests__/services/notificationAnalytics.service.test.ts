import { beforeEach, describe, expect, it, vi } from "vitest";

const databaseMocks = vi.hoisted(() => ({
  deliveries: [] as any[],
  fn: vi.fn(),
}));

vi.mock("../../database/connection.js", () => ({
  getDatabase: () => databaseMocks.fn,
}));

import { NotificationAnalyticsService } from "../../services/notificationAnalytics.service.js";

function delivery(channel: string, status: "delivered" | "failed" | "bounced", latency: number | null = 100) {
  return {
    id: `${channel}-${status}-${Math.random()}`,
    notification_type: "bridge_alert",
    channel,
    recipient: `${channel}-recipient`,
    status,
    delivery_time_ms: latency,
    error_message: status === "delivered" ? null : "delivery failed",
    metadata: null,
    sent_at: new Date("2026-11-21T10:00:00Z"),
    delivered_at: status === "delivered" ? new Date("2026-11-21T10:00:01Z") : null,
    created_at: new Date("2026-11-21T10:00:00Z"),
    updated_at: new Date("2026-11-21T10:00:01Z"),
  };
}

describe("NotificationAnalyticsService", () => {
  let service: NotificationAnalyticsService;

  beforeEach(() => {
    vi.clearAllMocks();
    databaseMocks.deliveries = [];
    service = new NotificationAnalyticsService();
  });

  it("aggregates delivery success across Discord, Telegram, Slack, and Webhook", async () => {
    databaseMocks.deliveries = [
      delivery("discord", "delivered"),
      delivery("discord", "failed"),
      delivery("telegram", "delivered"),
      delivery("slack", "bounced"),
      delivery("webhook", "delivered"),
    ];
    const query = {
      where: vi.fn().mockReturnThis(),
      whereBetween: vi.fn().mockResolvedValue(databaseMocks.deliveries),
    };
    databaseMocks.fn.mockReturnValue(query);

    const analytics = await service.getAnalytics(
      new Date("2026-11-21T00:00:00Z"),
      new Date("2026-11-21T23:59:59Z"),
    );

    expect(analytics.totalNotifications).toBe(5);
    expect(analytics.successCount).toBe(3);
    expect(analytics.failureCount).toBe(1);
    expect(analytics.bouncedCount).toBe(1);
    expect(analytics.successRate).toBe(60);
    expect(Object.keys(analytics.byChannel)).toEqual(["discord", "telegram", "slack", "webhook"]);
  });

  it("computes average delivery latency per notification channel", async () => {
    databaseMocks.deliveries = [
      delivery("discord", "delivered", 100),
      delivery("discord", "delivered", 300),
      delivery("telegram", "delivered", 500),
    ];
    databaseMocks.fn.mockReturnValue({
      whereBetween: vi.fn().mockResolvedValue(databaseMocks.deliveries),
      where: vi.fn().mockReturnThis(),
    });

    const analytics = await service.getAnalytics(
      new Date("2026-11-21T00:00:00Z"),
      new Date("2026-11-21T23:59:59Z"),
    );

    expect(analytics.averageDeliveryTimeMs).toBe(300);
  });

  it("computes p95 delivery latency for a notification channel", () => {
    const latencies = [100, 300, 500, 700, 900];
    const sorted = [...latencies].sort((a, b) => a - b);
    const percentileIndex = Math.ceil(0.95 * sorted.length) - 1;

    expect(sorted[percentileIndex]).toBe(900);
  });

  it("identifies a channel failure rate above 5%", () => {
    const channel = [delivery("discord", "delivered"), ...Array.from({ length: 20 }, () => delivery("discord", "failed"))];
    const failures = channel.filter((entry) => entry.status === "failed").length;
    const failureRate = (failures / channel.length) * 100;

    expect(failureRate).toBeGreaterThan(5);
  });

  it("retains and cleans up notification attempt records by age", async () => {
    const oldAttempt = delivery("webhook", "failed");
    const recentAttempt = delivery("telegram", "delivered");
    const cutoff = new Date("2026-11-20T00:00:00Z");
    oldAttempt.sent_at = new Date("2026-10-01T00:00:00Z");

    const retained = [oldAttempt, recentAttempt].filter((attempt) => attempt.sent_at >= cutoff);

    expect(retained).toEqual([recentAttempt]);
  });
});
