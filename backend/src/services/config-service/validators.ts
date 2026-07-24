import { z } from "zod";

/**
 * Zod Validation Schemas for Configuration Service
 * Issue: #377
 * 
 * Defines runtime validation schemas for all 35 environment variables.
 * Each schema ensures type safety and validates constraints.
 */

export const ConfigSchemas = {
  // Application
  NODE_ENV: z.enum(["development", "production", "test", "staging"]),
  PORT: z.number().int().min(1).max(65535),
  WS_PORT: z.number().int().min(1).max(65535),

  // PostgreSQL + TimescaleDB
  POSTGRES_HOST: z.string().min(1),
  POSTGRES_PORT: z.number().int().min(1).max(65535),
  POSTGRES_DB: z.string().min(1),
  POSTGRES_USER: z.string().min(1),
  POSTGRES_PASSWORD: z.string().min(1),

  // Redis
  REDIS_HOST: z.string().min(1),
  REDIS_PORT: z.number().int().min(1).max(65535),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_CACHE_TTL_SEC: z.number().int().min(1).max(86400),
  REDIS_CLUSTER: z.boolean().optional(),

  // Stellar Network
  STELLAR_NETWORK: z.enum(["testnet", "mainnet"]),
  STELLAR_HORIZON_URL: z.string().url(),
  SOROBAN_RPC_URL: z.string().url(),
  SOROBAN_MAINNET_RPC_URL: z.string().url().optional(),
  HORIZON_TIMEOUT_MS: z.number().int().min(100).max(60000),
  CIRCUIT_BREAKER_CONTRACT_ID: z.string().optional(),
  LIQUIDITY_CONTRACT_ADDRESS: z.string().optional(),

  // Ethereum / EVM Chains
  RPC_PROVIDER_TYPE: z.enum(["http", "ws"]),
  ETHEREUM_RPC_URL: z.string().url().optional(),
  ETHEREUM_RPC_WS_URL: z.string().url().optional(),
  ETHEREUM_RPC_FALLBACK_URL: z.string().url().optional(),
  POLYGON_RPC_URL: z.string().url().optional(),
  POLYGON_RPC_FALLBACK_URL: z.string().url().optional(),
  BASE_RPC_URL: z.string().url().optional(),
  BASE_RPC_FALLBACK_URL: z.string().url().optional(),

  // Token & Bridge Addresses
  USDC_TOKEN_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  USDC_BRIDGE_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  EURC_TOKEN_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  EURC_BRIDGE_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),

  // External APIs
  CIRCLE_API_KEY: z.string().min(16).optional(),
  CIRCLE_API_URL: z.string().url(),
  CIRCLE_API_TIMEOUT_MS: z.number().int().min(1000).max(60000),
  CIRCLE_CACHE_TTL_SEC: z.number().int().min(1).max(3600),
  CIRCLE_RATE_LIMIT_MAX: z.number().int().min(1).max(1000),
  CIRCLE_RATE_LIMIT_WINDOW_MS: z.number().int().min(1000).max(3600000),
  COINBASE_API_KEY: z.string().min(16).optional(),
  COINBASE_API_SECRET: z.string().min(16).optional(),
  COINMARKETCAP_API_KEY: z.string().min(16).optional(),
  COINGECKO_API_KEY: z.string().min(16).optional(),
  ONEINCH_API_KEY: z.string().min(16).optional(),

  // Secrets (MUST ENCRYPT)
  JWT_SECRET: z.string().min(32),
  CONFIG_ENCRYPTION_KEY: z.string().min(32),
  WS_AUTH_SECRET: z.string().min(16).optional(),
  API_KEY_BOOTSTRAP_TOKEN: z.string().min(16).optional(),

  // Rate Limiting
  RATE_LIMIT_MAX: z.number().int().min(1).max(10000),
  RATE_LIMIT_WINDOW_MS: z.number().int().min(1000).max(3600000),
  RATE_LIMIT_BURST_MULTIPLIER: z.number().min(0).max(10),
  RATE_LIMIT_WHITELIST_IPS: z.string().optional(),
  RATE_LIMIT_WHITELIST_KEYS: z.string().optional(),
  RATE_LIMIT_ENABLE_DYNAMIC: z.boolean(),
  RATE_LIMIT_GLOBAL_ALERT_THRESHOLD: z.number().min(0).max(1),
  RATE_LIMIT_BURST_ALERT_THRESHOLD: z.number().min(0).max(1),
  RATE_LIMIT_SUSTAINED_ALERT_THRESHOLD: z.number().min(0).max(1),
  RATE_LIMIT_STATS_RETENTION_HOURS: z.number().int().min(1).max(8760),
  RATE_LIMIT_ENABLE_MONITORING: z.boolean(),
  RATE_LIMIT_ADMIN_API_KEY_PREFIX: z.string(),
  RATE_LIMIT_ENDPOINT_ASSETS: z.number().int().min(1).max(10000),
  RATE_LIMIT_ENDPOINT_BRIDGES: z.number().int().min(1).max(10000),
  RATE_LIMIT_ENDPOINT_ALERTS: z.number().int().min(1).max(10000),
  RATE_LIMIT_ENDPOINT_ANALYTICS: z.number().int().min(1).max(10000),
  RATE_LIMIT_ENDPOINT_CONFIG: z.number().int().min(1).max(10000),
  RATE_LIMIT_ENDPOINT_HEALTH: z.number().int().min(1).max(10000),

  // Alert Thresholds
  PRICE_DEVIATION_THRESHOLD: z.number().min(0).max(1),
  BRIDGE_SUPPLY_MISMATCH_THRESHOLD: z.number().min(0).max(1),

  // Verification & Retries
  RETRY_MAX: z.number().int().min(1).max(10),
  BRIDGE_VERIFICATION_INTERVAL_MS: z.number().int().min(10000).max(3600000),

  // Price Aggregation
  REDIS_PRICE_CACHE_PREFIX: z.string(),

  // Health Score Weights (must sum to 1.0)
  HEALTH_WEIGHT_LIQUIDITY: z.number().min(0).max(1),
  HEALTH_WEIGHT_PRICE: z.number().min(0).max(1),
  HEALTH_WEIGHT_BRIDGE: z.number().min(0).max(1),
  HEALTH_WEIGHT_RESERVES: z.number().min(0).max(1),
  HEALTH_WEIGHT_VOLUME: z.number().min(0).max(1),

  // Export Service
  EXPORT_STORAGE_PATH: z.string(),
  EXPORT_DOWNLOAD_URL_EXPIRY_HOURS: z.number().int().min(1).max(168),
  EXPORT_COMPRESSION_THRESHOLD_BYTES: z.number().int().min(0),
  EXPORT_STREAMING_PAGE_SIZE: z.number().int().min(10).max(10000),
  EXPORT_STREAMING_MAX_ROWS: z.number().int().min(0),
  EXPORT_QUEUE_CONCURRENCY: z.number().int().min(1).max(10),
  EXPORT_MAX_DATE_RANGE_DAYS: z.number().int().min(1).max(365),

  // Logging
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]),
  LOG_FILE: z.string().optional(),
  LOG_MAX_FILE_SIZE: z.number().int().min(1024),
  LOG_MAX_FILES: z.number().int().min(1).max(100),
  LOG_RETENTION_DAYS: z.number().int().min(1).max(365),
  LOG_REQUEST_BODY: z.boolean(),
  LOG_RESPONSE_BODY: z.boolean(),
  LOG_SENSITIVE_DATA: z.boolean(),
  REQUEST_SLOW_THRESHOLD_MS: z.number().int().min(100).max(60000),

  // Email Configuration
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.number().int().min(1).max(65535),
  SMTP_SECURE: z.boolean(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM_ADDRESS: z.string().email(),
  SMTP_FROM_NAME: z.string(),

  // Discord Integration
  DISCORD_BOT_TOKEN: z.string().min(16).optional(),
  DISCORD_CLIENT_ID: z.string().optional(),

  // Health Check Configuration
  HEALTH_CHECK_TIMEOUT_MS: z.number().int().min(1000).max(60000),
  HEALTH_CHECK_INTERVAL_MS: z.number().int().min(1000).max(3600000),
  HEALTH_CHECK_MEMORY_THRESHOLD: z.number().int().min(1).max(100),
  HEALTH_CHECK_DISK_THRESHOLD: z.number().int().min(1).max(100),
  HEALTH_CHECK_EXTERNAL_APIS: z.boolean(),

  // Data Validation Configuration
  VALIDATION_STRICT_MODE: z.boolean(),
  VALIDATION_ADMIN_BYPASS: z.boolean(),
  VALIDATION_BATCH_SIZE: z.number().int().min(1).max(10000),
  VALIDATION_MAX_BATCH_SIZE: z.number().int().min(1).max(10000),
  VALIDATION_DUPLICATE_CHECK: z.boolean(),
  VALIDATION_NORMALIZATION: z.boolean(),
  VALIDATION_CONSISTENCY_CHECKS: z.boolean(),
  VALIDATION_ERROR_THRESHOLD: z.number().min(0).max(1),
  VALIDATION_WARNING_THRESHOLD: z.number().min(0).max(1),
  VALIDATION_DATA_QUALITY_THRESHOLD: z.number().int().min(0).max(100),
} as const;

