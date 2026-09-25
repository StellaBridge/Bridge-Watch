import type { FastifyInstance } from "fastify";
import { transactionsRoutes } from "../transactions.js";
import { balanceRoutes } from "../balances.js";
import { supplyChainRoutes } from "../supplyChain.js";
import { archivedDataBrowserRoutes } from "../archivedDataBrowser.routes.js";
import { freshnessRoutes } from "../freshness.js";
import { provenanceRoutes } from "../provenance.routes.js";
// #1152 — Transaction Address Labeling Service
import { addressLabelsRoutes } from "../addressLabels.routes.js";
import { datasetColumnLineageRoutes } from "../datasetColumnLineage.routes.js";
// #1240 — Register orphaned route modules
import { dataCorrectionsRoutes } from "../dataCorrections.js";
import { artifactProvenanceRoutes } from "../artifactProvenance.routes.js";
import { publicDatasetPublicationRoutes } from "../publicDatasetPublication.routes.js";
import schemaDriftRoutes from "../schemaDrift.js";

export async function registerDataRoutes(server: FastifyInstance): Promise<void> {
  server.register(transactionsRoutes, { prefix: "/api/v1/transactions" });
  server.register(balanceRoutes, { prefix: "/api/v1/balances" });
  server.register(supplyChainRoutes, { prefix: "/api/v1/supply-chain" });
  server.register(archivedDataBrowserRoutes, { prefix: "/api/v1/archive" });
  server.register(freshnessRoutes, { prefix: "/api/v1/freshness" });
  server.register(provenanceRoutes, { prefix: "/api/v1/provenance" });
  server.register(datasetColumnLineageRoutes, { prefix: "/api/v1/datasets" });

  // #1240 — Register orphaned route modules
  server.register(dataCorrectionsRoutes, { prefix: "/api/v1/data-corrections" });
  server.register(artifactProvenanceRoutes, { prefix: "/api/v1/artifact-provenance" });
  server.register(publicDatasetPublicationRoutes, { prefix: "/api/v1/public-datasets" });
  server.register(schemaDriftRoutes, { prefix: "/api/v1/schema-drift" });
}
