import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { getDatabase } from "./connection.js";
import { logger } from "../utils/logger.js";

export interface MigrationRecord {
  name: string;
  status: "applied" | "pending";
  batch?: number;
  migration_time?: Date;
}

export interface MigrationHistoryRow {
  id: number;
  name: string;
  batch: number;
  migration_time: Date;
}

type MigrationListEntry = string | { name?: string; file?: string };

function getMigrationName(entry: MigrationListEntry): string {
  if (typeof entry === "string") {
    return entry;
  }

  if (typeof entry?.name === "string") {
    return entry.name;
  }

  if (typeof entry?.file === "string") {
    return entry.file;
  }

  return String(entry);
}

/**
 * Migrator — central controller for all database migration and seed operations.
 *
 * Commands available via migrate.ts CLI:
 *   up            Run all pending migrations
 *   down          Roll back the last migration batch
 *   rollback      Roll back the last batch (alias for down)
 *   rollback:all  Roll back every applied migration
 *   status        Show applied / pending migrations
 *   dry-run       Preview pending migrations without executing
 *   make <name>   Scaffold a new timestamped migration file
 *   validate      Verify every migration file exports up() and down()
 *   history       Display the full migration history from the database
 *   unlock        Force-release a stuck migration lock
 */
export class Migrator {
  private db = getDatabase();
  private migrationsDir = path.resolve(process.cwd(), "src/database/migrations");
  readonly env: string = process.env.NODE_ENV ?? "development";

  // ---------------------------------------------------------------------------
  // Forward migration
  // ---------------------------------------------------------------------------

