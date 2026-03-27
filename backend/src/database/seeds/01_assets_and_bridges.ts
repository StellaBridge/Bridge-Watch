import type { Knex } from "knex";

/**
 * Seed: Phase 1 monitored assets and bridges.
 * Safe to re-run — uses INSERT ... ON CONFLICT DO NOTHING.
 */
export async function seed(knex: Knex): Promise<void> {
  await knex("assets")
    .insert([
      {
        symbol: "XLM",
        name: "Stellar Lumens",
        issuer: null,
        asset_type: "native",
        bridge_provider: null,
        source_chain: null,
        is_active: true,
      },
      {
        symbol: "USDC",
        name: "USD Coin",
        issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
        asset_type: "credit_alphanum4",
        bridge_provider: "Circle",
        source_chain: "Ethereum",
        is_active: true,
      },
      {
        symbol: "PYUSD",
        name: "PayPal USD",
        issuer: "GBHZAE5IQTOPQZ66TFWZYIYCHQ6T3GMWHDKFEXAKYWJ2BHLZQ227KRYE",
        asset_type: "credit_alphanum12",
        bridge_provider: "PayPal",
        source_chain: "Ethereum",
        is_active: true,
      },
      {
        symbol: "EURC",
        name: "Euro Coin",
        issuer: "GDQOE23CFSUMSVZZ4YRVXGW7PCFNIAHLMRAHDE4Z32DIBQGH4KZZK2KZ",
        asset_type: "credit_alphanum4",
        bridge_provider: "Circle",
        source_chain: "Ethereum",
        is_active: true,
      },
      {
        symbol: "FOBXX",
        name: "Franklin OnChain U.S. Government Money Fund",
        issuer: "GBX7VUT2UTUKO2H76J26D7QYWNFW6C2NYN6K74Y3K43HGBXYZ",
        asset_type: "credit_alphanum12",
        bridge_provider: "Franklin Templeton",
        source_chain: null,
        is_active: true,
      },
    ])
    .onConflict("symbol")
    .ignore();

  await knex("bridges")
    .insert([
      {
        name: "Circle USDC Bridge",
        source_chain: "Ethereum",
        status: "unknown",
        total_value_locked: 0,
        supply_on_stellar: 0,
        supply_on_source: 0,
        is_active: true,
      },
      {
        name: "Circle EURC Bridge",
        source_chain: "Ethereum",
        status: "unknown",
        total_value_locked: 0,
        supply_on_stellar: 0,
        supply_on_source: 0,
        is_active: true,
      },
    ])
    .onConflict("name")
    .ignore();
}
