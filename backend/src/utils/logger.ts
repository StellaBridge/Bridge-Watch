import os from "os";
import pino from "pino";
import { config } from "../config/index.js";

type LogMeta = Record<string, unknown>;

export interface FlexibleLogger {
  trace: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  fatal: (...args: unknown[]) => void;
  child: (bindings: LogMeta) => FlexibleLogger;
}

function isObject(value: unknown): value is LogMeta {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function writeFlexibleLog(target: any, level: "trace" | "debug" | "info" | "warn" | "error" | "fatal", args: unknown[]): void {
  if (args.length === 0) return;

  const first = args[0];
  const second = args[1];
  const third = args[2];

  if (typeof first === "string") {
    if (second instanceof Error) {
      const meta = isObject(third) ? third : {};
      target[level]({ err: second, ...meta }, first);
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
    const msg = typeof second === "string" ? second : first.message;
    const meta = isObject(third) ? third : {};
    target[level]({ err: first, ...meta }, msg);
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

  target[level](first as any);
}

function makeFlexibleLogger(target: any): FlexibleLogger {
  return {
    trace: (...args: unknown[]) => writeFlexibleLog(target, "trace", args),
    debug: (...args: unknown[]) => writeFlexibleLog(target, "debug", args),
    info: (...args: unknown[]) => writeFlexibleLog(target, "info", args),
    warn: (...args: unknown[]) => writeFlexibleLog(target, "warn", args),
    error: (...args: unknown[]) => writeFlexibleLog(target, "error", args),
    fatal: (...args: unknown[]) => writeFlexibleLog(target, "fatal", args),
    child: (bindings: LogMeta) => makeFlexibleLogger(target.child(bindings)),
  };
}

// Create base logger configuration
const baseConfig = {
  level: config.LOG_LEVEL,
  formatters: {
    level: (label: string) => ({ level: label }),
    log: (object: any) => {
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
    environment: config.NODE_ENV,
    hostname: os.hostname(),
    pid: process.pid,
  },
};

// Development configuration with pretty printing
const developmentConfig = {
  ...baseConfig,
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "HH:MM:ss Z",
      ignore: "pid,hostname",
      messageFormat: "{reqId} {msg}",
      customPrettifiers: {
        time: (timestamp: string) => {
          return new Date(timestamp).toLocaleString();
        },
      },
    },
  },
};

// Production configuration with structured JSON
const productionConfig = {
  ...baseConfig,
  // Add file transport for production if configured
  ...(config.LOG_FILE && {
    transport: {
      target: "pino/file",
      options: {
        destination: config.LOG_FILE,
        mkdir: true,
      },
    },
  }),
};

// Test configuration (minimal output)
const testConfig = {
  ...baseConfig,
  level: "silent",
};

// Select configuration based on environment
const loggerConfig = config.NODE_ENV === "development" 
  ? developmentConfig 
  : config.NODE_ENV === "test"
  ? testConfig
  : productionConfig;

export const logger = pino(loggerConfig);

// Export child logger factory for specific components
export function createChildLogger(component: string, metadata?: Record<string, any>): FlexibleLogger {
  const child = logger.child({
    component,
    ...metadata,
  });

  return makeFlexibleLogger(child);
}

// Export request-specific logger factory
export function createRequestLogger(requestId: string, traceContext?: any) {
  return logger.child({
    requestId,
    ...traceContext,
  });
}

// Export performance logger
export const performanceLogger = createChildLogger('performance');

// Export error logger
export const errorLogger = createChildLogger('error');

// Export audit logger for security events
export const auditLogger = createChildLogger('audit', {
  type: 'security',
});

// Export access logger for API access
export const accessLogger = createChildLogger('access', {
  type: 'access',
});
