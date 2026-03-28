import pino from "pino";
import { config } from "../config/index.js";

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
    hostname: require('os').hostname(),
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
export function createChildLogger(component: string, metadata?: Record<string, any>) {
  return logger.child({
    component,
    ...metadata,
  });
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
