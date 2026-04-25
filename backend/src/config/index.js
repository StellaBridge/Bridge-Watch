"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = exports.SUPPORTED_ASSETS = void 0;
var zod_1 = require("zod");
var dotenv_1 = require("dotenv");
dotenv_1.default.config();
var envSchema = zod_1.z.object({
    NODE_ENV: zod_1.z
        .enum(["development", "production", "test"])
        .default("development"),
    PORT: zod_1.z.coerce.number().default(3001),
    WS_PORT: zod_1.z.coerce.number().default(3002),
    // PostgreSQL + TimescaleDB
    POSTGRES_HOST: zod_1.z.string().default("localhost"),
    POSTGRES_PORT: zod_1.z.coerce.number().default(5432),
    POSTGRES_DB: zod_1.z.string().default("bridge_watch"),
    POSTGRES_USER: zod_1.z.string().default("bridge_watch"),
    POSTGRES_PASSWORD: zod_1.z.string().default("bridge_watch_dev"),
    // Redis
    REDIS_HOST: zod_1.z.string().default("localhost"),
    REDIS_PORT: zod_1.z.coerce.number().default(6379),
    REDIS_PASSWORD: zod_1.z.string().default(""),
    // Stellar
    STELLAR_NETWORK: zod_1.z.enum(["testnet", "mainnet"]).default("testnet"),
    STELLAR_HORIZON_URL: zod_1.z
        .string()
        .url()
        .default("https://horizon-testnet.stellar.org"),
    SOROBAN_RPC_URL: zod_1.z
        .string()
        .url()
        .default("https://soroban-testnet.stellar.org"),
    SOROBAN_MAINNET_RPC_URL: zod_1.z.string().url().optional(),
    CIRCUIT_BREAKER_CONTRACT_ID: zod_1.z.string().optional(),
    LIQUIDITY_CONTRACT_ADDRESS: zod_1.z.string().optional(),
    // Ethereum / EVM chains
    ETHEREUM_RPC_URL: zod_1.z.string().url().optional(),
    ETHEREUM_RPC_WS_URL: zod_1.z.string().url().optional(),
    ETHEREUM_RPC_FALLBACK_URL: zod_1.z.string().url().optional(),
    RPC_PROVIDER_TYPE: zod_1.z.enum(["http", "ws"]).default("http"),
    USDC_BRIDGE_ADDRESS: zod_1.z.string().optional(),
    EURC_BRIDGE_ADDRESS: zod_1.z.string().optional(),
    USDC_TOKEN_ADDRESS: zod_1.z.string().optional(),
    EURC_TOKEN_ADDRESS: zod_1.z.string().optional(),
    // Polygon
    POLYGON_RPC_URL: zod_1.z.string().url().optional(),
    POLYGON_RPC_FALLBACK_URL: zod_1.z.string().url().optional(),
    // Base
    BASE_RPC_URL: zod_1.z.string().url().optional(),
    BASE_RPC_FALLBACK_URL: zod_1.z.string().url().optional(),
    // External APIs
    CIRCLE_API_KEY: zod_1.z.string().optional(),
    // Circle API base URL — use sandbox for non-production environments
    CIRCLE_API_URL: zod_1.z
        .string()
        .url()
        .default("https://api.circle.com"),
    // Request timeout for Circle API calls (ms)
    CIRCLE_API_TIMEOUT_MS: zod_1.z.coerce.number().default(5000),
    // Redis TTL for cached Circle price responses (seconds)
    CIRCLE_CACHE_TTL_SEC: zod_1.z.coerce.number().default(60),
    // Circle API rate limiting: max requests per window
    CIRCLE_RATE_LIMIT_MAX: zod_1.z.coerce.number().default(30),
    // Circle API rate limiting: window duration (ms)
    CIRCLE_RATE_LIMIT_WINDOW_MS: zod_1.z.coerce.number().default(60000),
    COINBASE_API_KEY: zod_1.z.string().optional(),
    COINBASE_API_SECRET: zod_1.z.string().optional(),
    API_KEY_BOOTSTRAP_TOKEN: zod_1.z.string().optional(),
    // Logging
    LOG_LEVEL: zod_1.z
        .enum(["fatal", "error", "warn", "info", "debug", "trace"])
        .default("info"),
    LOG_FILE: zod_1.z.string().optional(),
    LOG_MAX_FILE_SIZE: zod_1.z.coerce.number().default(100 * 1024 * 1024), // 100MB
    LOG_MAX_FILES: zod_1.z.coerce.number().default(10),
    LOG_RETENTION_DAYS: zod_1.z.coerce.number().default(30),
    LOG_REQUEST_BODY: zod_1.z.coerce.boolean().default(false),
    LOG_RESPONSE_BODY: zod_1.z.coerce.boolean().default(false),
    LOG_SENSITIVE_DATA: zod_1.z.coerce.boolean().default(false),
    REQUEST_SLOW_THRESHOLD_MS: zod_1.z.coerce.number().default(1000),
    // Rate Limiting
    RATE_LIMIT_MAX: zod_1.z.coerce.number().default(100),
    RATE_LIMIT_WINDOW_MS: zod_1.z.coerce.number().default(60000),
    // Burst allowance as a fraction of RATE_LIMIT_MAX (0.1 = 10% extra)
    RATE_LIMIT_BURST_MULTIPLIER: zod_1.z.coerce.number().min(0).default(0.1),
    // Comma-separated IPs that bypass rate limiting entirely
    RATE_LIMIT_WHITELIST_IPS: zod_1.z.string().optional(),
    // Comma-separated API keys that bypass rate limiting entirely
    RATE_LIMIT_WHITELIST_KEYS: zod_1.z.string().optional(),
    // Enhanced Rate Limiting Configuration
    RATE_LIMIT_ENABLE_DYNAMIC: zod_1.z.coerce.boolean().default(true),
    RATE_LIMIT_GLOBAL_ALERT_THRESHOLD: zod_1.z.coerce.number().default(0.9),
    RATE_LIMIT_BURST_ALERT_THRESHOLD: zod_1.z.coerce.number().default(0.8),
    RATE_LIMIT_SUSTAINED_ALERT_THRESHOLD: zod_1.z.coerce.number().default(0.7),
    RATE_LIMIT_STATS_RETENTION_HOURS: zod_1.z.coerce.number().default(168), // 7 days
    RATE_LIMIT_ENABLE_MONITORING: zod_1.z.coerce.boolean().default(true),
    RATE_LIMIT_ADMIN_API_KEY_PREFIX: zod_1.z.string().default("admin_"),
    // Per-endpoint rate limits (requests per window)
    RATE_LIMIT_ENDPOINT_ASSETS: zod_1.z.coerce.number().default(200),
    RATE_LIMIT_ENDPOINT_BRIDGES: zod_1.z.coerce.number().default(150),
    RATE_LIMIT_ENDPOINT_ALERTS: zod_1.z.coerce.number().default(50),
    RATE_LIMIT_ENDPOINT_ANALYTICS: zod_1.z.coerce.number().default(100),
    RATE_LIMIT_ENDPOINT_CONFIG: zod_1.z.coerce.number().default(30),
    RATE_LIMIT_ENDPOINT_HEALTH: zod_1.z.coerce.number().default(1000),
    // Alert Thresholds
    PRICE_DEVIATION_THRESHOLD: zod_1.z.coerce.number().default(0.02),
    BRIDGE_SUPPLY_MISMATCH_THRESHOLD: zod_1.z.coerce.number().default(0.1),
    // Verification & Retries
    RETRY_MAX: zod_1.z.coerce.number().default(3),
    BRIDGE_VERIFICATION_INTERVAL_MS: zod_1.z.coerce.number().default(300000),
    BACKFILL_QUEUE_CONCURRENCY: zod_1.z.coerce.number().default(2),
    BACKFILL_DEFAULT_MAX_PAGES: zod_1.z.coerce.number().default(250),
    BACKFILL_CHUNK_PAGES: zod_1.z.coerce.number().default(5),
    BACKFILL_PAGE_SIZE: zod_1.z.coerce.number().default(100),
    BACKFILL_PROVIDER_DELAY_MS: zod_1.z.coerce.number().default(500),
    // Price Aggregation
    HORIZON_TIMEOUT_MS: zod_1.z.coerce.number().default(500),
    REDIS_CACHE_TTL_SEC: zod_1.z.coerce.number().default(30),
    REDIS_PRICE_CACHE_PREFIX: zod_1.z.string().default("price:aggregated"),
    // WebSocket
    /**
     * Secret token required to subscribe to private WebSocket channels (e.g.
     * "alerts").  When absent, private-channel authentication is disabled and
     * any token is rejected.  Set this to a strong random string in production.
     */
    WS_AUTH_SECRET: zod_1.z.string().optional(),
    // Health Score Weights
    HEALTH_WEIGHT_LIQUIDITY: zod_1.z.coerce.number().default(0.25),
    HEALTH_WEIGHT_PRICE: zod_1.z.coerce.number().default(0.25),
    HEALTH_WEIGHT_BRIDGE: zod_1.z.coerce.number().default(0.20),
    HEALTH_WEIGHT_RESERVES: zod_1.z.coerce.number().default(0.20),
    HEALTH_WEIGHT_VOLUME: zod_1.z.coerce.number().default(0.10),
    // Export Service
    EXPORT_STORAGE_PATH: zod_1.z.string().default("./exports"),
    EXPORT_DOWNLOAD_URL_EXPIRY_HOURS: zod_1.z.coerce.number().default(24),
    EXPORT_COMPRESSION_THRESHOLD_BYTES: zod_1.z.coerce.number().default(1048576), // 1MB
    EXPORT_STREAMING_PAGE_SIZE: zod_1.z.coerce.number().default(1000),
    EXPORT_QUEUE_CONCURRENCY: zod_1.z.coerce.number().default(3),
    EXPORT_MAX_DATE_RANGE_DAYS: zod_1.z.coerce.number().default(90),
    // Email Configuration
    SMTP_HOST: zod_1.z.string().optional(),
    SMTP_PORT: zod_1.z.coerce.number().default(587),
    SMTP_SECURE: zod_1.z.coerce.boolean().default(false),
    SMTP_USER: zod_1.z.string().optional(),
    SMTP_PASSWORD: zod_1.z.string().optional(),
    SMTP_FROM_ADDRESS: zod_1.z.string().default("noreply@bridgewatch.io"),
    SMTP_FROM_NAME: zod_1.z.string().default("Bridge Watch"),
    // Discord Bot Configuration
    DISCORD_BOT_TOKEN: zod_1.z.string().optional(),
    DISCORD_CLIENT_ID: zod_1.z.string().optional(),
    // Health Check Configuration
    HEALTH_CHECK_TIMEOUT_MS: zod_1.z.coerce.number().default(5000),
    HEALTH_CHECK_INTERVAL_MS: zod_1.z.coerce.number().default(30000),
    HEALTH_CHECK_MEMORY_THRESHOLD: zod_1.z.coerce.number().default(90),
    HEALTH_CHECK_DISK_THRESHOLD: zod_1.z.coerce.number().default(80),
    HEALTH_CHECK_EXTERNAL_APIS: zod_1.z.string().default("true"),
    // Data Validation Configuration
    VALIDATION_STRICT_MODE: zod_1.z.coerce.boolean().default(false),
    VALIDATION_ADMIN_BYPASS: zod_1.z.coerce.boolean().default(true),
    VALIDATION_BATCH_SIZE: zod_1.z.coerce.number().default(100),
    VALIDATION_MAX_BATCH_SIZE: zod_1.z.coerce.number().default(1000),
    VALIDATION_DUPLICATE_CHECK: zod_1.z.coerce.boolean().default(true),
    VALIDATION_NORMALIZATION: zod_1.z.coerce.boolean().default(true),
    VALIDATION_CONSISTENCY_CHECKS: zod_1.z.coerce.boolean().default(true),
    VALIDATION_ERROR_THRESHOLD: zod_1.z.coerce.number().default(0.1), // 10% error rate threshold
    VALIDATION_WARNING_THRESHOLD: zod_1.z.coerce.number().default(0.3), // 30% warning threshold
    VALIDATION_DATA_QUALITY_THRESHOLD: zod_1.z.coerce.number().default(70), // 70% quality score threshold
});
exports.SUPPORTED_ASSETS = [
    { code: "XLM", issuer: "native" },
    { code: "USDC", issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN" },
    { code: "PYUSD", issuer: "GBHZAE5IQTOPQZ66TFWZYIYCHQ6T3GMWHDKFEXAKYWJ2BHLZQ227KRYE" },
    { code: "EURC", issuer: "GDQOE23CFSUMSVZZ4YRVXGW7PCFNIAHLMRAHDE4Z32DIBQGH4KZZK2KZ" },
    { code: "FOBXX", issuer: "GBX7VUT2UTUKO2H76J26D7QYWNFW6C2NYN6K74Y3K43HGBXYZ" },
];
var parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
    console.error("Invalid environment variables:", parsed.error.format());
    process.exit(1);
}
exports.config = parsed.data;
