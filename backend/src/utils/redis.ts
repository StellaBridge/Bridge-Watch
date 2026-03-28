import { createRedisClient } from "../config/redis.js";

const redis = createRedisClient();

export { redis };