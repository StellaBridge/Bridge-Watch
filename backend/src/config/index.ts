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
  COINBASE_API_KEY: z.string().optional(),
  COINBASE_API_SECRET: z.string().optional(),

  // Logging
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),

  // Rate Limiting
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),

  // Alert Thresholds
  PRICE_DEVIATION_THRESHOLD: z.coerce.number().default(0.02),
  BRIDGE_SUPPLY_MISMATCH_THRESHOLD: z.coerce.number().default(0.1),

  // Verification & Retries
  RETRY_MAX: z.coerce.number().default(3),
  BRIDGE_VERIFICATION_INTERVAL_MS: z.coerce.number().default(300000),

  // Price Aggregation
  HORIZON_TIMEOUT_MS: z.coerce.number().default(500),
  REDIS_CACHE_TTL_SEC: z.coerce.number().default(30),

  // Health Score Weights
  HEALTH_WEIGHT_LIQUIDITY: z.coerce.number().default(0.25),
  HEALTH_WEIGHT_PRICE: z.coerce.number().default(0.25),
  HEALTH_WEIGHT_BRIDGE: z.coerce.number().default(0.20),
  HEALTH_WEIGHT_RESERVES: z.coerce.number().default(0.20),
  HEALTH_WEIGHT_VOLUME: z.coerce.number().default(0.10),
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
