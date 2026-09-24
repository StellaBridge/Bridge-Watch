import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('contract_deployments', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('contract_address').notNullable().unique().index();
    table.string('contract_name').notNullable();
    table.string('contract_type').notNullable().index();
    table.string('chain_id').notNullable().index();
    table.string('bridge_id').nullable().index();
    table.string('deployment_version').notNullable();
    table.string('code_hash').nullable();
    table.timestamp('deployed_at').notNullable().index();
    table.uuid('deployed_by').nullable();
    table.jsonb('deployment_params').defaultTo('{}');
    table.jsonb('abi').nullable();
    table.jsonb('source_code').nullable();
    table.string('deployment_tx_hash').nullable().unique();
    table.enum('status', ['active', 'paused', 'deprecated', 'emergency_paused']).defaultTo('active').index();
    table.text('deployment_notes').nullable();
    table.timestamp('audited_at').nullable();
    table.uuid('audited_by').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now()).index();
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.timestamp('deleted_at').nullable().index();
    table.index(['contract_type', 'chain_id', 'status']);
  });

  await knex.schema.createTable('contract_upgrade_history', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('contract_id').notNullable().references('id').inTable('contract_deployments').onDelete('CASCADE');
    table.string('from_version').notNullable();
    table.string('to_version').notNullable();
    table.string('upgrade_tx_hash').nullable();
    table.timestamp('upgraded_at').defaultTo(knex.fn.now()).index();
    table.uuid('upgraded_by').nullable();
    table.jsonb('upgrade_params').defaultTo('{}');
    table.enum('status', ['completed', 'failed', 'rolled_back']).defaultTo('completed').index();
    table.text('upgrade_notes').nullable();
    table.jsonb('compatibility_validation').defaultTo('{}');
    table.timestamp('created_at').defaultTo(knex.fn.now()).index();
    table.index(['contract_id', 'upgraded_at']);
  });

  await knex.schema.createTable('contract_verifications', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('contract_id').notNullable().references('id').inTable('contract_deployments').onDelete('CASCADE');
    table.string('verification_type').notNullable();
    table.boolean('verified').defaultTo(false);
    table.jsonb('verification_data').defaultTo('{}');
    table.text('verification_error').nullable();
    table.timestamp('verified_at').defaultTo(knex.fn.now()).index();
    table.uuid('verified_by').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.index(['contract_id', 'verification_type']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('contract_verifications');
  await knex.schema.dropTableIfExists('contract_upgrade_history');
  await knex.schema.dropTableIfExists('contract_deployments');
}
