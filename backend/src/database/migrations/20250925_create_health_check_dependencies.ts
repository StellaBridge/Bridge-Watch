import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('health_check_dependencies', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table.uuid('health_check_id').notNullable().index();
    table.uuid('dependent_check_id').notNullable().index();
    table.enum('dependency_type', ['blocking', 'informational']).notNullable();
    table.text('failure_impact').notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now()).notNullable();

    table.unique(['health_check_id', 'dependent_check_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('health_check_dependencies');
}
