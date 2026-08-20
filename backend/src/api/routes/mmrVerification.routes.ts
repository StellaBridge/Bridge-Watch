/**
 * POST /api/v1/reconciliation/verify-mmr-proof
 *
 * Verifies a Merkle Mountain Range (MMR) inclusion proof for a reserve
 * commitment leaf.  The verifier reconstructs the local subtree root from
 * the supplied siblings, substitutes it into the peaks snapshot, bags the
 * result, and compares against the caller-supplied expected root.
 *
 * This endpoint is stateless — all proof material must be supplied in the
 * request body.  For on-chain verification, call the Soroban contract's
 * `verify_mmr_proof` method instead.
 */

import type { FastifyInstance, FastifyPluginOptions, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { MmrAccumulatorService } from "../../services/mmrAccumulator.service.js";
import { logger } from "../../utils/logger.js";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const hex32Schema = z
  .string()
  .regex(/^[0-9a-fA-F]{64}$/, "Must be a 64-char hex string (32 bytes)");

const hexAnySchema = z
  .string()
  .regex(/^[0-9a-fA-F]{64}$/, "Must be a 64-char hex string (32 bytes)");

const verifyMmrProofBodySchema = z.object({
  /** Domain-separated leaf hash (SHA-256(0x00 || raw_commitment)). */
  leafHash: hex32Schema,
  /** 0-indexed leaf position in the MMR. */
  leafIndex: z.number().int().nonnegative(),
  /** Sibling hashes along the path from the leaf to its local subtree peak. */
  siblings: z.array(hexAnySchema).max(64),
  /**
   * Peaks snapshot at the time of proof generation.
   * May include empty strings ("") for inactive (zero) peak slots.
   */
  peaksSnapshot: z.array(z.string()).min(1).max(64),
  /** Index within peaksSnapshot where the proven leaf's local tree root sits. */
  localPeakPos: z.number().int().nonnegative(),
  /** Expected MMR root to verify against. */
  expectedRoot: hex32Schema,
});

const appendLeafBodySchema = z.object({
  /**
   * Raw 32-byte commitment hash to append (hex-encoded).
   * For testing/simulation only — production appends go through the
   * Soroban contract.
   */
  rawCommitment: hex32Schema,
});

const batchAppendBodySchema = z.object({
  commitments: z.array(hex32Schema).min(1).max(1000),
});

const generateProofBodySchema = z.object({
  leafIndex: z.number().int().nonnegative(),
});

// Module-level accumulator for simulation / testing (not persisted across
// server restarts; production would load from TimescaleDB or Postgres).
const simulationAccumulator = new MmrAccumulatorService();

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

export async function mmrVerificationRoutes(
  fastify: FastifyInstance,
  _options: FastifyPluginOptions
) {
  // ── POST /verify-mmr-proof ────────────────────────────────────────────────

  fastify.post(
    "/verify-mmr-proof",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = verifyMmrProofBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "Invalid request body", details: parsed.error.flatten() });
      }

      const { leafHash, leafIndex, siblings, peaksSnapshot, localPeakPos, expectedRoot } =
        parsed.data;

      try {
        const svc = new MmrAccumulatorService();

        // Normalise peaks snapshot: treat empty strings as zero-hash slots.
        const zeroPad = "0".repeat(64);
        const normalisedPeaks = peaksSnapshot.map((p) => (p === "" ? zeroPad : p));

        const proof = {
          leafHash,
          leafIndex,
          siblings,
          peaksSnapshot: normalisedPeaks,
          localPeakPos,
        };

        const { valid, reconstructedRoot } = svc.verifyProof(proof, expectedRoot);

        logger.info(
          { leafIndex, valid, expectedRoot, reconstructedRoot },
          "MMR proof verification",
        );

        return reply.code(200).send({
          valid,
          leafIndex,
          expectedRoot,
          reconstructedRoot,
          message: valid
            ? "Proof verified: leaf is included in the MMR at the expected root."
            : "Proof invalid: the reconstructed root does not match the expected root.",
        });
      } catch (error) {
        logger.error({ error }, "MMR proof verification failed");
        return reply.code(500).send({ error: "Proof verification failed" });
      }
    },
  );

  // ── POST /mmr/append ──────────────────────────────────────────────────────
  // Simulation endpoint: append a leaf to the in-memory accumulator.

  fastify.post(
    "/mmr/append",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = appendLeafBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "Invalid request body", details: parsed.error.flatten() });
      }

      try {
        const commitment = Buffer.from(parsed.data.rawCommitment, "hex");
        const result = simulationAccumulator.append(commitment);
        return reply.code(200).send({
          ...result,
          leafCount: simulationAccumulator.getLeafCount(),
          root: simulationAccumulator.getRoot(),
        });
      } catch (error) {
        logger.error({ error }, "MMR append failed");
        return reply.code(500).send({ error: "Append failed" });
      }
    },
  );

  // ── POST /mmr/append-batch ────────────────────────────────────────────────

  fastify.post(
    "/mmr/append-batch",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = batchAppendBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "Invalid request body", details: parsed.error.flatten() });
      }

      try {
        const commitments = parsed.data.commitments.map((c) => Buffer.from(c, "hex"));
        const results = simulationAccumulator.appendBatch(commitments);
        return reply.code(200).send({
          appended: results.length,
          lastLeafIndex: results[results.length - 1].leafIndex,
          root: simulationAccumulator.getRoot(),
          leafCount: simulationAccumulator.getLeafCount(),
        });
      } catch (error) {
        logger.error({ error }, "MMR batch append failed");
        return reply.code(500).send({ error: "Batch append failed" });
      }
    },
  );

  // ── POST /mmr/generate-proof ──────────────────────────────────────────────

  fastify.post(
    "/mmr/generate-proof",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = generateProofBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "Invalid request body", details: parsed.error.flatten() });
      }

      try {
        const proof = simulationAccumulator.generateProof(parsed.data.leafIndex);
        return reply.code(200).send({
          proof,
          root: simulationAccumulator.getRoot(),
          leafCount: simulationAccumulator.getLeafCount(),
        });
      } catch (error) {
        logger.error({ error }, "MMR proof generation failed");
        const msg = error instanceof Error ? error.message : "Proof generation failed";
        return reply.code(400).send({ error: msg });
      }
    },
  );

  // ── GET /mmr/state ────────────────────────────────────────────────────────

  fastify.get(
    "/mmr/state",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.code(200).send({
        root: simulationAccumulator.getRoot(),
        leafCount: simulationAccumulator.getLeafCount(),
        peaks: simulationAccumulator.getPeaks(),
      });
    },
  );
}
