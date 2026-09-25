import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('api_deprecations', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table.string('endpoint').notNullable();
    table.enum('method', ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).notNullable();
    table.enum('status', ['active', 'deprecated', 'sunset']).notNullable().defaultTo('active').index();
    table.timestamp('deprecation_date').notNullable();
    table.timestamp('sunset_date').notNullable().index();
    table.string('replacement_endpoint');
    table.text('migration_guide');
    table.float('impact_score').defaultTo(0);
    table.integer('active_client_count').defaultTo(0);
    table.timestamp('last_used_at');
    table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now()).notNullable();

    table.unique(['endpoint', 'method']);
    table.index(['status', 'sunset_date']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('api_deprecations');
}
