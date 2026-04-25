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
exports.TransactionService = void 0;
var StellarSdk = require("@stellar/stellar-sdk");
var connection_js_1 = require("../database/connection.js");
var index_js_1 = require("../config/index.js");
var logger_js_1 = require("../utils/logger.js");
var HORIZON_REQUEST_DELAY_MS = 120;
var DEFAULT_PAGE_SIZE = 200;
var TransactionService = /** @class */ (function () {
    function TransactionService() {
        this.db = (0, connection_js_1.getDatabase)();
        this.horizon = new StellarSdk.Horizon.Server(index_js_1.config.STELLAR_HORIZON_URL, {
            allowHttp: index_js_1.config.NODE_ENV === "development",
        });
    }
    TransactionService.prototype.fetchTransactionsByAsset = function (assetCode_1, assetIssuer_1) {
        return __awaiter(this, arguments, void 0, function (assetCode, assetIssuer, options) {
            var pageSize, maxPages, allowedTypes, includeAllTypes, cursor, _a, fetched, stored, pagesRead, lastCursor, asset, requestBase, requestBuilder, page, records, parsed, newest, token, error_1, message;
            var _this = this;
            var _b, _c, _d, _e, _f, _g, _h, _j;
            if (options === void 0) { options = {}; }
            return __generator(this, function (_k) {
                switch (_k.label) {
                    case 0:
                        pageSize = Math.min(Math.max((_b = options.pageSize) !== null && _b !== void 0 ? _b : DEFAULT_PAGE_SIZE, 1), DEFAULT_PAGE_SIZE);
                        maxPages = Math.max((_c = options.maxPages) !== null && _c !== void 0 ? _c : 1, 1);
                        allowedTypes = new Set(((_d = options.operationTypes) !== null && _d !== void 0 ? _d : []).map(function (type) { return type.toLowerCase(); }));
                        includeAllTypes = allowedTypes.size === 0;
                        if (!((_e = options.cursor) !== null && _e !== void 0)) return [3 /*break*/, 1];
                        _a = _e;
                        return [3 /*break*/, 3];
                    case 1: return [4 /*yield*/, this.getSavedCursor(assetCode, assetIssuer)];
                    case 2:
                        _a = (_k.sent());
                        _k.label = 3;
                    case 3:
                        cursor = (_f = _a) !== null && _f !== void 0 ? _f : "now";
                        fetched = 0;
                        stored = 0;
                        pagesRead = 0;
                        lastCursor = null;
                        _k.label = 4;
                    case 4:
                        _k.trys.push([4, 12, , 14]);
                        _k.label = 5;
                    case 5:
                        if (!(pagesRead < maxPages)) return [3 /*break*/, 10];
                        asset = new StellarSdk.Asset(assetCode, assetIssuer);
                        requestBase = this.horizon.payments()
                            .forAsset(asset)
                            .order((_g = options.order) !== null && _g !== void 0 ? _g : "desc")
                            .limit(pageSize);
                        requestBuilder = cursor && requestBase.cursor
                            ? requestBase.cursor(cursor)
                            : requestBase;
                        return [4 /*yield*/, requestBuilder.call()];
                    case 6:
                        page = _k.sent();
                        records = page.records;
                        if (!records.length) {
                            return [3 /*break*/, 10];
                        }
                        fetched += records.length;
                        parsed = records
                            .filter(function (record) {
                            var _a;
                            var operationType = String((_a = record.type) !== null && _a !== void 0 ? _a : "").toLowerCase();
                            return includeAllTypes || allowedTypes.has(operationType);
                        })
                            .map(function (record) { return _this.parsePaymentRecord(record, assetCode, assetIssuer, options.bridgeName); });
                        if (!(parsed.length > 0)) return [3 /*break*/, 8];
                        return [4 /*yield*/, this.upsertTransactions(parsed)];
                    case 7:
                        _k.sent();
                        stored += parsed.length;
                        _k.label = 8;
                    case 8:
                        newest = records[records.length - 1];
                        token = String((_h = newest === null || newest === void 0 ? void 0 : newest.paging_token) !== null && _h !== void 0 ? _h : "").trim();
                        if (!token) {
                            return [3 /*break*/, 10];
                        }
                        cursor = token;
                        lastCursor = token;
                        pagesRead += 1;
                        return [4 /*yield*/, this.sleep(HORIZON_REQUEST_DELAY_MS)];
                    case 9:
                        _k.sent();
                        if (records.length < pageSize) {
                            return [3 /*break*/, 10];
                        }
                        return [3 /*break*/, 5];
                    case 10: return [4 /*yield*/, this.saveSyncState(assetCode, assetIssuer, {
                            last_paging_token: lastCursor,
                            error_count: 0,
                            last_error: null,
                        })];
                    case 11:
                        _k.sent();
                        return [2 /*return*/, { fetched: fetched, stored: stored, lastCursor: lastCursor }];
                    case 12:
                        error_1 = _k.sent();
                        message = (_j = error_1.message) !== null && _j !== void 0 ? _j : "unknown transaction fetch error";
                        logger_js_1.logger.error({ assetCode: assetCode, assetIssuer: assetIssuer, error: error_1 }, "Failed to fetch transaction history from Horizon");
                        return [4 /*yield*/, this.bumpSyncError(assetCode, assetIssuer, message)];
                    case 13:
                        _k.sent();
                        throw error_1;
                    case 14: return [2 /*return*/];
                }
            });
        });
    };
    TransactionService.prototype.backfillAssetTransactions = function (assetCode_1, assetIssuer_1) {
        return __awaiter(this, arguments, void 0, function (assetCode, assetIssuer, options) {
            var _a, _b, _c;
            if (options === void 0) { options = {}; }
            return __generator(this, function (_d) {
                return [2 /*return*/, this.fetchTransactionsByAsset(assetCode, assetIssuer, __assign(__assign({}, options), { order: "asc", maxPages: (_b = (_a = options.pages) !== null && _a !== void 0 ? _a : options.maxPages) !== null && _b !== void 0 ? _b : 25, cursor: (_c = options.cursor) !== null && _c !== void 0 ? _c : "" }))];
            });
        });
    };
    TransactionService.prototype.detectNewTransactions = function (assetCode, assetIssuer, operationTypes) {
        return __awaiter(this, void 0, void 0, function () {
            var cursor;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getSavedCursor(assetCode, assetIssuer)];
                    case 1:
                        cursor = _a.sent();
                        return [2 /*return*/, this.fetchTransactionsByAsset(assetCode, assetIssuer, {
                                cursor: cursor !== null && cursor !== void 0 ? cursor : "now",
                                order: "asc",
                                maxPages: 3,
                                operationTypes: operationTypes,
                            })];
                }
            });
        });
    };
    TransactionService.prototype.listTransactions = function (filters, page, pageSize) {
        return __awaiter(this, void 0, void 0, function () {
            var safePage, safePageSize, offset, query, totalRow, total, rows;
            var _this = this;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        safePage = Math.max(page, 1);
                        safePageSize = Math.min(Math.max(pageSize, 1), 100);
                        offset = (safePage - 1) * safePageSize;
                        query = this.db("asset_transactions");
                        this.applyFilters(query, filters);
                        return [4 /*yield*/, query.clone().count("id as count").first()];
                    case 1:
                        totalRow = _b.sent();
                        total = Number((_a = totalRow === null || totalRow === void 0 ? void 0 : totalRow.count) !== null && _a !== void 0 ? _a : 0);
                        return [4 /*yield*/, query
                                .clone()
                                .select("*")
                                .orderBy("occurred_at", "desc")
                                .limit(safePageSize)
                                .offset(offset)];
                    case 2:
                        rows = (_b.sent());
                        return [2 /*return*/, {
                                transactions: rows.map(function (row) { return _this.mapRow(row); }),
                                total: total,
                                page: safePage,
                                pageSize: safePageSize,
                                totalPages: Math.max(1, Math.ceil(total / safePageSize)),
                            }];
                }
            });
        });
    };
    TransactionService.prototype.exportTransactionsCsv = function (filters) {
        return __awaiter(this, void 0, void 0, function () {
            var query, rows, header, csvRows;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        query = this.db("asset_transactions").select("*").orderBy("occurred_at", "desc");
                        this.applyFilters(query, filters);
                        return [4 /*yield*/, query];
                    case 1:
                        rows = (_a.sent());
                        header = [
                            "id",
                            "txHash",
                            "bridge",
                            "asset",
                            "operationType",
                            "status",
                            "amount",
                            "fee",
                            "senderAddress",
                            "recipientAddress",
                            "timestamp",
                        ];
                        csvRows = rows.map(function (row) {
                            var mapped = _this.mapRow(row);
                            return [
                                mapped.id,
                                mapped.txHash,
                                mapped.bridge,
                                mapped.asset,
                                mapped.operationType,
                                mapped.status,
                                mapped.amount,
                                mapped.fee,
                                mapped.senderAddress,
                                mapped.recipientAddress,
                                mapped.timestamp,
                            ]
                                .map(function (value) { return _this.escapeCsv(String(value !== null && value !== void 0 ? value : "")); })
                                .join(",");
                        });
                        return [2 /*return*/, __spreadArray([header.join(",")], csvRows, true).join("\n")];
                }
            });
        });
    };
    TransactionService.prototype.getSyncState = function (assetCode, assetIssuer) {
        return __awaiter(this, void 0, void 0, function () {
            var state;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.db("asset_transaction_sync_state")
                            .select("*")
                            .where({ asset_code: assetCode, asset_issuer: assetIssuer })
                            .first()];
                    case 1:
                        state = _a.sent();
                        return [2 /*return*/, state !== null && state !== void 0 ? state : null];
                }
            });
        });
    };
    TransactionService.prototype.parsePaymentRecord = function (operation, assetCode, assetIssuer, bridgeName) {
        var _a, _b, _c, _d, _e, _f;
        var now = new Date();
        var transactionHash = String((_a = operation.transaction_hash) !== null && _a !== void 0 ? _a : "");
        var status = operation.transaction_successful === true ? "completed" : "failed";
        return {
            bridge_name: bridgeName !== null && bridgeName !== void 0 ? bridgeName : null,
            asset_code: assetCode,
            asset_issuer: assetIssuer,
            transaction_hash: transactionHash,
            operation_id: String((_b = operation.id) !== null && _b !== void 0 ? _b : transactionHash),
            operation_type: String((_c = operation.type) !== null && _c !== void 0 ? _c : "unknown"),
            status: status,
            ledger: operation.ledger ? Number(operation.ledger) : null,
            paging_token: String((_d = operation.paging_token) !== null && _d !== void 0 ? _d : ""),
            source_account: this.valueOrNull(operation.source_account),
            from_address: this.valueOrNull(operation.from),
            to_address: this.valueOrNull(operation.to),
            amount: String((_e = operation.amount) !== null && _e !== void 0 ? _e : "0"),
            fee_charged: "0",
            occurred_at: new Date(String((_f = operation.created_at) !== null && _f !== void 0 ? _f : now.toISOString())),
            raw_transaction: null,
            raw_operation: operation,
            created_at: now,
            updated_at: now,
        };
    };
    TransactionService.prototype.upsertTransactions = function (records) {
        return __awaiter(this, void 0, void 0, function () {
            var index, chunk;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        index = 0;
                        _a.label = 1;
                    case 1:
                        if (!(index < records.length)) return [3 /*break*/, 4];
                        chunk = records.slice(index, index + 100);
                        return [4 /*yield*/, this.db("asset_transactions")
                                .insert(chunk)
                                .onConflict("operation_id")
                                .merge({
                                status: this.db.raw("excluded.status"),
                                bridge_name: this.db.raw("excluded.bridge_name"),
                                fee_charged: this.db.raw("excluded.fee_charged"),
                                raw_operation: this.db.raw("excluded.raw_operation"),
                                updated_at: this.db.fn.now(),
                            })];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3:
                        index += 100;
                        return [3 /*break*/, 1];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    TransactionService.prototype.applyFilters = function (query, filters) {
        if (filters.bridge) {
            query.where("bridge_name", filters.bridge);
        }
        if (filters.asset) {
            query.where("asset_code", filters.asset);
        }
        if (filters.status) {
            query.where("status", filters.status);
        }
        if (filters.operationType) {
            query.where("operation_type", filters.operationType);
        }
        if (filters.dateFrom) {
            query.where("occurred_at", ">=", new Date(filters.dateFrom));
        }
        if (filters.dateTo) {
            query.where("occurred_at", "<=", new Date(filters.dateTo));
        }
        if (filters.search) {
            var term_1 = "%".concat(filters.search.trim(), "%");
            query.andWhere(function (builder) {
                builder
                    .where("transaction_hash", "ilike", term_1)
                    .orWhere("source_account", "ilike", term_1)
                    .orWhere("from_address", "ilike", term_1)
                    .orWhere("to_address", "ilike", term_1);
            });
        }
    };
    TransactionService.prototype.mapRow = function (row) {
        var _a, _b, _c, _d;
        return {
            id: row.id,
            txHash: row.transaction_hash,
            bridge: (_a = row.bridge_name) !== null && _a !== void 0 ? _a : "stellar",
            asset: row.asset_code,
            amount: Number(row.amount),
            sourceChain: "stellar",
            destinationChain: "stellar",
            senderAddress: (_c = (_b = row.from_address) !== null && _b !== void 0 ? _b : row.source_account) !== null && _c !== void 0 ? _c : "",
            recipientAddress: (_d = row.to_address) !== null && _d !== void 0 ? _d : "",
            status: this.normalizeStatus(row.status),
            fee: Number(row.fee_charged),
            timestamp: row.occurred_at.toISOString(),
            confirmedAt: row.status === "completed" ? row.occurred_at.toISOString() : null,
            stellarTxHash: row.transaction_hash,
            ethereumTxHash: null,
            blockNumber: row.ledger ? Number(row.ledger) : null,
            operationType: row.operation_type,
        };
    };
    TransactionService.prototype.normalizeStatus = function (value) {
        if (value === "failed")
            return "failed";
        if (value === "pending")
            return "pending";
        return "completed";
    };
    TransactionService.prototype.valueOrNull = function (value) {
        if (typeof value !== "string")
            return null;
        return value.trim().length > 0 ? value : null;
    };
    TransactionService.prototype.getSavedCursor = function (assetCode, assetIssuer) {
        return __awaiter(this, void 0, void 0, function () {
            var state;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this.getSyncState(assetCode, assetIssuer)];
                    case 1:
                        state = _b.sent();
                        return [2 /*return*/, (_a = state === null || state === void 0 ? void 0 : state.last_paging_token) !== null && _a !== void 0 ? _a : null];
                }
            });
        });
    };
    TransactionService.prototype.saveSyncState = function (assetCode, assetIssuer, update) {
        return __awaiter(this, void 0, void 0, function () {
            var _a, _b, _c, _d, _e, _f, _g, _h;
            return __generator(this, function (_j) {
                switch (_j.label) {
                    case 0: return [4 /*yield*/, this.db("asset_transaction_sync_state")
                            .insert({
                            asset_code: assetCode,
                            asset_issuer: assetIssuer,
                            last_paging_token: (_a = update.last_paging_token) !== null && _a !== void 0 ? _a : null,
                            last_ledger: (_b = update.last_ledger) !== null && _b !== void 0 ? _b : null,
                            error_count: (_c = update.error_count) !== null && _c !== void 0 ? _c : 0,
                            last_error: (_d = update.last_error) !== null && _d !== void 0 ? _d : null,
                            last_synced_at: new Date(),
                            created_at: new Date(),
                            updated_at: new Date(),
                        })
                            .onConflict(["asset_code", "asset_issuer"])
                            .merge({
                            last_paging_token: (_e = update.last_paging_token) !== null && _e !== void 0 ? _e : null,
                            last_ledger: (_f = update.last_ledger) !== null && _f !== void 0 ? _f : null,
                            error_count: (_g = update.error_count) !== null && _g !== void 0 ? _g : 0,
                            last_error: (_h = update.last_error) !== null && _h !== void 0 ? _h : null,
                            last_synced_at: new Date(),
                            updated_at: new Date(),
                        })];
                    case 1:
                        _j.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    TransactionService.prototype.bumpSyncError = function (assetCode, assetIssuer, message) {
        return __awaiter(this, void 0, void 0, function () {
            var existing, nextCount;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, this.getSyncState(assetCode, assetIssuer)];
                    case 1:
                        existing = _c.sent();
                        nextCount = ((_a = existing === null || existing === void 0 ? void 0 : existing.error_count) !== null && _a !== void 0 ? _a : 0) + 1;
                        return [4 /*yield*/, this.saveSyncState(assetCode, assetIssuer, {
                                last_paging_token: (_b = existing === null || existing === void 0 ? void 0 : existing.last_paging_token) !== null && _b !== void 0 ? _b : null,
                                last_ledger: (existing === null || existing === void 0 ? void 0 : existing.last_ledger) ? Number(existing.last_ledger) : null,
                                error_count: nextCount,
                                last_error: message,
                            })];
                    case 2:
                        _c.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    TransactionService.prototype.escapeCsv = function (value) {
        if (value.includes(",") || value.includes("\"") || value.includes("\n")) {
            return "\"".concat(value.replace(/"/g, '""'), "\"");
        }
        return value;
    };
    TransactionService.prototype.sleep = function (ms) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, ms); })];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    return TransactionService;
}());
exports.TransactionService = TransactionService;
