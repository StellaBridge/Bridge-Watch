import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('backup_verifications', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table.uuid('backup_id').notNullable().index();
    table.string('backup_name').notNullable();
    table.enum('verification_type', ['checksum', 'restore_test', 'integrity']).notNullable();
    table.enum('status', ['pending', 'in_progress', 'passed', 'failed']).notNullable().index();
    table.timestamp('verification_date').notNullable().index();
    table.timestamp('completion_date');
    table.jsonb('result_details').defaultTo(knex.raw("'{}'::jsonb"));
    table.text('error_message');
    table.integer('verified_file_count');
    table.integer('total_file_count');
    table.integer('duration_ms');
    table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now()).notNullable();

    table.index(['backup_id', 'verification_date']);
    table.index(['status']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('backup_verifications');
}
