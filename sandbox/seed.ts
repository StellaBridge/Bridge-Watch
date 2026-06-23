#!/usr/bin/env tsx
import dotenv from "dotenv";
import knex from "knex";
import {
  MOCK_ASSETS,
  MOCK_BRIDGES,
  generatePriceHistory,
  generateHealthScores,
  generateIncidentHistory,
} from "./mockData.js";

dotenv.config();

const db = knex({
  client: "pg",
  connection: {
    host: process.env.POSTGRES_HOST || "localhost",
    port: Number(process.env.POSTGRES_PORT || 5432),
    database: process.env.POSTGRES_DB || "bridge_watch",
    user: process.env.POSTGRES_USER || "bridge_watch",
    password: process.env.POSTGRES_PASSWORD || "bridge_watch_dev",
  },
});

async function seed() {
  console.log("Seeding sandbox database...");

  await db.raw("TRUNCATE TABLE health_scores, prices, alert_events, alert_rules, incidents, operator_notes, tags, tag_audit_log, verification_results, reserve_commitments, bridge_operators, bridges, assets RESTART IDENTITY CASCADE");

  console.log("  Inserting assets...");
  for (const asset of MOCK_ASSETS) {
    await db("assets").insert(asset);
  }

  console.log("  Inserting bridges...");
  for (const bridge of MOCK_BRIDGES) {
    await db("bridges").insert(bridge);
  }

  console.log("  Generating 30 days of price history...");
  const priceData = [
    ...generatePriceHistory(1.0, 30, 0.005),
    ...generatePriceHistory(1.087, 30, 0.008),
    ...generatePriceHistory(0.023, 30, 0.05),
    ...generatePriceHistory(1.001, 30, 0.003),
    ...generatePriceHistory(67000, 30, 0.03),
  ];
  if (priceData.length > 0) {
    await db("prices").insert(
      priceData.map((p) => ({
        time: p.time,
        symbol: "USDC",
        source: p.source,
        price: p.price,
      }))
    );
  }

  console.log("  Generating 7 days of health scores...");
  const healthScores = generateHealthScores(7);
  if (healthScores.length > 0) {
    await db("health_scores").insert(
      healthScores.map((h) => ({
        time: h.time,
        symbol: h.symbol,
        overall_score: Math.round(h.overall),
        liquidity_depth_score: Math.round(h.liquidity),
        price_stability_score: Math.round(h.price),
        bridge_uptime_score: Math.round(h.bridge),
        reserve_backing_score: Math.round(h.reserve),
        volume_trend_score: Math.round(h.volume),
      }))
    );
  }

  console.log("  Generating 30 days of incident history...");
  const incidents = generateIncidentHistory(30);
  for (const incident of incidents) {
    await db("incidents").insert(incident);
  }

  console.log("Sandbox seeded successfully.");
  console.log(`  - ${MOCK_ASSETS.length} assets`);
  console.log(`  - ${MOCK_BRIDGES.length} bridges`);
  console.log(`  - ${priceData.length} price records`);
  console.log(`  - ${healthScores.length} health score records`);
  console.log(`  - ${incidents.length} incidents`);

  await db.destroy();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
