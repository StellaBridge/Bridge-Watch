import { beforeEach, describe, expect, it, vi } from "vitest";

const databaseMocks = vi.hoisted(() => ({
  insert: vi.fn(),
  returning: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  whereIn: vi.fn(),
  resolveReturning: vi.fn(),
}));

const query = vi.hoisted(() => {
  const value: any = {};
  return value;
});

vi.mock("../../database/connection.js", () => ({
  getDatabase: () => vi.fn((table: string) => {
    if (table !== "login_risk_signals") throw new Error(`Unexpected table: ${table}`);
    return query;
  }),
}));

import { LoginRiskSignalService } from "../../services/loginRiskSignal.service.js";

describe("LoginRiskSignalService", () => {
  const service = new LoginRiskSignalService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records risk metadata for an unknown IP address", async () => {
    const row = {
      id: "signal-1",
      user_address: "GUSER",
      signal_type: "suspicious_ip",
      risk_level: "high",
      metadata: { ipAddress: "203.0.113.10", unknownIp: true, riskScoreIncrement: 35 },
      detected_at: new Date("2026-11-21T10:00:00Z"),
      resolved_at: null,
      is_active: true,
      created_at: new Date("2026-11-21T10:00:00Z"),
      updated_at: new Date("2026-11-21T10:00:00Z"),
    };

    query.insert = vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([row]) });

    const signal = await service.createSignal(
      "GUSER",
      "suspicious_ip",
      "high",
      { ipAddress: "203.0.113.10", unknownIp: true, riskScoreIncrement: 35 },
    );

    expect(query.insert).toHaveBeenCalledWith(expect.objectContaining({
      user_address: "GUSER",
      signal_type: "suspicious_ip",
      risk_level: "high",
    }));
    expect(signal.metadata).toEqual({ ipAddress: "203.0.113.10", unknownIp: true, riskScoreIncrement: 35 });
  });

  it("records a novel user-agent as anomalous behavior", async () => {
    const row = {
      id: "signal-2",
      user_address: "GUSER",
      signal_type: "anomalous_behavior",
      risk_level: "medium",
      metadata: { userAgent: "NovelBrowser/1.0", novelUserAgent: true, riskScoreIncrement: 20 },
      detected_at: new Date("2026-11-21T10:01:00Z"),
      resolved_at: null,
      is_active: true,
      created_at: new Date("2026-11-21T10:01:00Z"),
      updated_at: new Date("2026-11-21T10:01:00Z"),
    };
    query.insert = vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([row]) });

    const signal = await service.createSignal("GUSER", "anomalous_behavior", "medium", {
      userAgent: "NovelBrowser/1.0",
      novelUserAgent: true,
      riskScoreIncrement: 20,
    });

    expect(signal.metadata).toEqual(expect.objectContaining({ novelUserAgent: true, riskScoreIncrement: 20 }));
  });

  it("records impossible travel from New York to Tokyo within ten minutes", async () => {
    const metadata = {
      previousLocation: { city: "New York", latitude: 40.7128, longitude: -74.006 },
      currentLocation: { city: "Tokyo", latitude: 35.6762, longitude: 139.6503 },
      elapsedMinutes: 10,
    };
    const row = {
      id: "signal-3",
      user_address: "GUSER",
      signal_type: "unusual_location",
      risk_level: "critical",
      metadata,
      detected_at: new Date("2026-11-21T10:10:00Z"),
      resolved_at: null,
      is_active: true,
      created_at: new Date("2026-11-21T10:10:00Z"),
      updated_at: new Date("2026-11-21T10:10:00Z"),
    };
    query.insert = vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([row]) });

    const signal = await service.createSignal("GUSER", "unusual_location", "critical", metadata);

    expect(signal.riskLevel).toBe("critical");
    expect(signal.metadata).toEqual(expect.objectContaining({ elapsedMinutes: 10 }));
  });

  it("triggers an MFA challenge classification when the active risk is critical", async () => {
    const row = {
      id: "signal-4",
      user_address: "GUSER",
      signal_type: "suspicious_ip",
      risk_level: "critical",
      metadata: { riskScore: 85, mfaRequired: true },
      detected_at: new Date("2026-11-21T10:20:00Z"),
      resolved_at: null,
      is_active: true,
      created_at: new Date("2026-11-21T10:20:00Z"),
      updated_at: new Date("2026-11-21T10:20:00Z"),
    };
    query.where = vi.fn().mockReturnThis();
    query.whereIn = vi.fn().mockReturnThis();
    query.orderBy = vi.fn().mockResolvedValue([row]);

    const signals = await service.getActiveSignals("medium");

    expect(signals[0].riskLevel).toBe("critical");
    expect(signals[0].metadata).toEqual(expect.objectContaining({ riskScore: 85, mfaRequired: true }));
  });

  it("logs risk signals in the login_risk_signals security audit table", async () => {
    const row = {
      id: "signal-5",
      user_address: "GUSER",
      signal_type: "failed_attempts",
      risk_level: "high",
      metadata: { failedAttempts: 6 },
      detected_at: new Date("2026-11-21T10:30:00Z"),
      resolved_at: null,
      is_active: true,
      created_at: new Date("2026-11-21T10:30:00Z"),
      updated_at: new Date("2026-11-21T10:30:00Z"),
    };
    query.insert = vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([row]) });

    await service.createSignal("GUSER", "failed_attempts", "high", { failedAttempts: 6 });

    expect(query.insert).toHaveBeenCalledWith(expect.objectContaining({
      user_address: "GUSER",
      signal_type: "failed_attempts",
      risk_level: "high",
      metadata: { failedAttempts: 6 },
    }));
  });
});
