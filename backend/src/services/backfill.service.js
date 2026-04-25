"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
exports.BackfillService = void 0;
var crypto_1 = require("crypto");
var redis_js_1 = require("../utils/redis.js");
var index_js_1 = require("../config/index.js");
var audit_service_js_1 = require("./audit.service.js");
var transaction_service_js_1 = require("./transaction.service.js");
var backfill_queue_js_1 = require("../jobs/backfill.queue.js");
var logger_js_1 = require("../utils/logger.js");
var JOB_KEY_PREFIX = "backfill:job:";
var JOB_LIST_KEY = "backfill:jobs";
var JOB_ERRORS_SUFFIX = ":errors";
var BackfillService = /** @class */ (function () {
    function BackfillService() {
        this.transactionService = new transaction_service_js_1.TransactionService();
        this.auditService = audit_service_js_1.AuditService.getInstance();
        this.queue = (0, backfill_queue_js_1.getBackfillQueue)();
    }
    BackfillService.prototype.getJobKey = function (jobId) {
        return "".concat(JOB_KEY_PREFIX).concat(jobId);
    };
    BackfillService.prototype.getErrorListKey = function (jobId) {
        return "".concat(this.getJobKey(jobId)).concat(JOB_ERRORS_SUFFIX);
    };
    BackfillService.prototype.normalizePageSize = function (pageSize) {
        return Math.min(Math.max(pageSize !== null && pageSize !== void 0 ? pageSize : index_js_1.config.BACKFILL_PAGE_SIZE, 1), 200);
    };
    BackfillService.prototype.normalizeChunkPages = function (chunkPages) {
        return Math.max(chunkPages !== null && chunkPages !== void 0 ? chunkPages : index_js_1.config.BACKFILL_CHUNK_PAGES, 1);
    };
    BackfillService.prototype.normalizeRequestedPages = function (pages) {
        return Math.max(pages !== null && pages !== void 0 ? pages : index_js_1.config.BACKFILL_DEFAULT_MAX_PAGES, 1);
    };
    BackfillService.prototype.getPriorityValue = function (priority) {
        return priority === "high" ? 1 : 10;
    };
    BackfillService.prototype.saveJobState = function (job) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, Promise.all([
                            redis_js_1.redis.set(this.getJobKey(job.id), JSON.stringify(job)),
                            redis_js_1.redis.sadd(JOB_LIST_KEY, job.id),
                        ])];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    BackfillService.prototype.loadJobState = function (jobId) {
        return __awaiter(this, void 0, void 0, function () {
            var raw;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, redis_js_1.redis.get(this.getJobKey(jobId))];
                    case 1:
                        raw = _a.sent();
                        if (!raw)
                            return [2 /*return*/, null];
                        return [2 /*return*/, JSON.parse(raw)];
                }
            });
        });
    };
    BackfillService.prototype.appendError = function (jobId, message) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, redis_js_1.redis.rpush(this.getErrorListKey(jobId), message)];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    BackfillService.prototype.getErrorHistory = function (jobId) {
        return __awaiter(this, void 0, void 0, function () {
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, redis_js_1.redis.lrange(this.getErrorListKey(jobId), 0, -1)];
                    case 1: return [2 /*return*/, (_a = (_b.sent())) !== null && _a !== void 0 ? _a : []];
                }
            });
        });
    };
    BackfillService.prototype.computeProgress = function (state) {
        var percent = state.requestedPages === 0
            ? 100
            : Math.min(100, Math.round(((state.pagesCompleted / state.requestedPages) * 100)));
        return { percent: percent };
    };
    BackfillService.prototype.createTransactionBackfill = function (request) {
        return __awaiter(this, void 0, void 0, function () {
            var jobId, pageSize, chunkPages, requestedPages, initialCursor, priority, state, firstChunkPages;
            var _a, _b, _c, _d;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        jobId = crypto_1.default.randomUUID();
                        pageSize = this.normalizePageSize(request.pageSize);
                        chunkPages = this.normalizeChunkPages(request.chunkPages);
                        requestedPages = this.normalizeRequestedPages(request.pages);
                        initialCursor = (_b = (_a = request.cursor) === null || _a === void 0 ? void 0 : _a.trim()) !== null && _b !== void 0 ? _b : "";
                        priority = (_c = request.priority) !== null && _c !== void 0 ? _c : "normal";
                        state = {
                            id: jobId,
                            type: "transactions",
                            status: "pending",
                            assetCode: request.assetCode,
                            assetIssuer: request.assetIssuer,
                            bridgeName: request.bridgeName,
                            operationTypes: (_d = request.operationTypes) !== null && _d !== void 0 ? _d : [],
                            cursor: initialCursor,
                            pageSize: pageSize,
                            chunkPages: chunkPages,
                            requestedPages: requestedPages,
                            pagesCompleted: 0,
                            pagesRemaining: requestedPages,
                            recordsFetched: 0,
                            recordsStored: 0,
                            errorCount: 0,
                            priority: priority,
                            providerDelayMs: index_js_1.config.BACKFILL_PROVIDER_DELAY_MS,
                            createdAt: new Date().toISOString(),
                            updatedAt: new Date().toISOString(),
                        };
                        return [4 /*yield*/, this.saveJobState(state)];
                    case 1:
                        _e.sent();
                        return [4 /*yield*/, this.auditService.log({
                                action: "data.created",
                                actorId: "system",
                                actorType: "system",
                                resourceType: "backfill_job",
                                resourceId: jobId,
                                metadata: {
                                    assetCode: state.assetCode,
                                    assetIssuer: state.assetIssuer,
                                    requestedPages: state.requestedPages,
                                    chunkPages: state.chunkPages,
                                    priority: state.priority,
                                },
                                severity: "info",
                            })];
                    case 2:
                        _e.sent();
                        firstChunkPages = Math.min(chunkPages, requestedPages);
                        return [4 /*yield*/, this.queue.addJob("backfill-chunk", {
                                jobId: jobId,
                                assetCode: request.assetCode,
                                assetIssuer: request.assetIssuer,
                                bridgeName: request.bridgeName,
                                operationTypes: state.operationTypes,
                                cursor: initialCursor,
                                pages: firstChunkPages,
                                pageSize: pageSize,
                            }, {
                                priority: this.getPriorityValue(priority),
                            })];
                    case 3:
                        _e.sent();
                        return [2 /*return*/, { jobId: jobId, status: state.status }];
                }
            });
        });
    };
    BackfillService.prototype.getJobStatus = function (jobId) {
        return __awaiter(this, void 0, void 0, function () {
            var state, _a;
            var _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, this.loadJobState(jobId)];
                    case 1:
                        state = _c.sent();
                        if (!state)
                            return [2 /*return*/, null];
                        _a = [__assign({}, state)];
                        _b = {};
                        return [4 /*yield*/, this.getErrorHistory(jobId)];
                    case 2: return [2 /*return*/, __assign.apply(void 0, _a.concat([(_b.errors = _c.sent(), _b.progress = this.computeProgress(state), _b)]))];
                }
            });
        });
    };
    BackfillService.prototype.listBackfillJobs = function () {
        return __awaiter(this, void 0, void 0, function () {
            var ids, jobs;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, redis_js_1.redis.smembers(JOB_LIST_KEY)];
                    case 1:
                        ids = _a.sent();
                        return [4 /*yield*/, Promise.all(ids.map(function (id) { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                                return [2 /*return*/, this.getJobStatus(id)];
                            }); }); }))];
                    case 2:
                        jobs = _a.sent();
                        return [2 /*return*/, jobs.filter(function (job) { return job !== null; })];
                }
            });
        });
    };
    BackfillService.prototype.resumeBackfillJob = function (jobId) {
        return __awaiter(this, void 0, void 0, function () {
            var state, nextPages, _a;
            var _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, this.loadJobState(jobId)];
                    case 1:
                        state = _c.sent();
                        if (!state)
                            return [2 /*return*/, null];
                        if (state.status === "completed")
                            return [2 /*return*/, state];
                        if (!(state.pagesRemaining <= 0)) return [3 /*break*/, 3];
                        state.status = "completed";
                        state.updatedAt = new Date().toISOString();
                        return [4 /*yield*/, this.saveJobState(state)];
                    case 2:
                        _c.sent();
                        return [2 /*return*/, state];
                    case 3:
                        state.status = "pending";
                        state.updatedAt = new Date().toISOString();
                        return [4 /*yield*/, this.saveJobState(state)];
                    case 4:
                        _c.sent();
                        return [4 /*yield*/, this.auditService.log({
                                action: "data.updated",
                                actorId: "system",
                                actorType: "system",
                                resourceType: "backfill_job",
                                resourceId: jobId,
                                metadata: {
                                    status: state.status,
                                    pagesRemaining: state.pagesRemaining,
                                },
                                severity: "info",
                            })];
                    case 5:
                        _c.sent();
                        nextPages = Math.min(state.chunkPages, state.pagesRemaining);
                        return [4 /*yield*/, this.queue.addJob("backfill-chunk", {
                                jobId: jobId,
                                assetCode: state.assetCode,
                                assetIssuer: state.assetIssuer,
                                bridgeName: state.bridgeName,
                                operationTypes: state.operationTypes,
                                cursor: state.cursor,
                                pages: nextPages,
                                pageSize: state.pageSize,
                            }, {
                                priority: this.getPriorityValue(state.priority),
                            })];
                    case 6:
                        _c.sent();
                        _a = [__assign({}, state)];
                        _b = {};
                        return [4 /*yield*/, this.getErrorHistory(jobId)];
                    case 7: return [2 /*return*/, __assign.apply(void 0, _a.concat([(_b.errors = _c.sent(), _b.progress = this.computeProgress(state), _b)]))];
                }
            });
        });
    };
    BackfillService.prototype.processBackfillChunk = function (payload) {
        return __awaiter(this, void 0, void 0, function () {
            var state, fetchResult, nextChunkPages, error_1;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, this.loadJobState(payload.jobId)];
                    case 1:
                        state = _c.sent();
                        if (!state) {
                            throw new Error("Backfill job not found: ".concat(payload.jobId));
                        }
                        if (state.status === "completed" || state.status === "cancelled") {
                            logger_js_1.logger.info({ jobId: payload.jobId }, "Skipping chunk for completed or cancelled job");
                            return [2 /*return*/];
                        }
                        state.status = "running";
                        state.updatedAt = new Date().toISOString();
                        return [4 /*yield*/, this.saveJobState(state)];
                    case 2:
                        _c.sent();
                        _c.label = 3;
                    case 3:
                        _c.trys.push([3, 11, , 14]);
                        return [4 /*yield*/, this.transactionService.backfillAssetTransactions(payload.assetCode, payload.assetIssuer, {
                                bridgeName: payload.bridgeName,
                                cursor: payload.cursor,
                                operationTypes: payload.operationTypes,
                                pages: payload.pages,
                                pageSize: payload.pageSize,
                            })];
                    case 4:
                        fetchResult = _c.sent();
                        state.pagesCompleted += payload.pages;
                        state.pagesRemaining = Math.max(state.pagesRemaining - payload.pages, 0);
                        state.recordsFetched += fetchResult.fetched;
                        state.recordsStored += fetchResult.stored;
                        state.cursor = (_a = fetchResult.lastCursor) !== null && _a !== void 0 ? _a : payload.cursor;
                        state.updatedAt = new Date().toISOString();
                        if (!(state.pagesRemaining <= 0 || !fetchResult.lastCursor)) return [3 /*break*/, 7];
                        state.status = "completed";
                        return [4 /*yield*/, this.auditService.log({
                                action: "data.updated",
                                actorId: "system",
                                actorType: "system",
                                resourceType: "backfill_job",
                                resourceId: state.id,
                                metadata: { status: state.status },
                                severity: "info",
                            })];
                    case 5:
                        _c.sent();
                        return [4 /*yield*/, this.saveJobState(state)];
                    case 6:
                        _c.sent();
                        return [2 /*return*/];
                    case 7: return [4 /*yield*/, this.saveJobState(state)];
                    case 8:
                        _c.sent();
                        return [4 /*yield*/, this.sleep(state.providerDelayMs)];
                    case 9:
                        _c.sent();
                        nextChunkPages = Math.min(state.chunkPages, state.pagesRemaining);
                        return [4 /*yield*/, this.queue.addJob("backfill-chunk", {
                                jobId: state.id,
                                assetCode: state.assetCode,
                                assetIssuer: state.assetIssuer,
                                bridgeName: state.bridgeName,
                                operationTypes: state.operationTypes,
                                cursor: state.cursor,
                                pages: nextChunkPages,
                                pageSize: state.pageSize,
                            }, {
                                priority: this.getPriorityValue(state.priority),
                            })];
                    case 10:
                        _c.sent();
                        return [3 /*break*/, 14];
                    case 11:
                        error_1 = _c.sent();
                        state.errorCount += 1;
                        state.updatedAt = new Date().toISOString();
                        return [4 /*yield*/, this.appendError(state.id, String((_b = error_1.message) !== null && _b !== void 0 ? _b : "unknown error"))];
                    case 12:
                        _c.sent();
                        return [4 /*yield*/, this.saveJobState(state)];
                    case 13:
                        _c.sent();
                        throw error_1;
                    case 14: return [2 /*return*/];
                }
            });
        });
    };
    BackfillService.prototype.markJobFailed = function (jobId, failureMessage) {
        return __awaiter(this, void 0, void 0, function () {
            var state;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.loadJobState(jobId)];
                    case 1:
                        state = _a.sent();
                        if (!state)
                            return [2 /*return*/];
                        state.status = "failed";
                        state.errorCount += 1;
                        state.updatedAt = new Date().toISOString();
                        return [4 /*yield*/, this.appendError(jobId, failureMessage)];
                    case 2:
                        _a.sent();
                        return [4 /*yield*/, this.saveJobState(state)];
                    case 3:
                        _a.sent();
                        return [4 /*yield*/, this.auditService.log({
                                action: "data.updated",
                                actorId: "system",
                                actorType: "system",
                                resourceType: "backfill_job",
                                resourceId: jobId,
                                metadata: {
                                    status: state.status,
                                    error: failureMessage,
                                },
                                severity: "warning",
                            })];
                    case 4:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    BackfillService.prototype.sleep = function (ms) {
        return new Promise(function (resolve) { return setTimeout(resolve, ms); });
    };
    return BackfillService;
}());
exports.BackfillService = BackfillService;
