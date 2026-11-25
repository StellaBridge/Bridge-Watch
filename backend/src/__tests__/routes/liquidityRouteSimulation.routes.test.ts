import { beforeEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { liquidityRouteSimulationRoutes } from "../../api/routes/liquidityRouteSimulation.routes.js";
import { liquidityRouteSimulationService } from "../../services/liquidityRouteSimulation.service.js";

vi.mock("../../services/liquidityRouteSimulation.service.js", () => ({
  liquidityRouteSimulationService: {
    simulate: vi.fn().mockResolvedValue({ id: "sim-1", outputAmount: 98 }),
    getSimulation: vi.fn().mockResolvedValue({ id: "sim-1", outputAmount: 98 }),
    listSimulations: vi.fn().mockResolvedValue({ simulations: [], total: 0 }),
  },
}));

vi.mock("../../api/middleware/auth.js", () => ({ authMiddleware: () => async () => {} }));

describe("liquidityRouteSimulationRoutes", () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    app = Fastify();
    await app.register(liquidityRouteSimulationRoutes);
    vi.clearAllMocks();
  });

  it("creates a simulation", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/simulate",
      payload: { ownerAddress: "GOWNER", sourceAsset: "USDC", targetAsset: "XLM", inputAmount: 100 },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().simulation).toBeDefined();
    expect(liquidityRouteSimulationService.simulate).toHaveBeenCalledWith("GOWNER", "USDC", "XLM", 100, undefined);
  });

  it("returns a simulation by id and reports missing records", async () => {
    const found = await app.inject({ method: "GET", url: "/550e8400-e29b-41d4-a716-446655440000" });
    expect(found.statusCode).toBe(200);

    vi.mocked(liquidityRouteSimulationService.getSimulation).mockResolvedValueOnce(null);
    const missing = await app.inject({ method: "GET", url: "/550e8400-e29b-41d4-a716-446655440001" });
    expect(missing.statusCode).toBe(404);
  });

  it("lists simulations for an owner", async () => {
    const response = await app.inject({ method: "GET", url: "/?owner=GOWNER&limit=5&offset=2" });
    expect(response.statusCode).toBe(200);
    expect(liquidityRouteSimulationService.listSimulations).toHaveBeenCalledWith("GOWNER", 5, 2);
  });
});
