import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Create sequence table for gapless ordering per aggregate
  await knex.schema.createTable("outbox_events_sequence", (table) => {
    table.string("aggregate_type", 64).notNullable();
    table.uuid("aggregate_id").notNullable();
    table.bigInteger("seq").notNullable().defaultTo(0);
    table.primary(["aggregate_type", "aggregate_id"]);
  });

  // Main outbox table (ACID transactional)
  await knex.schema.createTable("outbox_events", (table) => {
    table.bigIncrements("id").primary();
    table.string("aggregate_type", 64).notNullable(); // "User", "Bridge", "Alert"
    table.uuid("aggregate_id").notNullable(); // Domain entity ID
    table.bigInteger("sequence_no").notNullable(); // Per-aggregate ordering
    table.string("event_type", 64).notNullable(); // "alert.triggered", "webhook.delivery"
    table.jsonb("payload").notNullable(); // Event data
    table.jsonb("metadata").notNullable().defaultTo("{}"); // {traceId, timestamp, producer}
    
    // Status lifecycle
    table.string("status", 20).notNullable().defaultTo("pending");
    table.integer("retry_count").notNullable().defaultTo(0);
    table.timestamp("retry_after", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("delivered_at", { useTz: true }).nullable();
    table.text("error_message").nullable();
    
    // Timestamps
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    
    // Indexes for relay performance
    table.index(["status", "retry_after"], "idx_outbox_status_retry");
    table.index(["aggregate_type", "aggregate_id", "sequence_no"], "idx_outbox_aggregate");
    table.index(["event_type", "status"], "idx_outbox_type_status");
    table.index(["created_at"], "idx_outbox_created");
    
    // Exactly-once per event
    table.unique(["aggregate_type", "aggregate_id", "sequence_no"]);
  });

  // Add check constraint for status ('dead_letter' = parked in DLQ awaiting redrive, issue #1260)
  await knex.raw(`
    ALTER TABLE outbox_events 
    ADD CONSTRAINT chk_outbox_status 
    CHECK (status IN ('pending', 'processing', 'delivered', 'failed', 'dead_letter'))
  `);

  // Add check constraint for retry_count
  await knex.raw(`
    ALTER TABLE outbox_events 
    ADD CONSTRAINT chk_outbox_retry_count 
    CHECK (retry_count >= 0)
  `);

  // Dead letter queue (manual intervention)
  await knex.schema.createTable("dead_letter_events", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.bigInteger("outbox_id").notNullable().references("id").inTable("outbox_events").onDelete("CASCADE");
    table.string("event_type", 64).notNullable();
    table.uuid("aggregate_id").notNullable();
    table.jsonb("payload").notNullable();
    table.integer("error_count").notNullable().defaultTo(1);
    table.text("last_error").notNullable();
    table.timestamp("last_attempt", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    
    // Performance indexes
    table.index(["error_count"], "idx_dlq_error_count");
    table.index(["last_attempt"], "idx_dlq_last_attempt");
    table.index(["event_type"], "idx_dlq_event_type");
    table.index(["created_at"], "idx_dlq_created");
  });

  // Function to get next sequence number atomically
  await knex.raw(`
    CREATE OR REPLACE FUNCTION get_next_outbox_sequence(
      p_aggregate_type VARCHAR(64),
      p_aggregate_id UUID
    ) RETURNS BIGINT AS $$
    DECLARE
      next_seq BIGINT;
    BEGIN
      INSERT INTO outbox_events_sequence (aggregate_type, aggregate_id, seq)
      VALUES (p_aggregate_type, p_aggregate_id, 1)
      ON CONFLICT (aggregate_type, aggregate_id)
      DO UPDATE SET seq = outbox_events_sequence.seq + 1
      RETURNING seq INTO next_seq;
      
      RETURN next_seq;
    END;
    $$ LANGUAGE plpgsql;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP FUNCTION IF EXISTS get_next_outbox_sequence(VARCHAR(64), UUID)");
  await knex.schema.dropTableIfExists("dead_letter_events");
  await knex.schema.dropTableIfExists("outbox_events");
  await knex.schema.dropTableIfExists("outbox_events_sequence");
}