import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().default(3001),
  WS_PORT: z.coerce.number().default(3002),

  // PostgreSQL + TimescaleDB
  POSTGRES_HOST: z.string().default("localhost"),
  POSTGRES_PORT: z.coerce.number().default(5432),
  POSTGRES_DB: z.string().default("bridge_watch"),
  POSTGRES_USER: z.string().default("bridge_watch"),
  POSTGRES_PASSWORD: z.string().default("bridge_watch_dev"),

  // Redis
  REDIS_HOST: z.string().default("localhost"),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().default(""),

  // Stellar
  STELLAR_NETWORK: z.enum(["testnet", "mainnet"]).default("testnet"),
  STELLAR_HORIZON_URL: z
    .string()
    .url()
    .default("https://horizon-testnet.stellar.org"),
  SOROBAN_RPC_URL: z
    .string()
    .url()
    .default("https://soroban-testnet.stellar.org"),
  SOROBAN_MAINNET_RPC_URL: z.string().url().optional(),
  CIRCUIT_BREAKER_CONTRACT_ID: z.string().optional(),
  LIQUIDITY_CONTRACT_ADDRESS: z.string().optional(),

  // Ethereum / EVM chains
  ETHEREUM_RPC_URL: z.string().url().optional(),
  ETHEREUM_RPC_WS_URL: z.string().url().optional(),
  ETHEREUM_RPC_FALLBACK_URL: z.string().url().optional(),
  RPC_PROVIDER_TYPE: z.enum(["http", "ws"]).default("http"),
  USDC_BRIDGE_ADDRESS: z.string().optional(),
  EURC_BRIDGE_ADDRESS: z.string().optional(),
  USDC_TOKEN_ADDRESS: z.string().optional(),
  EURC_TOKEN_ADDRESS: z.string().optional(),
  // Polygon
  POLYGON_RPC_URL: z.string().url().optional(),
  POLYGON_RPC_FALLBACK_URL: z.string().url().optional(),
  // Base
  BASE_RPC_URL: z.string().url().optional(),
  BASE_RPC_FALLBACK_URL: z.string().url().optional(),

  // External APIs
  CIRCLE_API_KEY: z.string().optional(),
  // Circle API base URL — use sandbox for non-production environments
  CIRCLE_API_URL: z
    .string()
    .url()
    .default("https://api.circle.com"),
  // Request timeout for Circle API calls (ms)
  CIRCLE_API_TIMEOUT_MS: z.coerce.number().default(5000),
  // Redis TTL for cached Circle price responses (seconds)
  CIRCLE_CACHE_TTL_SEC: z.coerce.number().default(60),
  // Circle API rate limiting: max requests per window
  CIRCLE_RATE_LIMIT_MAX: z.coerce.number().default(30),
  // Circle API rate limiting: window duration (ms)
  CIRCLE_RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  COINBASE_API_KEY: z.string().optional(),
  COINBASE_API_SECRET: z.string().optional(),
  API_KEY_BOOTSTRAP_TOKEN: z.string().optional(),

  // Logging
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
  LOG_FILE: z.string().optional(),
  LOG_MAX_FILE_SIZE: z.coerce.number().default(100 * 1024 * 1024), // 100MB
  LOG_MAX_FILES: z.coerce.number().default(10),
  LOG_RETENTION_DAYS: z.coerce.number().default(30),
  LOG_REQUEST_BODY: z.coerce.boolean().default(false),
  LOG_RESPONSE_BODY: z.coerce.boolean().default(false),
  LOG_SENSITIVE_DATA: z.coerce.boolean().default(false),
  REQUEST_SLOW_THRESHOLD_MS: z.coerce.number().default(1000),

  // Rate Limiting
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  // Burst allowance as a fraction of RATE_LIMIT_MAX (0.1 = 10% extra)
  RATE_LIMIT_BURST_MULTIPLIER: z.coerce.number().min(0).default(0.1),
  // Comma-separated IPs that bypass rate limiting entirely
  RATE_LIMIT_WHITELIST_IPS: z.string().optional(),
  // Comma-separated API keys that bypass rate limiting entirely
  RATE_LIMIT_WHITELIST_KEYS: z.string().optional(),
  
  // Enhanced Rate Limiting Configuration
  RATE_LIMIT_ENABLE_DYNAMIC: z.coerce.boolean().default(true),
  RATE_LIMIT_GLOBAL_ALERT_THRESHOLD: z.coerce.number().default(0.9),
  RATE_LIMIT_BURST_ALERT_THRESHOLD: z.coerce.number().default(0.8),
  RATE_LIMIT_SUSTAINED_ALERT_THRESHOLD: z.coerce.number().default(0.7),
  RATE_LIMIT_STATS_RETENTION_HOURS: z.coerce.number().default(168), // 7 days
  RATE_LIMIT_ENABLE_MONITORING: z.coerce.boolean().default(true),
  RATE_LIMIT_ADMIN_API_KEY_PREFIX: z.string().default("admin_"),
  
  // Per-endpoint rate limits (requests per window)
  RATE_LIMIT_ENDPOINT_ASSETS: z.coerce.number().default(200),
  RATE_LIMIT_ENDPOINT_BRIDGES: z.coerce.number().default(150),
  RATE_LIMIT_ENDPOINT_ALERTS: z.coerce.number().default(50),
  RATE_LIMIT_ENDPOINT_ANALYTICS: z.coerce.number().default(100),
  RATE_LIMIT_ENDPOINT_CONFIG: z.coerce.number().default(30),
  RATE_LIMIT_ENDPOINT_HEALTH: z.coerce.number().default(1000),

  // Alert Thresholds
  PRICE_DEVIATION_THRESHOLD: z.coerce.number().default(0.02),
  BRIDGE_SUPPLY_MISMATCH_THRESHOLD: z.coerce.number().default(0.1),

  // Verification & Retries
  RETRY_MAX: z.coerce.number().default(3),
  BRIDGE_VERIFICATION_INTERVAL_MS: z.coerce.number().default(300000),

  // Price Aggregation
  HORIZON_TIMEOUT_MS: z.coerce.number().default(500),
  REDIS_CACHE_TTL_SEC: z.coerce.number().default(30),
  REDIS_PRICE_CACHE_PREFIX: z.string().default("price:aggregated"),

  // Health Score Weights
  HEALTH_WEIGHT_LIQUIDITY: z.coerce.number().default(0.25),
  HEALTH_WEIGHT_PRICE: z.coerce.number().default(0.25),
  HEALTH_WEIGHT_BRIDGE: z.coerce.number().default(0.20),
  HEALTH_WEIGHT_RESERVES: z.coerce.number().default(0.20),
  HEALTH_WEIGHT_VOLUME: z.coerce.number().default(0.10),

  // Health Check Configuration
  HEALTH_CHECK_TIMEOUT_MS: z.coerce.number().default(5000),
  HEALTH_CHECK_INTERVAL_MS: z.coerce.number().default(30000),
  HEALTH_CHECK_MEMORY_THRESHOLD: z.coerce.number().default(90),
  HEALTH_CHECK_DISK_THRESHOLD: z.coerce.number().default(80),
  HEALTH_CHECK_EXTERNAL_APIS: z.string().default("true"),

  // Data Validation Configuration
  VALIDATION_STRICT_MODE: z.coerce.boolean().default(false),
  VALIDATION_ADMIN_BYPASS: z.coerce.boolean().default(true),
  VALIDATION_BATCH_SIZE: z.coerce.number().default(100),
  VALIDATION_MAX_BATCH_SIZE: z.coerce.number().default(1000),
  VALIDATION_DUPLICATE_CHECK: z.coerce.boolean().default(true),
  VALIDATION_NORMALIZATION: z.coerce.boolean().default(true),
  VALIDATION_CONSISTENCY_CHECKS: z.coerce.boolean().default(true),
  VALIDATION_ERROR_THRESHOLD: z.coerce.number().default(0.1), // 10% error rate threshold
  VALIDATION_WARNING_THRESHOLD: z.coerce.number().default(0.3), // 30% warning threshold
  VALIDATION_DATA_QUALITY_THRESHOLD: z.coerce.number().default(70), // 70% quality score threshold
});

export type EnvConfig = z.infer<typeof envSchema>;

export interface StellarAssetConfig {
  code: string;
  issuer: string;
}

export const SUPPORTED_ASSETS: StellarAssetConfig[] = [
  { code: "XLM", issuer: "native" },
  { code: "USDC", issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN" },
  { code: "PYUSD", issuer: "GBHZAE5IQTOPQZ66TFWZYIYCHQ6T3GMWHDKFEXAKYWJ2BHLZQ227KRYE" },
  { code: "EURC", issuer: "GDQOE23CFSUMSVZZ4YRVXGW7PCFNIAHLMRAHDE4Z32DIBQGH4KZZK2KZ" },
  { code: "FOBXX", issuer: "GBX7VUT2UTUKO2H76J26D7QYWNFW6C2NYN6K74Y3K43HGBXYZ" },
];

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:", parsed.error.format());
  process.exit(1);
}

export const config: EnvConfig = parsed.data;
