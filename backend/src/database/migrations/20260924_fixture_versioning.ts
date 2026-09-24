import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('fixture_dataset_versions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('dataset_name').notNullable().index();
    table.string('version').notNullable();
    table.text('description').nullable();
    table.jsonb('metadata').defaultTo('{}');
    table.jsonb('pinned_assets').defaultTo('[]').comment('Array of asset identifiers pinned to this version');
    table.jsonb('pinned_contracts').defaultTo('[]').comment('Array of contract addresses pinned to this version');
    table.enum('status', ['active', 'deprecated', 'archived']).defaultTo('active').index();
    table.timestamp('pinned_at').defaultTo(knex.fn.now()).index();
    table.timestamp('expires_at').nullable();
    table.uuid('pinned_by_user_id').nullable();
    table.text('rollback_reason').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now()).index();
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.timestamp('deleted_at').nullable().index();
    table.unique(['dataset_name', 'version']);
  });

  await knex.schema.createTable('fixture_version_history', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('fixture_version_id').notNullable().references('id').inTable('fixture_dataset_versions').onDelete('CASCADE');
    table.enum('action', ['pinned', 'unpinned', 'deprecated', 'restored']).notNullable();
    table.jsonb('change_details').defaultTo('{}');
    table.string('reason').nullable();
    table.uuid('initiated_by_user_id').nullable();
    table.string('ip_address').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now()).index();
    table.index(['fixture_version_id', 'created_at']);
  });

  await knex.schema.createTable('fixture_version_compatibility', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('source_version_id').notNullable().references('id').inTable('fixture_dataset_versions').onDelete('CASCADE');
    table.uuid('target_version_id').notNullable().references('id').inTable('fixture_dataset_versions').onDelete('CASCADE');
    table.boolean('compatible').defaultTo(true);
    table.text('compatibility_notes').nullable();
    table.jsonb('breaking_changes').defaultTo('[]');
    table.timestamp('tested_at').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.unique(['source_version_id', 'target_version_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('fixture_version_compatibility');
  await knex.schema.dropTableIfExists('fixture_version_history');
  await knex.schema.dropTableIfExists('fixture_dataset_versions');
}
