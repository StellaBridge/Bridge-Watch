import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('restore_points', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name').notNullable();
    table.text('description').nullable();
    table.enum('type', ['snapshot', 'transaction_log', 'point_in_time']).notNullable().index();
    table.timestamp('created_at').defaultTo(knex.fn.now()).index();
    table.timestamp('snapshot_timestamp').notNullable().index();
    table.enum('status', ['available', 'in_progress', 'failed', 'expired']).defaultTo('available').index();
    table.integer('size_bytes').nullable();
    table.jsonb('metadata').defaultTo('{}');
    table.uuid('created_by_user_id').nullable();
    table.string('recovery_window_hours').nullable();
    table.timestamp('expires_at').nullable().index();
    table.timestamp('deleted_at').nullable().index();
  });

  await knex.schema.createTable('restore_point_selections', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('restore_point_id').notNullable().references('id').inTable('restore_points').onDelete('CASCADE');
    table.uuid('user_id').notNullable();
    table.string('bridge_id').nullable().index();
    table.string('chain_id').nullable().index();
    table.enum('selection_scope', ['full', 'bridge_specific', 'chain_specific', 'asset_specific']).notNullable();
    table.jsonb('selection_params').defaultTo('{}');
    table.enum('status', ['pending', 'in_progress', 'completed', 'failed', 'rolled_back']).defaultTo('pending').index();
    table.text('error_message').nullable();
    table.jsonb('recovery_stats').defaultTo('{}');
    table.timestamp('initiated_at').defaultTo(knex.fn.now()).index();
    table.timestamp('started_at').nullable();
    table.timestamp('completed_at').nullable();
    table.string('estimated_duration_minutes').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now()).index();
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.index(['restore_point_id', 'user_id']);
    table.index(['status', 'created_at']);
  });

  await knex.schema.createTable('restore_point_validations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('selection_id').notNullable().references('id').inTable('restore_point_selections').onDelete('CASCADE');
    table.string('validation_type').notNullable();
    table.boolean('passed').defaultTo(false);
    table.jsonb('validation_results').defaultTo('{}');
    table.text('error_details').nullable();
    table.timestamp('validated_at').defaultTo(knex.fn.now()).index();
    table.index(['selection_id', 'validation_type']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('restore_point_validations');
  await knex.schema.dropTableIfExists('restore_point_selections');
  await knex.schema.dropTableIfExists('restore_points');
}
