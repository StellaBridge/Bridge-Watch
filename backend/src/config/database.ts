import type { Knex } from "knex";
import { config } from "./index.js";

export const databaseConfig: Knex.Config = {
  client: "pg",
  connection: {
    host: config.POSTGRES_HOST,
    port: config.POSTGRES_PORT,
    database: config.POSTGRES_DB,
    user: config.POSTGRES_USER,
    password: config.POSTGRES_PASSWORD,
    // Keep connections alive
    keepAlive: true,
  },
  pool: {
    min: 2,
    max: 20,
    // Destroy idle connections after 30s
    idleTimeoutMillis: 30_000,
    // Fail fast if pool is exhausted
    acquireTimeoutMillis: 10_000,
    // Validate connection before use
    afterCreate(conn: { query: (sql: string, cb: (err: Error | null) => void) => void }, done: (err: Error | null, conn: unknown) => void) {
      conn.query("SET timezone='UTC'", (err) => done(err, conn));
    },
  },
  migrations: {
    directory: "./src/database/migrations",
    tableName: "knex_migrations",
    extension: "ts",
    loadExtensions: [".ts", ".js"],
  },
  seeds: {
    directory: "./src/database/seeds",
    extension: "ts",
    loadExtensions: [".ts", ".js"],
  },
};
