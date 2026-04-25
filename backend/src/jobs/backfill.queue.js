"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackfillQueue = void 0;
exports.getBackfillQueue = getBackfillQueue;
var bullmq_1 = require("bullmq");
var index_js_1 = require("../config/index.js");
var logger_js_1 = require("../utils/logger.js");
var QUEUE_NAME = "backfill";
var connection = {
    host: index_js_1.config.REDIS_HOST,
    port: index_js_1.config.REDIS_PORT,
    password: index_js_1.config.REDIS_PASSWORD || undefined,
};
var BackfillQueue = /** @class */ (function () {
    function BackfillQueue() {
        this.worker = null;
        this.queue = new bullmq_1.Queue(QUEUE_NAME, {
            connection: connection,
            defaultJobOptions: {
                attempts: index_js_1.config.RETRY_MAX || 3,
                backoff: {
                    type: "exponential",
                    delay: 1000,
                },
                removeOnComplete: {
                    age: 3600,
                    count: 1000,
                },
                removeOnFail: {
                    age: 86400,
                },
            },
        });
        logger_js_1.logger.info({ queueName: QUEUE_NAME }, "Backfill queue initialized");
    }
    BackfillQueue.getInstance = function () {
        if (!BackfillQueue.instance) {
            BackfillQueue.instance = new BackfillQueue();
        }
        return BackfillQueue.instance;
    };
    BackfillQueue.prototype.addJob = function (name_1, data_1) {
        return __awaiter(this, arguments, void 0, function (name, data, options) {
            if (options === void 0) { options = {}; }
            return __generator(this, function (_a) {
                logger_js_1.logger.info({ jobName: name, options: options }, "Enqueuing backfill job");
                return [2 /*return*/, this.queue.add(name, data, options)];
            });
        });
    };
    BackfillQueue.prototype.initWorker = function (processor, onFailed) {
        var _this = this;
        if (this.worker) {
            logger_js_1.logger.warn("Backfill worker already initialized");
            return;
        }
        this.worker = new bullmq_1.Worker(QUEUE_NAME, processor, {
            connection: connection,
            concurrency: index_js_1.config.BACKFILL_QUEUE_CONCURRENCY,
        });
        this.worker.on("completed", function (job) {
            logger_js_1.logger.info({ jobId: job.id, jobName: job.name }, "Backfill job completed");
        });
        this.worker.on("failed", function (job, err) { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        logger_js_1.logger.error({ jobId: job === null || job === void 0 ? void 0 : job.id, jobName: job === null || job === void 0 ? void 0 : job.name, error: err.message }, "Backfill job failed");
                        if (!(job && onFailed)) return [3 /*break*/, 2];
                        return [4 /*yield*/, onFailed(job, err)];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2: return [2 /*return*/];
                }
            });
        }); });
    };
    BackfillQueue.prototype.stop = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.worker) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.worker.close()];
                    case 1:
                        _a.sent();
                        this.worker = null;
                        logger_js_1.logger.info("Backfill worker stopped");
                        _a.label = 2;
                    case 2: return [4 /*yield*/, this.queue.close()];
                    case 3:
                        _a.sent();
                        logger_js_1.logger.info("Backfill queue closed");
                        return [2 /*return*/];
                }
            });
        });
    };
    return BackfillQueue;
}());
exports.BackfillQueue = BackfillQueue;
function getBackfillQueue() {
    return BackfillQueue.getInstance();
}
