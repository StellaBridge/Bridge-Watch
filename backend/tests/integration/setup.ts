import "tsx/cjs";
import { beforeAll, afterAll } from "vitest";
import { getDatabase, closeDatabase } from "../../src/database/connection.js";
import { runMigrations, rollbackAll } from "../helpers/db.js";

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.POSTGRES_HOST = "localhost";
  process.env.POSTGRES_PORT = "5432";
  process.env.POSTGRES_DB = "bridge_watch_test";
  process.env.POSTGRES_USER = "bridge_watch";
  process.env.POSTGRES_PASSWORD = "bridge_watch_dev";
  process.env.REDIS_HOST = "localhost";
  process.env.REDIS_PORT = "6379";

  const db = getDatabase();
  await runMigrations(db);
});

afterAll(async () => {
  const db = getDatabase();
  await rollbackAll(db);
  await closeDatabase();
});
