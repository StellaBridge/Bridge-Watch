import { Knex } from 'knex';

/**
 * #1207 — OpenAPI Client Generation Workflow
 *
 * Tables:
 *  - openapi_client_configs   — per-language/target generation configurations
 *  - openapi_generation_jobs  — log of each generation run with status & artifacts
 *  - openapi_generation_events — immutable audit trail for generation events
 */
export async function up(knex: Knex): Promise<void> {
  // Stores user-defined client generation configurations (one per language target)
  await knex.schema.createTable('openapi_client_configs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name').notNullable().comment('Human-readable label, e.g. "TypeScript SDK"');
    table.string('language').notNullable().comment('Target language: typescript, python, go, java, …');
    table.string('generator').notNullable().defaultTo('openapi-generator-cli').comment('Generator tool to use');
    table.string('generator_version').nullable().comment('Pin a specific generator version, e.g. 7.5.0');
    table.jsonb('generator_options').notNullable().defaultTo('{}').comment('Extra CLI flags / config properties');
    table.string('output_path').notNullable().comment('Relative output path inside the repo, e.g. sdk/generated/typescript');
    table.string('openapi_source').notNullable().defaultTo('backend/docs/openapi.json').comment('Path to source OpenAPI spec file');
    table.boolean('enabled').notNullable().defaultTo(true);
    table.boolean('auto_commit').notNullable().defaultTo(false).comment('Auto-commit generated files back to the branch');
    table.boolean('auto_publish').notNullable().defaultTo(false).comment('Publish package artifact on success');
    table.string('publish_registry').nullable().comment('npm / PyPI / pkg registry URL when auto_publish=true');
    table.string('publish_package_name').nullable();
    table.uuid('created_by').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('deleted_at').nullable();
    table.unique(['name']);
  });

  // Records each generation job run
  await knex.schema.createTable('openapi_generation_jobs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('config_id').notNullable()
      .references('id').inTable('openapi_client_configs').onDelete('CASCADE');
    table.enum('status', ['pending', 'running', 'succeeded', 'failed', 'cancelled'])
      .notNullable().defaultTo('pending').index();
    table.string('trigger').notNullable().defaultTo('manual')
      .comment('manual | ci | schedule | webhook');
    table.string('triggered_by').nullable().comment('User id or CI actor');
    table.string('git_ref').nullable().comment('Branch or SHA that triggered generation');
    table.string('openapi_spec_sha').nullable().comment('SHA256 of the OpenAPI spec used');
    table.string('generator_version_resolved').nullable();
    table.text('output_log').nullable();
    table.text('error_message').nullable();
    table.jsonb('artifact_urls').notNullable().defaultTo('[]').comment('URLs to generated artifact archives');
    table.jsonb('diff_summary').notNullable().defaultTo('{}').comment('Files added/modified/deleted stats');
    table.boolean('committed').notNullable().defaultTo(false);
    table.boolean('published').notNullable().defaultTo(false);
    table.timestamp('started_at').nullable();
    table.timestamp('completed_at').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now()).index();
    table.index(['config_id', 'created_at']);
    table.index(['status', 'created_at']);
  });

  // Immutable append-only audit trail
  await knex.schema.createTable('openapi_generation_events', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('job_id').notNullable()
      .references('id').inTable('openapi_generation_jobs').onDelete('CASCADE');
    table.string('event_type').notNullable()
      .comment('queued | started | log_line | spec_loaded | generated | committed | published | failed | cancelled');
    table.jsonb('payload').notNullable().defaultTo('{}');
    table.timestamp('occurred_at').notNullable().defaultTo(knex.fn.now()).index();
    table.index(['job_id', 'occurred_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('openapi_generation_events');
  await knex.schema.dropTableIfExists('openapi_generation_jobs');
  await knex.schema.dropTableIfExists('openapi_client_configs');
}
