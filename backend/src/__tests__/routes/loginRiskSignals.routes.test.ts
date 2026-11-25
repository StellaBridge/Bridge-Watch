import { beforeEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { loginRiskSignalsRoutes } from "../../api/routes/loginRiskSignals.js";

const service = vi.hoisted(() => ({
  getSignalsForUser: vi.fn().mockResolvedValue([{ id: "signal-1" }]),
  getActiveSignals: vi.fn().mockResolvedValue([{ id: "signal-2" }]),
  createSignal: vi.fn().mockResolvedValue({ id: "signal-3" }),
  resolveSignal: vi.fn().mockResolvedValue({ id: "signal-4", resolved: true }),
}));

vi.mock("../../services/loginRiskSignal.service.js", () => ({ LoginRiskSignalService: vi.fn(() => service) }));
vi.mock("../../api/middleware/auth.js", () => ({ authMiddleware: () => async () => {} }));

describe("loginRiskSignalsRoutes", () => {
  let app: ReturnType<typeof Fastify>;
  beforeEach(async () => {
    app = Fastify();
    await app.register(loginRiskSignalsRoutes);
    vi.clearAllMocks();
  });

  it("gets a user's signals", async () => {
    const response = await app.inject({ method: "GET", url: "/signals?userAddress=GUSER" });
    expect(response.statusCode).toBe(200);
    expect(response.json().signals).toHaveLength(1);
    expect(service.getSignalsForUser).toHaveBeenCalledWith("GUSER");
  });

  it("gets active high-risk signals", async () => {
    const response = await app.inject({ method: "GET", url: "/active-signals" });
    expect(response.statusCode).toBe(200);
    expect(service.getActiveSignals).toHaveBeenCalledWith("high");
  });

  it("creates and resolves a signal", async () => {
    const created = await app.inject({ method: "POST", url: "/signals", payload: { userAddress: "GUSER", signalType: "velocity", riskLevel: "high" } });
    expect(created.statusCode).toBe(201);
    expect(service.createSignal).toHaveBeenCalledWith("GUSER", "velocity", "high", undefined);

    const resolved = await app.inject({ method: "POST", url: "/signals/550e8400-e29b-41d4-a716-446655440000/resolve" });
    expect(resolved.statusCode).toBe(200);
    expect(service.resolveSignal).toHaveBeenCalledWith("550e8400-e29b-41d4-a716-446655440000");
  });
});
