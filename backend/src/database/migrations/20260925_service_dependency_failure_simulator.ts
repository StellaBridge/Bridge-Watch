import { Knex } from 'knex';

/**
 * #1188 — Service Dependency Failure Simulator
 *
 * Tables:
 *  - failure_simulator_scenarios  — named failure injection configurations
 *  - failure_simulator_runs       — execution log for each simulation run
 *  - failure_simulator_events     — append-only audit trail of simulation events
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('failure_simulator_scenarios', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name').notNullable().comment('Human-readable scenario name');
    table.text('description').nullable();
    table.string('target_service').notNullable().comment('Service key targeted by this scenario');
    table.enum('failure_mode', [
      'timeout',
      'error',
      'latency',
      'partial_failure',
      'connection_refused',
    ]).notNullable().index().comment('Type of failure to inject');
    table.integer('latency_ms').nullable().comment('Added latency in milliseconds when failure_mode=latency');
    table.float('error_rate').nullable().comment('Fraction of requests to fail (0.0–1.0) when failure_mode=partial_failure');
    table.integer('timeout_ms').nullable().comment('Timeout override in milliseconds when failure_mode=timeout');
    table.string('error_message').nullable().comment('Custom error message to return');
    table.boolean('enabled').notNullable().defaultTo(false);
    table.uuid('created_by').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now()).index();
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('deleted_at').nullable();
    table.unique(['name']);
    table.index(['target_service', 'enabled']);
  });

  await knex.schema.createTable('failure_simulator_runs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('scenario_id').notNullable()
      .references('id').inTable('failure_simulator_scenarios').onDelete('CASCADE');
    table.enum('status', ['pending', 'running', 'completed', 'cancelled', 'failed'])
      .notNullable().defaultTo('pending').index();
    table.string('triggered_by').nullable().comment('User ID or system actor');
    table.string('trigger').notNullable().defaultTo('manual')
      .comment('manual | scheduled | ci');
    table.integer('duration_ms').nullable().comment('Configured run duration in milliseconds');
    table.integer('requests_injected').notNullable().defaultTo(0);
    table.integer('requests_succeeded').notNullable().defaultTo(0);
    table.integer('requests_failed').notNullable().defaultTo(0);
    table.jsonb('observations').notNullable().defaultTo('{}')
      .comment('Collected metrics and observations during the run');
    table.text('cancellation_reason').nullable();
    table.timestamp('started_at').nullable();
    table.timestamp('completed_at').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now()).index();
    table.index(['scenario_id', 'created_at']);
    table.index(['status', 'created_at']);
  });

  await knex.schema.createTable('failure_simulator_events', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('run_id').notNullable()
      .references('id').inTable('failure_simulator_runs').onDelete('CASCADE');
    table.string('event_type').notNullable()
      .comment('started | injected | observed | completed | cancelled | failed');
    table.jsonb('payload').notNullable().defaultTo('{}');
    table.timestamp('occurred_at').notNullable().defaultTo(knex.fn.now()).index();
    table.index(['run_id', 'occurred_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('failure_simulator_events');
  await knex.schema.dropTableIfExists('failure_simulator_runs');
  await knex.schema.dropTableIfExists('failure_simulator_scenarios');
}
