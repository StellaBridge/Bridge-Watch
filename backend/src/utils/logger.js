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
Object.defineProperty(exports, "__esModule", { value: true });
exports.accessLogger = exports.auditLogger = exports.errorLogger = exports.performanceLogger = exports.logger = void 0;
exports.createChildLogger = createChildLogger;
exports.createRequestLogger = createRequestLogger;
var os_1 = require("os");
var pino_1 = require("pino");
var index_js_1 = require("../config/index.js");
function isObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function writeFlexibleLog(target, level, args) {
    if (args.length === 0)
        return;
    var first = args[0];
    var second = args[1];
    var third = args[2];
    if (typeof first === "string") {
        if (second instanceof Error) {
            var meta = isObject(third) ? third : {};
            target[level](__assign({ err: second }, meta), first);
            return;
        }
        if (isObject(second)) {
            target[level](second, first);
            return;
        }
        target[level](first);
        return;
    }
    if (first instanceof Error) {
        var msg = typeof second === "string" ? second : first.message;
        var meta = isObject(third) ? third : {};
        target[level](__assign({ err: first }, meta), msg);
        return;
    }
    if (isObject(first)) {
        if (typeof second === "string") {
            target[level](first, second);
            return;
        }
        target[level](first);
        return;
    }
    target[level](first);
}
function makeFlexibleLogger(target) {
    return {
        trace: function () {
            var args = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                args[_i] = arguments[_i];
            }
            return writeFlexibleLog(target, "trace", args);
        },
        debug: function () {
            var args = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                args[_i] = arguments[_i];
            }
            return writeFlexibleLog(target, "debug", args);
        },
        info: function () {
            var args = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                args[_i] = arguments[_i];
            }
            return writeFlexibleLog(target, "info", args);
        },
        warn: function () {
            var args = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                args[_i] = arguments[_i];
            }
            return writeFlexibleLog(target, "warn", args);
        },
        error: function () {
            var args = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                args[_i] = arguments[_i];
            }
            return writeFlexibleLog(target, "error", args);
        },
        fatal: function () {
            var args = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                args[_i] = arguments[_i];
            }
            return writeFlexibleLog(target, "fatal", args);
        },
        child: function (bindings) { return makeFlexibleLogger(target.child(bindings)); },
    };
}
// Create base logger configuration
var baseConfig = {
    level: index_js_1.config.LOG_LEVEL,
    formatters: {
        level: function (label) { return ({ level: label }); },
        log: function (object) {
            // Add timestamp if not present
            if (!object.timestamp) {
                object.timestamp = new Date().toISOString();
            }
            return object;
        },
    },
    // Custom redaction for sensitive fields
    redact: {
        paths: [
            'password',
            'token',
            'secret',
            'key',
            'auth',
            'credential',
            'email',
            'phone',
            'ssn',
            'creditCard',
            'account',
            'routing',
            'apikey',
            'api_key',
            'private_key',
            'public_key',
            'certificate',
        ],
        censor: '***REDACTED***',
    },
    // Add service information
    base: {
        service: 'bridge-watch-api',
        version: process.env.npm_package_version || '0.1.0',
        environment: index_js_1.config.NODE_ENV,
        hostname: os_1.default.hostname(),
        pid: process.pid,
    },
};
// Development configuration with pretty printing
var developmentConfig = __assign(__assign({}, baseConfig), { transport: {
        target: "pino-pretty",
        options: {
            colorize: true,
            translateTime: "HH:MM:ss Z",
            ignore: "pid,hostname",
            messageFormat: "{reqId} {msg}",
            customPrettifiers: {
                time: function (timestamp) {
                    return new Date(timestamp).toLocaleString();
                },
            },
        },
    } });
// Production configuration with structured JSON
var productionConfig = __assign(__assign({}, baseConfig), (index_js_1.config.LOG_FILE && {
    transport: {
        target: "pino/file",
        options: {
            destination: index_js_1.config.LOG_FILE,
            mkdir: true,
        },
    },
}));
// Test configuration (minimal output)
var testConfig = __assign(__assign({}, baseConfig), { level: "silent" });
// Select configuration based on environment
var loggerConfig = index_js_1.config.NODE_ENV === "development"
    ? developmentConfig
    : index_js_1.config.NODE_ENV === "test"
        ? testConfig
        : productionConfig;
exports.logger = (0, pino_1.default)(loggerConfig);
// Export child logger factory for specific components
function createChildLogger(component, metadata) {
    var child = exports.logger.child(__assign({ component: component }, metadata));
    return makeFlexibleLogger(child);
}
// Export request-specific logger factory
function createRequestLogger(requestId, traceContext) {
    return exports.logger.child(__assign({ requestId: requestId }, traceContext));
}
// Export performance logger
exports.performanceLogger = createChildLogger('performance');
// Export error logger
exports.errorLogger = createChildLogger('error');
// Export audit logger for security events
exports.auditLogger = createChildLogger('audit', {
    type: 'security',
});
// Export access logger for API access
exports.accessLogger = createChildLogger('access', {
    type: 'access',
});
