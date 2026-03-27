import { getDatabase } from "./connection.js";
import { logger } from "../utils/logger.js";

async function seed() {
  const db = getDatabase();

  try {
    logger.info("Running database seeds...");
    await db.seed.run();
    logger.info("Seeds completed successfully");
  } catch (error) {
    logger.error({ error }, "Seeding failed");
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

seed();
