import type { Knex } from "knex";

/**
 * Migration: Outbox dead-letter state (issue #1260)
 *
 * 022_outbox_events.ts creates the DLQ table but only fresh installs get
 * its `chk_outbox_status` constraint containing 'dead_letter'. Existing
 * deployments need the constraint relaxed so outbox rows parked in the
 * dead-letter queue can carry the dedicated `dead_letter` status instead
 * of an ambiguous `failed`.
 */
export async function up(knex: Knex): Promise<void> {
  const hasConstraint = await knex.raw(`
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_outbox_status'
  `);

  if (hasConstraint.rows.length > 0) {
    await knex.raw("ALTER TABLE outbox_events DROP CONSTRAINT chk_outbox_status");
    await knex.raw(`
      ALTER TABLE outbox_events 
      ADD CONSTRAINT chk_outbox_status 
      CHECK (status IN ('pending', 'processing', 'delivered', 'failed', 'dead_letter'))
    `);
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasConstraint = await knex.raw(`
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_outbox_status'
  `);

  if (hasConstraint.rows.length > 0) {
    await knex.raw("ALTER TABLE outbox_events DROP CONSTRAINT chk_outbox_status");
    await knex.raw(`
      ALTER TABLE outbox_events 
      ADD CONSTRAINT chk_outbox_status 
      CHECK (status IN ('pending', 'processing', 'delivered', 'failed'))
    `);
  }
}
