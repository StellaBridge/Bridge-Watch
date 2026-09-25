import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('contributor_diagnostics', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table.string('contributor_id').notNullable().index();
    table.string('contributor_name').notNullable();
    table.enum('diagnostic_type', ['performance', 'code_quality', 'testing', 'documentation']).notNullable();
    table.enum('status', ['healthy', 'warning', 'critical']).notNullable().index();
    table.jsonb('metrics').defaultTo(knex.raw("'{}'::jsonb"));
    table.float('score').notNullable();
    table.timestamp('last_updated').notNullable();
    table.jsonb('recommendations').defaultTo(knex.raw("'[]'::jsonb"));
    table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now()).notNullable();

    table.index(['contributor_id', 'diagnostic_type']);
    table.index(['status']);
    table.index(['created_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('contributor_diagnostics');
}
