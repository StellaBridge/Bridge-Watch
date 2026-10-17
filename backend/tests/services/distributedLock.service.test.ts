import { describe, it, expect, vi, beforeEach } from "vitest";
import RedisMock from "ioredis-mock";
import { DistributedLockService } from "../../src/services/distributedLock.service.js";

// Setup ioredis-mock instance
let mockRedis: any;

vi.mock("../../src/utils/redis.js", () => ({
  get redis() {
    return mockRedis;
  },
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("DistributedLockService", () => {
  let lockService: DistributedLockService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis = new RedisMock();

    // Emulate Lua script eval for RedisMock (RELEASE_SCRIPT and EXTEND_SCRIPT)
    mockRedis.eval = vi.fn(async (script: string, _numKeys: number, key: string, token: string, arg2?: string) => {
      const currentVal = await mockRedis.get(key);
      if (script.includes("del")) {
        if (currentVal === token) {
          return await mockRedis.del(key);
        }
        return 0;
      }
      if (script.includes("pexpire")) {
        if (currentVal === token) {
          const ttlMs = Number(arg2);
          await mockRedis.pexpire(key, ttlMs);
          return 1;
        }
        return 0;
      }
      return 0;
    });

    lockService = new DistributedLockService();
  });

  describe("Lock acquisition and release", () => {
    it("should acquire a lock successfully when not already held", async () => {
      const lockKey = "resource-1";
      const token = await lockService.acquire(lockKey, 5000);

      expect(token).toBeDefined();
      expect(typeof token).toBe("string");
      expect(token?.length).toBeGreaterThan(0);

      const storedToken = await mockRedis.get(`lock:${lockKey}`);
      expect(storedToken).toBe(token);
    });

    it("should release a lock when the correct token is provided", async () => {
      const lockKey = "resource-2";
      const token = await lockService.acquire(lockKey, 5000);
      expect(token).not.toBeNull();

      await lockService.release(lockKey, token!);
      const storedToken = await mockRedis.get(`lock:${lockKey}`);
      expect(storedToken).toBeNull();
    });

    it("should not release a lock if token does not match", async () => {
      const lockKey = "resource-3";
      const token = await lockService.acquire(lockKey, 5000);
      expect(token).not.toBeNull();

      await lockService.release(lockKey, "wrong-token-abc");
      const storedToken = await mockRedis.get(`lock:${lockKey}`);
      expect(storedToken).toBe(token);
    });
  });

  describe("Lock expiration (TTL)", () => {
    it("should expire the lock after TTL passes", async () => {
      const lockKey = "resource-ttl";
      const ttlMs = 50;

      const token1 = await lockService.acquire(lockKey, ttlMs);
      expect(token1).not.toBeNull();

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 70));

      // After expiration, a new acquire should succeed
      const token2 = await lockService.acquire(lockKey, ttlMs);
      expect(token2).not.toBeNull();
      expect(token2).not.toBe(token1);
    });
  });

  describe("Concurrent lock contention", () => {
    it("should allow only one caller to win when two callers compete concurrently", async () => {
      const lockKey = "contention-key";
      const ttlMs = 10000;

      // Two callers attempt to acquire the lock at the same time
      const [tokenCaller1, tokenCaller2] = await Promise.all([
        lockService.acquire(lockKey, ttlMs),
        lockService.acquire(lockKey, ttlMs),
      ]);

      const winners = [tokenCaller1, tokenCaller2].filter((t) => t !== null);
      const losers = [tokenCaller1, tokenCaller2].filter((t) => t === null);

      expect(winners).toHaveLength(1);
      expect(losers).toHaveLength(1);
    });
  });

  describe("Lock renewal / extension", () => {
    it("should renew/extend TTL if the caller holds the matching token", async () => {
      const lockKey = "resource-extend";
      const token = await lockService.acquire(lockKey, 2000);
      expect(token).not.toBeNull();

      const extended = await lockService.extend(lockKey, token!, 5000);
      expect(extended).toBe(true);

      const renewed = await lockService.renew(lockKey, token!, 8000);
      expect(renewed).toBe(true);
    });

    it("should fail to extend if token does not match", async () => {
      const lockKey = "resource-extend-fail";
      const token = await lockService.acquire(lockKey, 2000);
      expect(token).not.toBeNull();

      const extended = await lockService.extend(lockKey, "invalid-token", 5000);
      expect(extended).toBe(false);
    });

    it("should fail to extend if lock does not exist", async () => {
      const extended = await lockService.extend("nonexistent-key", "random-token", 5000);
      expect(extended).toBe(false);
    });
  });

  describe("withLock execution helper", () => {
    it("should execute function with lock and release automatically", async () => {
      const lockKey = "withlock-success";
      let executed = false;

      const result = await lockService.withLock(lockKey, 5000, async () => {
        executed = true;
        return "completed-task";
      });

      expect(executed).toBe(true);
      expect(result).toBe("completed-task");

      // Lock should have been released
      const storedToken = await mockRedis.get(`lock:${lockKey}`);
      expect(storedToken).toBeNull();
    });

    it("should return null and skip execution if lock is held", async () => {
      const lockKey = "withlock-held";
      const holderToken = await lockService.acquire(lockKey, 5000);
      expect(holderToken).not.toBeNull();

      let executed = false;
      const result = await lockService.withLock(lockKey, 5000, async () => {
        executed = true;
        return "should-not-run";
      });

      expect(executed).toBe(false);
      expect(result).toBeNull();
    });

    it("should release lock even if function throws error", async () => {
      const lockKey = "withlock-error";

      await expect(
        lockService.withLock(lockKey, 5000, async () => {
          throw new Error("Task failed unexpectedly");
        })
      ).rejects.toThrow("Task failed unexpectedly");

      // Lock should still be released via finally
      const storedToken = await mockRedis.get(`lock:${lockKey}`);
      expect(storedToken).toBeNull();
    });
  });
});
