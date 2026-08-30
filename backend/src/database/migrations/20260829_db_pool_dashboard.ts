import type { Knex } from "knex";

export const config = { transaction: false };

/**
 * Migration for Database Connection Pool Dashboard (#1182)
 * Creates tables for pool snapshots, events, and control actions
 * with indexes and retention policies
 */
export async function up(knex: Knex): Promise<void> {
  // Create db_pool_snapshots table for storing periodic pool metrics
  await knex.schema.createTable("db_pool_snapshots", (table) => {
    table.bigIncrements("id").primary();
    table.timestamptz("timestamp").notNullable().defaultTo(knex.fn.now());
    table.string("pool_id").notNullable();
    table.integer("active_connections").notNullable();
    table.integer("idle_connections").notNullable();
    table.integer("waiting_requests").notNullable().defaultTo(0);
    table.integer("max_connections").notNullable();
    table.integer("min_connections").notNullable();
    table.bigInteger("acquired_total").nullable();
    table.bigInteger("released_total").nullable();
    table.double("avg_acquire_ms").nullable();
    table.double("avg_query_ms").nullable();
    table.integer("error_count").nullable().defaultTo(0);
    table.timestamps(true, true);

    // Indexes for common queries
    table.index(["timestamp"], "idx_db_pool_snapshots_timestamp");
    table.index(["pool_id"], "idx_db_pool_snapshots_pool_id");
    table.index(["pool_id", "timestamp"], "idx_db_pool_snapshots_pool_timestamp");
  });

  // Create db_pool_events table for significant pool events
  await knex.schema.createTable("db_pool_events", (table) => {
    table.bigIncrements("id").primary();
    table.timestamptz("timestamp").notNullable().defaultTo(knex.fn.now());
    table.string("pool_id").notNullable();
    table.string("event_type").notNullable(); // WAITING_REQUESTS, POOL_NEAR_EXHAUSTION, TIMEOUT, ERROR, etc.
    table.string("severity").notNullable(); // info, warning, critical
    table.jsonb("details").nullable();
    table.text("message").nullable();
    table.timestamps(true, true);

    // Indexes for common queries
    table.index(["timestamp"], "idx_db_pool_events_timestamp");
    table.index(["pool_id"], "idx_db_pool_events_pool_id");
    table.index(["event_type"], "idx_db_pool_events_type");
    table.index(["severity"], "idx_db_pool_events_severity");
    table.index(["pool_id", "timestamp"], "idx_db_pool_events_pool_timestamp");
  });

  // Create db_pool_controls table for audit trail of operator actions
  await knex.schema.createTable("db_pool_controls", (table) => {
    table.bigIncrements("id").primary();
    table.timestamptz("timestamp").notNullable().defaultTo(knex.fn.now());
    table.string("pool_id").notNullable();
    table.string("action").notNullable(); // set_max_connections, set_min_connections, evict_idle, etc.
    table.string("actor_id").notNullable(); // User ID or API key ID who performed the action
    table.jsonb("parameters").nullable(); // Parameters passed to the action
    table.string("result").notNullable(); // success, failed, pending
    table.text("error_message").nullable();
    table.string("audit_id").nullable(); // For linking to audit trail
    table.timestamps(true, true);

    // Indexes for common queries
    table.index(["timestamp"], "idx_db_pool_controls_timestamp");
    table.index(["pool_id"], "idx_db_pool_controls_pool_id");
    table.index(["actor_id"], "idx_db_pool_controls_actor");
    table.index(["result"], "idx_db_pool_controls_result");
  });

  // Enable TimescaleDB hypertables for time-series compression (optional, gracefully skip if unavailable)
  try {
    // Compress snapshots (keep 30 days uncompressed, older data compressed)
    await knex.raw(
      "SELECT create_hypertable('db_pool_snapshots', 'timestamp', if_not_exists => TRUE)"
    );
    await knex.raw(`
      ALTER TABLE db_pool_snapshots SET (
        timescaledb.compress = true,
        timescaledb.compress_segmentby = 'pool_id'
      );
    `);
    // Compress data older than 7 days
    await knex.raw(`
      SELECT add_compression_policy('db_pool_snapshots', INTERVAL '7 days');
    `);
  } catch {
    // TimescaleDB may not be installed; tables will remain as regular PostgreSQL tables
  }

  try {
    // Events table (keep 30 days)
    await knex.raw(
      "SELECT create_hypertable('db_pool_events', 'timestamp', if_not_exists => TRUE)"
    );
  } catch {
    // TimescaleDB may not be installed
  }

  // Add retention policies for data cleanup
  try {
    // Keep snapshots for 30 days
    await knex.raw(`
      SELECT add_retention_policy('db_pool_snapshots', INTERVAL '30 days', if_not_exists => TRUE);
    `);
    // Keep events for 30 days
    await knex.raw(`
      SELECT add_retention_policy('db_pool_events', INTERVAL '30 days', if_not_exists => TRUE);
    `);
    // Keep control actions permanently (important for audit trail)
  } catch {
    // Retention policies not available; manual cleanup needed
  }
}

export async function down(knex: Knex): Promise<void> {
  // Drop tables in reverse order (controls first due to potential foreign keys)
  await knex.schema.dropTableIfExists("db_pool_controls");
  await knex.schema.dropTableIfExists("db_pool_events");
  await knex.schema.dropTableIfExists("db_pool_snapshots");
}