  /** Run all pending migrations in sequence. */
  async up(): Promise<void> {
    this.warnIfProduction("running migrations");

    const [batchNo, migrations] = await this.db.migrate.latest({ disableTransactions: false });

    if (migrations.length === 0) {
      logger.info("Already up to date — no pending migrations.");
    } else {
      logger.info(
        { batch: batchNo, count: migrations.length, files: migrations },
        `Applied ${migrations.length} migration(s) in batch ${batchNo}.`
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Rollback
  // ---------------------------------------------------------------------------

  /**
   * Roll back migrations.
   * @param all - when true, rolls back every applied migration; otherwise rolls
   *              back only the most recent batch.
   */
  async rollback(all = false): Promise<void> {
    this.warnIfProduction("rolling back migrations");

    const [batchNo, migrations] = await this.db.migrate.rollback(
      { disableTransactions: false },
      all
    );

    if (migrations.length === 0) {
      logger.info("Nothing to roll back.");
    } else {
      const scope = all ? "all batches" : `batch ${batchNo}`;
      logger.info(
        { count: migrations.length, files: migrations },
        `Rolled back ${migrations.length} migration(s) (${scope}).`
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Status
  // ---------------------------------------------------------------------------

  /**
   * Print a formatted table of applied and pending migrations and return the
   * full list as structured data.
   */
  async status(): Promise<MigrationRecord[]> {
    // Knex migrate.list() returns [completedNames, pendingNames]
    const [completedEntries, pendingEntries]: [MigrationListEntry[], MigrationListEntry[]] =
      (await this.db.migrate.list()) as [MigrationListEntry[], MigrationListEntry[]];
    const completedNames = completedEntries.map(getMigrationName);
    const pendingNames = pendingEntries.map(getMigrationName);

    // Fetch batch / timestamp details for applied migrations
    let appliedDetails: Array<{ name: string; batch: number; migration_time: Date }> = [];
    try {
      appliedDetails = await this.db("knex_migrations")
        .select("name", "batch", "migration_time")
        .orderBy("id", "asc");
    } catch {
      // Table does not exist yet — database has never been migrated
    }

    const detailMap = new Map(appliedDetails.map((r) => [r.name, r]));

    const records: MigrationRecord[] = [
      ...completedNames.map((name) => {
        const detail = detailMap.get(name);
        return {
          name,
          status: "applied" as const,
          batch: detail?.batch,
          migration_time: detail?.migration_time,
        };
      }),
      ...pendingNames.map((name) => ({ name, status: "pending" as const })),
    ];

    this.printStatusTable(records);
    return records;
  }

  // ---------------------------------------------------------------------------
  // Dry run
  // ---------------------------------------------------------------------------

  /** Show which migrations would run without actually executing them. */
  async dryRun(): Promise<void> {
    const [, pendingNames]: [string[], string[]] =
      (await this.db.migrate.list()) as [string[], string[]];

    if (pendingNames.length === 0) {
      logger.info("[DRY RUN] Already up to date — no pending migrations.");
      return;
    }

    logger.info(`[DRY RUN] Would apply ${pendingNames.length} migration(s):`);
    pendingNames.forEach((name, i) => console.log(`  ${i + 1}. ${name}`));
    logger.info("[DRY RUN] No changes were made to the database.");
  }

  // ---------------------------------------------------------------------------
  // Migration file generation
  // ---------------------------------------------------------------------------

  /**
   * Scaffold a new timestamped migration file in the migrations directory.
   * @param name - Snake-case description, e.g. "add_user_table"
   * @returns Absolute path of the generated file.
   */
  async make(name: string): Promise<string> {
    if (!name) {
      throw new Error("A migration name is required. Usage: npm run migrate:make -- <name>");
    }

    const sanitized = name.trim().toLowerCase().replace(/\s+/g, "_");

    if (!/^[a-z][a-z0-9_]*$/.test(sanitized)) {
      throw new Error(
        `Invalid migration name "${name}". Use only lowercase letters, digits, and underscores.`
      );
    }

    const timestamp = new Date()
      .toISOString()
      .replace(/[-T:.Z]/g, "")
      .slice(0, 14); // YYYYMMDDHHmmss

    const filename = `${timestamp}_${sanitized}.ts`;
    const filepath = path.join(this.migrationsDir, filename);

    if (fs.existsSync(filepath)) {
      throw new Error(`Migration file already exists: ${filepath}`);
    }

    const template = `import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // TODO: implement forward migration
  // Example:
  // await knex.schema.createTable("example", (t) => {
  //   t.uuid("id").primary().defaultTo(knex.fn.uuid());
  //   t.string("name").notNullable();
  //   t.timestamps(true, true);
  // });
}

export async function down(knex: Knex): Promise<void> {
  // TODO: implement rollback (mirror of up)
  // Example:
  // await knex.schema.dropTableIfExists("example");
}
`;

    fs.writeFileSync(filepath, template, "utf8");
    logger.info(`Created: src/database/migrations/${filename}`);
    return filepath;
  }

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  /**
   * Load every migration file and confirm it exports both `up` and `down`
   * functions. Exits the process with code 1 if any file is invalid.
   */
  async validate(): Promise<boolean> {
    const files = fs
      .readdirSync(this.migrationsDir)
      .filter((f) => f.endsWith(".ts") || f.endsWith(".js"))
      .sort();

    if (files.length === 0) {
      logger.warn("No migration files found in migrations directory.");
      return true;
    }

    const errors: string[] = [];

    for (const file of files) {
      const filepath = path.join(this.migrationsDir, file);
      try {
        // pathToFileURL ensures compatibility on Windows and ESM
        const mod = await import(pathToFileURL(filepath).href);

        if (typeof mod.up !== "function") {
          errors.push(`${file}: missing exported 'up' function`);
        }
        if (typeof mod.down !== "function") {
          errors.push(`${file}: missing exported 'down' function (rollback will not work)`);
        }
      } catch (err) {
        errors.push(`${file}: failed to import — ${(err as Error).message}`);
      }
    }

    if (errors.length === 0) {
      logger.info(`Validated ${files.length} migration file(s) — all OK.`);
      return true;
    }

    logger.error(`Migration validation failed: ${errors.length} error(s) found.`);
    errors.forEach((e) => console.error(`  ✗ ${e}`));
    return false;
  }

  // ---------------------------------------------------------------------------
  // History
  // ---------------------------------------------------------------------------

  /** Print the full migration history stored in the knex_migrations table. */
  async history(): Promise<MigrationHistoryRow[]> {
    let rows: MigrationHistoryRow[] = [];
    try {
      rows = await this.db<MigrationHistoryRow>("knex_migrations")
        .select("id", "name", "batch", "migration_time")
        .orderBy("id", "asc");
    } catch {
      logger.warn("knex_migrations table not found — no migrations have been run yet.");
      return [];
    }

    if (rows.length === 0) {
      logger.info("Migration history is empty.");
      return [];
    }

    const col = (s: unknown, w: number) => String(s).slice(0, w).padEnd(w);
    const hr = "-".repeat(86);

    console.log("\nMigration History:");
    console.log(hr);
    console.log(
      col("ID", 6) + col("Batch", 8) + col("Name", 52) + "Applied At"
    );
    console.log(hr);

    for (const row of rows) {
      console.log(
        col(String(row.id), 6) +
          col(String(row.batch), 8) +
          col(row.name, 52) +
          new Date(row.migration_time).toISOString()
      );
    }

    console.log(hr);
    console.log(`Total: ${rows.length} migration(s) applied.\n`);

    return rows;
  }

  // ---------------------------------------------------------------------------
  // Lock management
  // ---------------------------------------------------------------------------

  /**
   * Force-release the knex_migrations_lock row.
   * Use this only when a previous migration run crashed and left the lock set.
   */
  async unlock(): Promise<void> {
    await this.db.migrate.forceFreeMigrationsLock();
    logger.info("Migration lock released successfully.");
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  async destroy(): Promise<void> {
    await this.db.destroy();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private warnIfProduction(action: string): void {
    if (this.env === "production") {
      logger.warn(
        `⚠  You are ${action} against a PRODUCTION database (NODE_ENV=production). ` +
          "Ensure you have a verified backup before proceeding."
      );
    }
  }

  private printStatusTable(records: MigrationRecord[]): void {
    const applied = records.filter((r) => r.status === "applied");
    const pending = records.filter((r) => r.status === "pending");

    const col = (s: unknown, w: number) => String(s).slice(0, w).padEnd(w);
    const hr = "=".repeat(86);
    const div = "-".repeat(86);

    console.log(`\nMigration Status  [env: ${this.env}]`);
    console.log(hr);
    console.log(col("Status", 12) + col("Batch", 8) + col("Name", 48) + "Applied At");
    console.log(div);

    for (const r of records) {
      const status = r.status === "applied" ? "✓ applied" : "  pending";
      const batch = r.batch != null ? String(r.batch) : "-";
      const appliedAt = r.migration_time
        ? new Date(r.migration_time).toISOString()
        : "-";
      console.log(col(status, 12) + col(batch, 8) + col(r.name, 48) + appliedAt);
    }

    console.log(hr);
    console.log(`Applied: ${applied.length}   Pending: ${pending.length}\n`);
  }
}
