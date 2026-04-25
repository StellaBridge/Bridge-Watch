"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.redis = void 0;
var redis_js_1 = require("../config/redis.js");
var redis = (0, redis_js_1.createRedisClient)();
exports.redis = redis;
