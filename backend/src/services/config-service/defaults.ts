import { ConfigKey } from "./validators.js";

/**
 * Safe Default Configuration Values
 * Issue: #377
 * 
 * Embedded production-safe defaults for all configuration keys.
 * These values are used as a last resort when:
 * 1. Environment-specific config is not found
 * 2. Global config is not found
 * 3. No value exists in the database
 * 
 * This prevents application crashes due to missing configuration.
 */

export const SAFE_DEFAULTS: Partial<Record<ConfigKey, any>> = {
  // Application
  NODE_ENV: "development",
  PORT: 3001,
  WS_PORT: 3002,

  // PostgreSQL + TimescaleDB
  POSTGRES_HOST: "localhost",
  POSTGRES_PORT: 5432,
  POSTGRES_DB: "bridge_watch",
  POSTGRES_USER: "bridge_watch",
  POSTGRES_PASSWORD: "bridge_watch_dev",

  // Redis
  REDIS_HOST: "localhost",
  REDIS_PORT: 6379,
  REDIS_PASSWORD: "",
  REDIS_CACHE_TTL_SEC: 300,
  REDIS_CLUSTER: false,

  // Stellar Network
  STELLAR_NETWORK: "testnet",
  STELLAR_HORIZON_URL: "https://horizon-testnet.stellar.org",
  SOROBAN_RPC_URL: "https://soroban-testnet.stellar.org",
  HORIZON_TIMEOUT_MS: 30000,

  // Ethereum / EVM Chains
  RPC_PROVIDER_TYPE: "http",

  // External APIs
  CIRCLE_API_URL: "https://api.circle.com",
  CIRCLE_API_TIMEOUT_MS: 5000,
  CIRCLE_CACHE_TTL_SEC: 60,
  CIRCLE_RATE_LIMIT_MAX: 30,
  CIRCLE_RATE_LIMIT_WINDOW_MS: 60000,

  // Rate Limiting
  RATE_LIMIT_MAX: 100,
  RATE_LIMIT_WINDOW_MS: 60000,
  RATE_LIMIT_BURST_MULTIPLIER: 0.1,
  RATE_LIMIT_ENABLE_DYNAMIC: true,
  RATE_LIMIT_GLOBAL_ALERT_THRESHOLD: 0.9,
  RATE_LIMIT_BURST_ALERT_THRESHOLD: 0.8,
  RATE_LIMIT_SUSTAINED_ALERT_THRESHOLD: 0.7,
  RATE_LIMIT_STATS_RETENTION_HOURS: 168,
  RATE_LIMIT_ENABLE_MONITORING: true,
  RATE_LIMIT_ADMIN_API_KEY_PREFIX: "admin_",
  RATE_LIMIT_ENDPOINT_ASSETS: 200,
  RATE_LIMIT_ENDPOINT_BRIDGES: 150,
  RATE_LIMIT_ENDPOINT_ALERTS: 50,
  RATE_LIMIT_ENDPOINT_ANALYTICS: 100,
  RATE_LIMIT_ENDPOINT_CONFIG: 30,
  RATE_LIMIT_ENDPOINT_HEALTH: 1000,

  // Alert Thresholds
  PRICE_DEVIATION_THRESHOLD: 0.02,
  BRIDGE_SUPPLY_MISMATCH_THRESHOLD: 0.1,

  // Verification & Retries
  RETRY_MAX: 3,
  BRIDGE_VERIFICATION_INTERVAL_MS: 300000,

  // Price Aggregation
  REDIS_PRICE_CACHE_PREFIX: "price:aggregated",

  // Health Score Weights (must sum to 1.0)
  HEALTH_WEIGHT_LIQUIDITY: 0.25,
  HEALTH_WEIGHT_PRICE: 0.25,
  HEALTH_WEIGHT_BRIDGE: 0.2,
  HEALTH_WEIGHT_RESERVES: 0.2,
  HEALTH_WEIGHT_VOLUME: 0.1,

  // Export Service
  EXPORT_STORAGE_PATH: "./exports",
  EXPORT_DOWNLOAD_URL_EXPIRY_HOURS: 24,
  EXPORT_COMPRESSION_THRESHOLD_BYTES: 1048576,
  EXPORT_STREAMING_PAGE_SIZE: 1000,
  EXPORT_STREAMING_MAX_ROWS: 0,
  EXPORT_QUEUE_CONCURRENCY: 3,
  EXPORT_MAX_DATE_RANGE_DAYS: 90,

  // Logging
  LOG_LEVEL: "info",
  LOG_MAX_FILE_SIZE: 104857600,
  LOG_MAX_FILES: 10,
  LOG_RETENTION_DAYS: 30,
  LOG_REQUEST_BODY: false,
  LOG_RESPONSE_BODY: false,
  LOG_SENSITIVE_DATA: false,
  REQUEST_SLOW_THRESHOLD_MS: 1000,

  // Email Configuration
  SMTP_PORT: 587,
  SMTP_SECURE: false,
  SMTP_FROM_ADDRESS: "noreply@bridgewatch.io",
  SMTP_FROM_NAME: "Bridge Watch",

  // Health Check Configuration
  HEALTH_CHECK_TIMEOUT_MS: 5000,
  HEALTH_CHECK_INTERVAL_MS: 30000,
  HEALTH_CHECK_MEMORY_THRESHOLD: 90,
  HEALTH_CHECK_DISK_THRESHOLD: 80,
  HEALTH_CHECK_EXTERNAL_APIS: true,

  // Data Validation Configuration
  VALIDATION_STRICT_MODE: false,
  VALIDATION_ADMIN_BYPASS: true,
  VALIDATION_BATCH_SIZE: 100,
  VALIDATION_MAX_BATCH_SIZE: 1000,
  VALIDATION_DUPLICATE_CHECK: true,
  VALIDATION_NORMALIZATION: true,
  VALIDATION_CONSISTENCY_CHECKS: true,
  VALIDATION_ERROR_THRESHOLD: 0.1,
  VALIDATION_WARNING_THRESHOLD: 0.3,
  VALIDATION_DATA_QUALITY_THRESHOLD: 70,
};

/**
 * Get safe default value for a configuration key
 */
export function getSafeDefault<K extends ConfigKey>(key: K): any | undefined {
  return SAFE_DEFAULTS[key];
}

/**
 * Check if a safe default exists for a configuration key
 */
export function hasSafeDefault(key: ConfigKey): boolean {
  return key in SAFE_DEFAULTS;
}

/**
 * Get all safe defaults
 */
export function getAllSafeDefaults(): Partial<Record<ConfigKey, any>> {
  return { ...SAFE_DEFAULTS };
}
