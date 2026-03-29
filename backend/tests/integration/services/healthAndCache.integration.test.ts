import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../../../src/index.js";
import { mockExternalApis, restoreExternalApisMock } from "../../helpers/externalApiMock.js";
import { CacheService } from "../../../src/utils/cache.js";
import { flushRedis } from "../../helpers/redis.js";

describe("Health + cache integration", () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    server = await buildServer();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(async () => {
    await flushRedis();
  });

  afterEach(() => {
    restoreExternalApisMock();
  });

  it("returns degraded detailed health when one external API is unhealthy", async () => {
    mockExternalApis([
      { ok: true, status: 200 },
      { ok: false, status: 503 },
    ]);

    const res = await server.inject({
      method: "GET",
      url: "/api/v1/health/detailed",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe("degraded");
    expect(body.checks.externalApis.status).toBe("degraded");
    expect(body.summary.total).toBe(4);
  });

  it("renders Prometheus metrics output", async () => {
    mockExternalApis([
      { ok: true, status: 200 },
      { ok: true, status: 200 },
    ]);

    const res = await server.inject({
      method: "GET",
      url: "/api/v1/health/metrics",
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
    expect(res.body).toContain("bridge_watch_health_status{component=\"overall\"}");
  });

  it("uses Redis cache across repeated calls", async () => {
    const key = CacheService.generateKey("integration", "cache-hit");
    let calls = 0;

    const first = await CacheService.getOrSet(
      key,
      async () => {
        calls += 1;
        return { value: 42 };
      },
      { ttl: 60, tags: ["integration"] }
    );

    const second = await CacheService.getOrSet(
      key,
      async () => {
        calls += 1;
        return { value: 77 };
      },
      { ttl: 60, tags: ["integration"] }
    );

    expect(first.value).toBe(42);
    expect(second.value).toBe(42);
    expect(calls).toBe(1);
  });
});