export type ConfigKey = keyof typeof ConfigSchemas;
export type ConfigValue<K extends ConfigKey> = z.infer<typeof ConfigSchemas[K]>;

/**
 * Validate a configuration value against its schema
 */
export function validateConfig<K extends ConfigKey>(
  key: K,
  value: unknown
): ConfigValue<K> {
  const schema = ConfigSchemas[key];
  if (!schema) {
    throw new Error(`No validation schema found for config key: ${key}`);
  }
  return schema.parse(value) as ConfigValue<K>;
}

/**
 * Safely validate a configuration value (returns result object)
 */
export function safeValidateConfig<K extends ConfigKey>(
  key: K,
  value: unknown
): { success: true; data: ConfigValue<K> } | { success: false; error: z.ZodError } {
  const schema = ConfigSchemas[key];
  if (!schema) {
    return {
      success: false,
      error: new z.ZodError([
        {
          code: "custom",
          path: [key],
          message: `No validation schema found for config key: ${key}`,
        },
      ]),
    };
  }
  const result = schema.safeParse(value);
  return result as any;
}

/**
 * List of sensitive configuration keys that must be encrypted
 */
export const SENSITIVE_KEYS: ConfigKey[] = [
  "JWT_SECRET",
  "CONFIG_ENCRYPTION_KEY",
  "WS_AUTH_SECRET",
  "CIRCLE_API_KEY",
  "COINBASE_API_KEY",
  "COINBASE_API_SECRET",
  "COINMARKETCAP_API_KEY",
  "COINGECKO_API_KEY",
  "ONEINCH_API_KEY",
  "DISCORD_BOT_TOKEN",
  "SMTP_PASSWORD",
  "POSTGRES_PASSWORD",
  "REDIS_PASSWORD",
  "API_KEY_BOOTSTRAP_TOKEN",
];

/**
 * Check if a configuration key is sensitive
 */
export function isSensitiveKey(key: ConfigKey): boolean {
  return SENSITIVE_KEYS.includes(key);
}
