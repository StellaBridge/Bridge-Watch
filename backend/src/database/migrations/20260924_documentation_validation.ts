import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('documentation_links', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('url').notNullable().unique().index();
    table.string('title').nullable();
    table.string('category').nullable().index();
    table.string('source_entity_type').nullable();
    table.uuid('source_entity_id').nullable();
    table.string('resource_type').notNullable().index();
    table.enum('link_status', ['active', 'broken', 'redirect', 'temporary_unavailable', 'moved']).defaultTo('active').index();
    table.integer('http_status_code').nullable();
    table.text('error_message').nullable();
    table.timestamp('last_validated_at').nullable().index();
    table.integer('validation_attempts').defaultTo(0);
    table.integer('consecutive_failures').defaultTo(0);
    table.timestamp('first_failure_at').nullable();
    table.jsonb('validation_metadata').defaultTo('{}');
    table.string('redirect_url').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now()).index();
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.timestamp('deleted_at').nullable().index();
    table.index(['resource_type', 'link_status']);
  });

  await knex.schema.createTable('documentation_link_validations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('link_id').notNullable().references('id').inTable('documentation_links').onDelete('CASCADE');
    table.integer('http_status_code').nullable();
    table.integer('response_time_ms').nullable();
    table.boolean('content_hash_changed').defaultTo(false);
    table.string('content_hash').nullable();
    table.jsonb('headers').defaultTo('{}');
    table.text('error_message').nullable();
    table.enum('validation_result', ['success', 'broken', 'timeout', 'dns_error', 'ssl_error', 'server_error']).notNullable().index();
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('validated_at').defaultTo(knex.fn.now()).index();
    table.index(['link_id', 'validated_at']);
  });

  await knex.schema.createTable('documentation_link_reports', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('report_name').notNullable();
    table.text('description').nullable();
    table.integer('total_links').defaultTo(0);
    table.integer('broken_links').defaultTo(0);
    table.integer('redirect_links').defaultTo(0);
    table.integer('healthy_links').defaultTo(0);
    table.decimal('health_percentage', 5, 2).nullable();
    table.jsonb('link_categories').defaultTo('{}');
    table.jsonb('detailed_results').defaultTo('[]');
    table.enum('status', ['pending', 'in_progress', 'completed', 'failed']).defaultTo('pending').index();
    table.text('error_details').nullable();
    table.timestamp('started_at').nullable();
    table.timestamp('completed_at').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now()).index();
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('documentation_link_reports');
  await knex.schema.dropTableIfExists('documentation_link_validations');
  await knex.schema.dropTableIfExists('documentation_links');
}
