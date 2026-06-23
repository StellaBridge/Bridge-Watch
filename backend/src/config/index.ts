import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test", "sandbox"])
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

  // Ethereum
  ETHEREUM_RPC_URL: z.string().url().optional(),

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
  BRIDGE_SUPPLY_MISMATCH_THRESHOLD: z.coerce.number().default(0.01),
});

export type EnvConfig = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:", parsed.error.format());
  process.exit(1);
}

export const config: EnvConfig = parsed.data;
