import type { FastifyInstance } from "fastify";
import { ledgerCloseDelayRoutes } from "../ledgerCloseDelay.routes.js";
import { horizonCursorAuditRoutes } from "../horizonCursorAudit.routes.js";
import { reserveAttestationsRoutes } from "../reserveAttestations.routes.js";
import { contractStorageFootprintRoutes } from "../contractStorageFootprint.routes.js";
import { chainAdapterRegistryRoutes } from "../chainAdapterRegistry.routes.js";
import { ledgerEntriesRoutes } from "../ledgerEntries.routes.js";

export async function registerOperationalMonitoringRoutes(server: FastifyInstance): Promise<void> {
  server.register(ledgerCloseDelayRoutes, {
    prefix: "/api/v1/ledger-close-delays",
  });
  server.register(horizonCursorAuditRoutes, {
    prefix: "/api/v1/horizon-cursor-audit",
  });
  server.register(reserveAttestationsRoutes, {
    prefix: "/api/v1/reserve-attestations",
  });
  server.register(contractStorageFootprintRoutes, {
    prefix: "/api/v1/contract-storage",
  });
  server.register(chainAdapterRegistryRoutes, {
    prefix: "/api/v1/chain-adapters",
  });
  // #1200 — Ledger Entry Inspection API
  server.register(ledgerEntriesRoutes, {
    prefix: "/api/v1/ledger-entries",
  });
}
