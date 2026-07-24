import { randomUUID } from "crypto";
import { redis } from "../utils/redis.js";
import { logger } from "../utils/logger.js";

const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

export class DistributedLockService {
  async acquire(key: string, ttlMs: number): Promise<string | null> {
    const token = randomUUID();
    const result = await redis.set(`lock:${key}`, token, "PX", ttlMs, "NX");
    return result === "OK" ? token : null;
  }

  async release(key: string, token: string): Promise<void> {
    try {
      await redis.eval(RELEASE_SCRIPT, 1, `lock:${key}`, token);
    } catch (err) {
      logger.warn({ err, key }, "Failed to release distributed lock");
    }
  }

  async withLock<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T | null> {
    const token = await this.acquire(key, ttlMs);
    if (!token) {
      logger.info({ key }, "Skipping job run — distributed lock held by another instance");
      return null;
    }

    try {
      return await fn();
    } finally {
      await this.release(key, token);
    }
  }
}

export const distributedLockService = new DistributedLockService();
