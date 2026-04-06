import { beforeAll, afterAll, vi } from "vitest";

// Mock ioredis globally to prevent test leaks
vi.mock("ioredis", () => {
  return {
    default: class RedisMock {
      on = vi.fn().mockReturnThis();
      get = vi.fn().mockResolvedValue(null);
      set = vi.fn().mockResolvedValue("OK");
      quit = vi.fn().mockResolvedValue(null);
      disconnect = vi.fn().mockResolvedValue(null);
      del = vi.fn().mockResolvedValue(0);
      keys = vi.fn().mockResolvedValue([]);
      incr = vi.fn().mockResolvedValue(0);
      decr = vi.fn().mockResolvedValue(0);
      incrby = vi.fn().mockResolvedValue(0);
      decrby = vi.fn().mockResolvedValue(0);
      expire = vi.fn().mockResolvedValue(1);
      ttl = vi.fn().mockResolvedValue(-1);
      pttl = vi.fn().mockResolvedValue(-1);
      exists = vi.fn().mockResolvedValue(0);
      type = vi.fn().mockResolvedValue("none");
      mget = vi.fn().mockResolvedValue([]);
      mset = vi.fn().mockResolvedValue("OK");
      hgetall = vi.fn().mockResolvedValue({});
      hset = vi.fn().mockResolvedValue(0);
      hget = vi.fn().mockResolvedValue(null);
      hdel = vi.fn().mockResolvedValue(0);
      info = vi.fn().mockResolvedValue("used_memory:1000\r\nconnected_clients:1\r\n");
      zcard = vi.fn().mockResolvedValue(0);
      zadd = vi.fn().mockResolvedValue(0);
      zrange = vi.fn().mockResolvedValue([]);
      zrangebyscore = vi.fn().mockResolvedValue([]);
      zremrangebyscore = vi.fn().mockResolvedValue(0);
      pexpire = vi.fn().mockResolvedValue(1);
      setex = vi.fn().mockResolvedValue("OK");
      publish = vi.fn().mockResolvedValue(0);
      subscribe = vi.fn().mockResolvedValue(null);
      unsubscribe = vi.fn().mockResolvedValue(null);
      flushdb = vi.fn().mockResolvedValue("OK");
      flushall = vi.fn().mockResolvedValue("OK");
      pipeline = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue([]),
        zadd: vi.fn().mockReturnThis(),
        zremrangebyscore: vi.fn().mockReturnThis(),
        expire: vi.fn().mockReturnThis(),
        zcard: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        get: vi.fn().mockReturnThis(),
        del: vi.fn().mockReturnThis(),
        incr: vi.fn().mockReturnThis(),
        incrby: vi.fn().mockReturnThis(),
        pexpire: vi.fn().mockReturnThis(),
        setex: vi.fn().mockReturnThis(),
      });
    }
  };
});

// Mock BullMQ to avoid real Redis connections in unit tests
vi.mock("bullmq", () => {
  // Use require inside the mock factory to avoid hoisting issues
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { EventEmitter } = require("events");

  class QueueMock {
    name: string;

    constructor(name: string) {
      this.name = name;
    }

    add = vi.fn(async (name: string, data?: unknown, opts?: unknown) => ({
      id: "mock-job",
      name,
      data,
      opts,
    }));

    getJobCounts = vi.fn(async () => ({
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
    }));

    getFailed = vi.fn(async () => []);

    close = vi.fn(async () => undefined);
  }

  class WorkerMock extends EventEmitter {
    constructor() {
      super();
    }

    close = vi.fn(async () => undefined);
    run = vi.fn(async () => undefined);
  }

  return {
    Queue: QueueMock,
    Worker: WorkerMock,
  };
});

// Global test setup
beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.POSTGRES_HOST = "localhost";
  process.env.POSTGRES_PORT = "5432";
  process.env.POSTGRES_DB = "bridge_watch_test";
  process.env.POSTGRES_USER = "bridge_watch";
  process.env.POSTGRES_PASSWORD = "test_password";
  process.env.REDIS_HOST = "localhost";
  process.env.REDIS_PORT = "6379";
});

afterAll(async () => {
  // Cleanup resources
});
