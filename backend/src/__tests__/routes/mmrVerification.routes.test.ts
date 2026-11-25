import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import { mmrVerificationRoutes } from "../../api/routes/mmrVerification.routes.js";

const hash = "a".repeat(64);

describe("mmrVerificationRoutes", () => {
  it("rejects malformed proof requests", async () => {
    const app = Fastify();
    await app.register(mmrVerificationRoutes);
    const response = await app.inject({ method: "POST", url: "/verify-mmr-proof", payload: {} });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("Invalid request body");
  });

  it("appends leaves and exposes accumulator state", async () => {
    const app = Fastify();
    await app.register(mmrVerificationRoutes);
    const appended = await app.inject({ method: "POST", url: "/mmr/append", payload: { rawCommitment: hash } });
    expect(appended.statusCode).toBe(200);
    expect(appended.json().leafIndex).toBe(0);

    const state = await app.inject({ method: "GET", url: "/mmr/state" });
    expect(state.statusCode).toBe(200);
    expect(state.json().leafCount).toBe(1);
  });

  it("validates batch append and generates proofs", async () => {
    const app = Fastify();
    await app.register(mmrVerificationRoutes);
    const batch = await app.inject({ method: "POST", url: "/mmr/append-batch", payload: { commitments: [hash] } });
    expect(batch.statusCode).toBe(200);
    expect(batch.json().appended).toBe(1);

    const proof = await app.inject({ method: "POST", url: "/mmr/generate-proof", payload: { leafIndex: 0 } });
    expect(proof.statusCode).toBe(200);
    expect(proof.json().proof).toBeDefined();
  });
});
