import type { Knex } from "knex";

/**
 * Seed: Default circuit breaker configurations for development.
 */
export async function seed(knex: Knex): Promise<void> {
  // alert_type values mirror the on-chain AlertType enum (0-based index)
  const configs = [
    { alert_type: 0, threshold: "0.05", pause_level: 1, cooldown_period: 3600, enabled: true },  // PRICE_DEVIATION 5%
    { alert_type: 1, threshold: "0.10", pause_level: 2, cooldown_period: 7200, enabled: true },  // SUPPLY_MISMATCH 10%
    { alert_type: 2, threshold: "0.20", pause_level: 3, cooldown_period: 14400, enabled: true }, // LIQUIDITY_DROP 20%
    { alert_type: 3, threshold: "1.00", pause_level: 3, cooldown_period: 86400, enabled: true }, // BRIDGE_DOWN
  ];

  await knex("circuit_breaker_configs")
    .insert(configs)
    .onConflict("alert_type")
    .ignore();
}
