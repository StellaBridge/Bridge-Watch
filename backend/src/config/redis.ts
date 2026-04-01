import Redis, { Cluster, RedisOptions, ClusterNode, ClusterOptions } from "ioredis";
import { config } from "./index.js";
import { logger } from "../utils/logger.js";

// Redis Connection Options
const redisOptions: RedisOptions = {
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
  password: config.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => {
    const delay = Math.min(times * 100, 3000);
    return delay;
  },
};

// Cluster Options
const clusterOptions: ClusterOptions = {
  redisOptions: {
    password: config.REDIS_PASSWORD || undefined,
  },
  clusterRetryStrategy: (times) => Math.min(times * 100, 3000),
  enableReadyCheck: true,
  scaleReads: "slave", // scale read queries to slaves
};

let redisClient: Redis | Cluster;

export const createRedisClient = (): Redis | Cluster => {
  if (config.NODE_ENV === "production" && process.env.REDIS_CLUSTER === "true") {
    // Provide your cluster nodes configuration here
    // In a real environment, this might come from env config like REDIS_CLUSTER_NODES
    const nodes: ClusterNode[] = [
      { host: config.REDIS_HOST, port: config.REDIS_PORT },
    ];
    
    redisClient = new Redis.Cluster(nodes, clusterOptions);
    logger.info("Initialized Redis Cluster client");
  } else {
    redisClient = new Redis(redisOptions);
    logger.info("Initialized standard Redis client");
  }

  redisClient.on("error", (err) => {
    logger.error({ err }, "Redis connection error");
  });

  redisClient.on("connect", () => {
    logger.info("Connected to Redis");
  });

  return redisClient;
};
