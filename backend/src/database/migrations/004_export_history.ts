import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("export_history", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("requested_by").notNullable();
    table
      .string("format")
      .notNullable()
      .checkIn(["csv", "json", "pdf"]);
    table
      .string("data_type")
      .notNullable()
      .checkIn(["analytics", "transactions", "health_metrics"]);
    table.jsonb("filters").notNullable();
    table
      .string("status")
      .notNullable()
      .defaultTo("pending")
      .checkIn(["pending", "processing", "completed", "failed"]);
    table.string("file_path").nullable();
    table.string("download_url").nullable();
    table.timestamp("download_url_expires_at").nullable();
    table.bigInteger("file_size_bytes").nullable();
    table.boolean("is_compressed").defaultTo(false);
    table.text("error_message").nullable();
    table.boolean("email_delivery").defaultTo(false);
    table.string("email_address").nullable();
    table.timestamps(true, true);

    table.index(["requested_by", "created_at"]);
    table.index(["status"]);
    table.index(["data_type"]);
  });

  // Create scheduled_exports table for recurring reports
  await knex.schema.createTable("scheduled_exports", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("owner_address").notNullable();
    table.string("name").notNullable();
    table
      .string("format")
      .notNullable()
      .checkIn(["csv", "json", "pdf"]);
    table
      .string("data_type")
      .notNullable()
      .checkIn(["analytics", "transactions", "health_metrics"]);
    table.jsonb("filters").notNullable();
    table.string("cron_schedule").notNullable();
    table.boolean("email_delivery").defaultTo(false);
    table.string("email_address").nullable();
    table.boolean("is_active").defaultTo(true);
    table.timestamp("last_run_at").nullable();
    table.timestamp("next_run_at").nullable();
    table.timestamps(true, true);

    table.index(["owner_address"]);
    table.index(["is_active", "next_run_at"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("scheduled_exports");
  await knex.schema.dropTableIfExists("export_history");
}
