/**
 * Periodic SHA-256 Audit Chain Verification Job
 * 
 * Runs daily to verify the integrity of the audit log hash chain.
 * Checks that entry[i].previous_checksum === sha256(entry[i-1]) across all new records.
 * Publishes high-severity incidents if tamper detection finds a mismatch.
 * 
 * Issue #1265
 */

import crypto from "crypto";
import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";
import { auditService } from "../services/audit.service.js";

export interface ChainVerificationResult {
  verified: number;
  tampered: number;
  missing: number;
  errors: string[];
  startTime: Date;
  endTime: Date;
}

/**
 * Compute SHA-256 checksum for an audit entry (excluding id, checksum, createdAt)
 */
function computeEntryChecksum(entry: Record<string, unknown>): string {
  const payload = JSON.stringify({
    action: entry.action,
    actor_id: entry.actor_id,
    actor_type: entry.actor_type,
    ip_address: entry.ip_address,
    resource_type: entry.resource_type,
    resource_id: entry.resource_id,
    before: entry.before,
    after: entry.after,
    severity: entry.severity,
  });
  return crypto.createHash("sha256").update(payload).digest("hex");
}

/**
 * Verify the audit log chain integrity
 */
export async function verifyAuditLogChain(
  batchSize: number = 1000
): Promise<ChainVerificationResult> {
  const startTime = new Date();
  const db = getDatabase();
  
  let verified = 0;
  let tampered = 0;
  let missing = 0;
  const errors: string[] = [];

  try {
    // Get total count
    const [{ count: totalCount }] = await db("audit_logs").count("id as count");
    const total = Number(totalCount);

    logger.info({ total, batchSize }, "Starting audit log chain verification");

    // Process in batches
    for (let offset = 0; offset < total; offset += batchSize) {
      const batch = await db("audit_logs")
        .select("*")
        .orderBy("created_at", "asc")
        .offset(offset)
        .limit(batchSize);

      for (let i = 0; i < batch.length; i++) {
        const entry = batch[i];
        
        // Verify checksum matches
        const expectedChecksum = computeEntryChecksum(entry);
        if (entry.checksum !== expectedChecksum) {
          tampered++;
          const errorMsg = `Tamper detected at entry ${entry.id}: expected ${expectedChecksum}, got ${entry.checksum}`;
          errors.push(errorMsg);
          logger.error({ entryId: entry.id, expected: expectedChecksum, actual: entry.checksum }, "Audit chain tamper detected");
          
          // Publish high-severity incident
          await publishTamperIncident(entry.id, expectedChecksum, entry.checksum);
        } else {
          verified++;
        }

        // Verify chain link (previous_checksum matches previous entry's checksum)
        if (i > 0) {
          const prevEntry = batch[i - 1];
          if (entry.previous_checksum !== prevEntry.checksum) {
            missing++;
            const errorMsg = `Chain break at entry ${entry.id}: previous_checksum ${entry.previous_checksum} does not match previous entry's checksum ${prevEntry.checksum}`;
            errors.push(errorMsg);
            logger.error({ entryId: entry.id, expected: prevEntry.checksum, actual: entry.previous_checksum }, "Audit chain link broken");
            
            await publishChainBreakIncident(entry.id, prevEntry.checksum, entry.previous_checksum);
          }
        }
      }
    }

    const endTime = new Date();
    const durationMs = endTime.getTime() - startTime.getTime();

    logger.info({ verified, tampered, missing, durationMs }, "Audit log chain verification completed");

    return { verified, tampered, missing, errors, startTime, endTime };
  } catch (error) {
    const endTime = new Date();
    logger.error({ error, verified, tampered, missing }, "Audit chain verification failed");
    
    return {
      verified,
      tampered,
      missing,
      errors: [...errors, `Verification failed: ${error instanceof Error ? error.message : String(error)}`],
      startTime,
      endTime,
    };
  }
}

/**
 * Publish a high-severity incident for tamper detection
 */
async function publishTamperIncident(
  entryId: string,
  expectedChecksum: string,
  actualChecksum: string
): Promise<void> {
  try {
    const db = getDatabase();
    
    await db("incidents").insert({
      id: crypto.randomUUID(),
      type: "audit_chain_tamper",
      severity: "critical",
      title: "Audit Log Tamper Detected",
      description: `Audit entry ${entryId} has been tampered with. Expected checksum: ${expectedChecksum}, found: ${actualChecksum}`,
      metadata: JSON.stringify({
        entryId,
        expectedChecksum,
        actualChecksum,
        detectedAt: new Date().toISOString(),
      }),
      status: "open",
      created_at: new Date(),
    });

    logger.fatal({ entryId }, "Audit chain tamper incident published");
  } catch (error) {
    logger.error({ error, entryId }, "Failed to publish tamper incident");
  }
}

/**
 * Publish a high-severity incident for chain breaks
 */
async function publishChainBreakIncident(
  entryId: string,
  expectedPrevious: string,
  actualPrevious: string
): Promise<void> {
  try {
    const db = getDatabase();
    
    await db("incidents").insert({
      id: crypto.randomUUID(),
      type: "audit_chain_break",
      severity: "critical",
      title: "Audit Log Chain Break Detected",
      description: `Audit entry ${entryId} has a broken chain link. Expected previous checksum: ${expectedPrevious}, found: ${actualPrevious}`,
      metadata: JSON.stringify({
        entryId,
        expectedPrevious,
        actualPrevious,
        detectedAt: new Date().toISOString(),
      }),
      status: "open",
      created_at: new Date(),
    });

    logger.fatal({ entryId }, "Audit chain break incident published");
  } catch (error) {
    logger.error({ error, entryId }, "Failed to publish chain break incident");
  }
}

/**
 * Job entry point - called by the job scheduler
 */
export async function runVerifyAuditLogChainJob(): Promise<ChainVerificationResult> {
  logger.info("Starting scheduled audit log chain verification");
  
  const result = await verifyAuditLogChain();
  
  if (result.tampered > 0 || result.missing > 0) {
    logger.fatal({
      tampered: result.tampered,
      missing: result.missing,
      errors: result.errors,
    }, "Audit log chain verification found integrity issues");
  } else {
    logger.info({ verified: result.verified }, "Audit log chain verification passed");
  }
  
  return result;
}
