"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRedisClient = void 0;
var ioredis_1 = require("ioredis");
var index_js_1 = require("./index.js");
var logger_js_1 = require("../utils/logger.js");
// Redis Connection Options
var redisOptions = {
    host: index_js_1.config.REDIS_HOST,
    port: index_js_1.config.REDIS_PORT,
    password: index_js_1.config.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: 3,
    retryStrategy: function (times) {
        var delay = Math.min(times * 100, 3000);
        return delay;
    },
};
// Cluster Options
var clusterOptions = {
    redisOptions: {
        password: index_js_1.config.REDIS_PASSWORD || undefined,
    },
    clusterRetryStrategy: function (times) { return Math.min(times * 100, 3000); },
    enableReadyCheck: true,
    scaleReads: "slave", // scale read queries to slaves
};
var redisClient;
var createRedisClient = function () {
    if (index_js_1.config.NODE_ENV === "production" && process.env.REDIS_CLUSTER === "true") {
        // Provide your cluster nodes configuration here
        // In a real environment, this might come from env config like REDIS_CLUSTER_NODES
        var nodes = [
            { host: index_js_1.config.REDIS_HOST, port: index_js_1.config.REDIS_PORT },
        ];
        redisClient = new ioredis_1.default.Cluster(nodes, clusterOptions);
        logger_js_1.logger.info("Initialized Redis Cluster client");
    }
    else {
        redisClient = new ioredis_1.default(redisOptions);
        logger_js_1.logger.info("Initialized standard Redis client");
    }
    redisClient.on("error", function (err) {
        logger_js_1.logger.error({ err: err }, "Redis connection error");
    });
    redisClient.on("connect", function () {
        logger_js_1.logger.info("Connected to Redis");
    });
    return redisClient;
};
exports.createRedisClient = createRedisClient;
