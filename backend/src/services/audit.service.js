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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditService = exports.AuditService = void 0;
var crypto_1 = require("crypto");
var connection_js_1 = require("../database/connection.js");
var logger_js_1 = require("../utils/logger.js");
// =============================================================================
// AUDIT SERVICE
// =============================================================================
var AuditService = /** @class */ (function () {
    function AuditService() {
    }
    AuditService.getInstance = function () {
        if (!AuditService.instance) {
            AuditService.instance = new AuditService();
        }
        return AuditService.instance;
    };
    // ---------------------------------------------------------------------------
    // TAMPER DETECTION
    // ---------------------------------------------------------------------------
    AuditService.prototype.computeChecksum = function (entry) {
        var payload = JSON.stringify({
            action: entry.action,
            actorId: entry.actorId,
            actorType: entry.actorType,
            ipAddress: entry.ipAddress,
            resourceType: entry.resourceType,
            resourceId: entry.resourceId,
            before: entry.before,
            after: entry.after,
            severity: entry.severity,
        });
        return crypto_1.default.createHash("sha256").update(payload).digest("hex");
    };
    AuditService.prototype.verifyChecksum = function (entry) {
        var expected = this.computeChecksum(entry);
        return crypto_1.default.timingSafeEqual(Buffer.from(entry.checksum), Buffer.from(expected));
    };
    // ---------------------------------------------------------------------------
    // LOG
    // ---------------------------------------------------------------------------
    AuditService.prototype.log = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var db, draft, checksum, row;
            var _a, _b, _c, _d, _e, _f, _g, _h, _j;
            return __generator(this, function (_k) {
                switch (_k.label) {
                    case 0:
                        db = (0, connection_js_1.getDatabase)();
                        draft = {
                            action: params.action,
                            actorId: params.actorId,
                            actorType: (_a = params.actorType) !== null && _a !== void 0 ? _a : "user",
                            ipAddress: (_b = params.ipAddress) !== null && _b !== void 0 ? _b : null,
                            userAgent: (_c = params.userAgent) !== null && _c !== void 0 ? _c : null,
                            resourceType: (_d = params.resourceType) !== null && _d !== void 0 ? _d : null,
                            resourceId: (_e = params.resourceId) !== null && _e !== void 0 ? _e : null,
                            before: (_f = params.before) !== null && _f !== void 0 ? _f : null,
                            after: (_g = params.after) !== null && _g !== void 0 ? _g : null,
                            metadata: (_h = params.metadata) !== null && _h !== void 0 ? _h : {},
                            severity: (_j = params.severity) !== null && _j !== void 0 ? _j : this.inferSeverity(params.action),
                        };
                        checksum = this.computeChecksum(draft);
                        return [4 /*yield*/, db("audit_logs")
                                .insert({
                                id: crypto_1.default.randomUUID(),
                                action: draft.action,
                                actor_id: draft.actorId,
                                actor_type: draft.actorType,
                                ip_address: draft.ipAddress,
                                user_agent: draft.userAgent,
                                resource_type: draft.resourceType,
                                resource_id: draft.resourceId,
                                before: draft.before ? JSON.stringify(draft.before) : null,
                                after: draft.after ? JSON.stringify(draft.after) : null,
                                metadata: JSON.stringify(draft.metadata),
                                severity: draft.severity,
                                checksum: checksum,
                                created_at: new Date(),
                            })
                                .returning("*")];
                    case 1:
                        row = (_k.sent())[0];
                        logger_js_1.logger.info({ auditId: row.id, action: draft.action, actorId: draft.actorId, severity: draft.severity }, "Audit event recorded");
                        return [2 /*return*/, this.mapRow(row)];
                }
            });
        });
    };
    // ---------------------------------------------------------------------------
    // QUERY
    // ---------------------------------------------------------------------------
    AuditService.prototype.query = function () {
        return __awaiter(this, arguments, void 0, function (params) {
            var db, limit, offset, query, countQuery, _a, rows, countResult;
            var _b, _c, _d;
            if (params === void 0) { params = {}; }
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        db = (0, connection_js_1.getDatabase)();
                        limit = Math.min((_b = params.limit) !== null && _b !== void 0 ? _b : 100, 1000);
                        offset = (_c = params.offset) !== null && _c !== void 0 ? _c : 0;
                        query = db("audit_logs");
                        countQuery = db("audit_logs");
                        if (params.actorId) {
                            query = query.where("actor_id", params.actorId);
                            countQuery = countQuery.where("actor_id", params.actorId);
                        }
                        if (params.action) {
                            query = query.where("action", params.action);
                            countQuery = countQuery.where("action", params.action);
                        }
                        if (params.resourceType) {
                            query = query.where("resource_type", params.resourceType);
                            countQuery = countQuery.where("resource_type", params.resourceType);
                        }
                        if (params.resourceId) {
                            query = query.where("resource_id", params.resourceId);
                            countQuery = countQuery.where("resource_id", params.resourceId);
                        }
                        if (params.severity) {
                            query = query.where("severity", params.severity);
                            countQuery = countQuery.where("severity", params.severity);
                        }
                        if (params.from) {
                            query = query.where("created_at", ">=", params.from);
                            countQuery = countQuery.where("created_at", ">=", params.from);
                        }
                        if (params.to) {
                            query = query.where("created_at", "<=", params.to);
                            countQuery = countQuery.where("created_at", "<=", params.to);
                        }
                        return [4 /*yield*/, Promise.all([
                                query.orderBy("created_at", "desc").limit(limit).offset(offset),
                                countQuery.count("id as count").first(),
                            ])];
                    case 1:
                        _a = _e.sent(), rows = _a[0], countResult = _a[1];
                        return [2 /*return*/, {
                                entries: rows.map(this.mapRow),
                                total: Number((_d = countResult === null || countResult === void 0 ? void 0 : countResult.count) !== null && _d !== void 0 ? _d : 0),
                            }];
                }
            });
        });
    };
    AuditService.prototype.getEntry = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var db, row;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, connection_js_1.getDatabase)();
                        return [4 /*yield*/, db("audit_logs").where("id", id).first()];
                    case 1:
                        row = _a.sent();
                        return [2 /*return*/, row ? this.mapRow(row) : null];
                }
            });
        });
    };
    // ---------------------------------------------------------------------------
    // STATS
    // ---------------------------------------------------------------------------
    AuditService.prototype.getStats = function (from) {
        return __awaiter(this, void 0, void 0, function () {
            var db, baseQuery, _a, totalRow, severityRows, actionRows, recentRow, bySeverity, _i, severityRows_1, row, byAction, _b, actionRows_1, row;
            var _c, _d;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        db = (0, connection_js_1.getDatabase)();
                        baseQuery = db("audit_logs");
                        if (from)
                            baseQuery = baseQuery.where("created_at", ">=", from);
                        return [4 /*yield*/, Promise.all([
                                baseQuery.clone().count("id as count").first(),
                                baseQuery.clone().select("severity").count("id as count").groupBy("severity"),
                                baseQuery.clone().select("action").count("id as count").groupBy("action").orderBy("count", "desc").limit(20),
                                db("audit_logs")
                                    .where("created_at", ">=", new Date(Date.now() - 3600000))
                                    .count("id as count")
                                    .first(),
                            ])];
                    case 1:
                        _a = _e.sent(), totalRow = _a[0], severityRows = _a[1], actionRows = _a[2], recentRow = _a[3];
                        bySeverity = { info: 0, warning: 0, critical: 0 };
                        for (_i = 0, severityRows_1 = severityRows; _i < severityRows_1.length; _i++) {
                            row = severityRows_1[_i];
                            bySeverity[row.severity] = Number(row.count);
                        }
                        byAction = {};
                        for (_b = 0, actionRows_1 = actionRows; _b < actionRows_1.length; _b++) {
                            row = actionRows_1[_b];
                            byAction[row.action] = Number(row.count);
                        }
                        return [2 /*return*/, {
                                total: Number((_c = totalRow === null || totalRow === void 0 ? void 0 : totalRow.count) !== null && _c !== void 0 ? _c : 0),
                                bySeverity: bySeverity,
                                byAction: byAction,
                                recentCount: Number((_d = recentRow === null || recentRow === void 0 ? void 0 : recentRow.count) !== null && _d !== void 0 ? _d : 0),
                            }];
                }
            });
        });
    };
    // ---------------------------------------------------------------------------
    // EXPORT
    // ---------------------------------------------------------------------------
    AuditService.prototype.exportCsv = function () {
        return __awaiter(this, arguments, void 0, function (params) {
            var entries, header, rows;
            if (params === void 0) { params = {}; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.query(__assign(__assign({}, params), { limit: 10000, offset: 0 }))];
                    case 1:
                        entries = (_a.sent()).entries;
                        header = [
                            "id", "action", "actor_id", "actor_type", "ip_address",
                            "resource_type", "resource_id", "severity", "checksum", "created_at",
                        ].join(",");
                        rows = entries.map(function (e) {
                            var _a, _b, _c;
                            return [
                                e.id,
                                e.action,
                                e.actorId,
                                e.actorType,
                                (_a = e.ipAddress) !== null && _a !== void 0 ? _a : "",
                                (_b = e.resourceType) !== null && _b !== void 0 ? _b : "",
                                (_c = e.resourceId) !== null && _c !== void 0 ? _c : "",
                                e.severity,
                                e.checksum,
                                e.createdAt.toISOString(),
                            ]
                                .map(function (v) { return "\"".concat(String(v).replace(/"/g, '""'), "\""); })
                                .join(",");
                        });
                        return [2 /*return*/, __spreadArray([header], rows, true).join("\n")];
                }
            });
        });
    };
    // ---------------------------------------------------------------------------
    // RETENTION
    // ---------------------------------------------------------------------------
    AuditService.prototype.applyRetentionPolicy = function (retentionDays) {
        return __awaiter(this, void 0, void 0, function () {
            var db, cutoff, deleted;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, connection_js_1.getDatabase)();
                        cutoff = new Date(Date.now() - retentionDays * 86400000);
                        return [4 /*yield*/, db("audit_logs")
                                .where("severity", "info")
                                .where("created_at", "<", cutoff)
                                .delete()];
                    case 1:
                        deleted = _a.sent();
                        logger_js_1.logger.info({ deleted: deleted, cutoff: cutoff, retentionDays: retentionDays }, "Audit log retention policy applied");
                        return [2 /*return*/, deleted];
                }
            });
        });
    };
    // ---------------------------------------------------------------------------
    // HELPERS
    // ---------------------------------------------------------------------------
    AuditService.prototype.inferSeverity = function (action) {
        if (action === "admin.user_permission_changed" ||
            action === "auth.api_key_revoked" ||
            action === "webhook.secret_rotated" ||
            action === "admin.config_changed")
            return "warning";
        if (action === "admin.retention_policy_changed")
            return "critical";
        return "info";
    };
    AuditService.prototype.mapRow = function (row) {
        var _a, _b, _c, _d, _e;
        var parse = function (v) {
            if (!v)
                return null;
            if (typeof v === "object")
                return v;
            try {
                return JSON.parse(v);
            }
            catch (_a) {
                return null;
            }
        };
        return {
            id: row.id,
            action: row.action,
            actorId: row.actor_id,
            actorType: row.actor_type,
            ipAddress: (_a = row.ip_address) !== null && _a !== void 0 ? _a : null,
            userAgent: (_b = row.user_agent) !== null && _b !== void 0 ? _b : null,
            resourceType: (_c = row.resource_type) !== null && _c !== void 0 ? _c : null,
            resourceId: (_d = row.resource_id) !== null && _d !== void 0 ? _d : null,
            before: parse(row.before),
            after: parse(row.after),
            metadata: ((_e = parse(row.metadata)) !== null && _e !== void 0 ? _e : {}),
            severity: row.severity,
            checksum: row.checksum,
            createdAt: row.created_at,
        };
    };
    return AuditService;
}());
exports.AuditService = AuditService;
exports.auditService = AuditService.getInstance();
