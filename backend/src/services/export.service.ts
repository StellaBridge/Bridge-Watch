import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";
import { config } from "../config/index.js";
import crypto from "crypto";
import type {
  ExportRequest,
  ExportRecord,
  ExportJobPayload,
  DownloadLink,
  PaginationOptions,
  PaginatedExports,
} from "../types/export.types.js";
import { exportQueue } from "../jobs/export.job.js";

/**
 * Export Service
 * 
 * Handles creation, tracking, and management of data exports.
 * Integrates with BullMQ queue for async processing.
 */
export class ExportService {
  /**
   * Request a new export
   * Creates a database record and enqueues a job for processing
   * 
   * @param userId - User requesting the export
   * @param payload - Export request parameters
   * @returns Created export record with job ID
   */
  async requestExport(userId: string, payload: ExportRequest): Promise<ExportRecord> {
    logger.info({ userId, payload }, "Requesting new export");

    // Validate date range
    this.validateDateRange(payload.filters.startDate, payload.filters.endDate);

    // Validate email if delivery requested
    if (payload.emailDelivery && !payload.emailAddress) {
      throw new Error("Email address required when email delivery is enabled");
    }

    const db = getDatabase();

    // Create export history record
    const [record] = await db("export_history")
      .insert({
        requested_by: userId,
        format: payload.format,
        data_type: payload.dataType,
        filters: JSON.stringify(payload.filters),
        status: "pending",
        email_delivery: payload.emailDelivery || false,
        email_address: payload.emailAddress || null,
      })
      .returning("*");

    logger.info({ exportId: record.id, userId }, "Export record created");

    // Enqueue export job
    const jobPayload: ExportJobPayload = {
      exportId: record.id,
      requestedBy: userId,
      format: payload.format,
      dataType: payload.dataType,
      filters: payload.filters,
      emailDelivery: payload.emailDelivery || false,
      emailAddress: payload.emailAddress,
    };

    await exportQueue.add("process-export", jobPayload, {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
      removeOnComplete: {
        age: 86400, // Keep completed jobs for 24 hours
        count: 1000,
      },
      removeOnFail: {
        age: 604800, // Keep failed jobs for 7 days
      },
    });

    logger.info({ exportId: record.id, jobPayload }, "Export job enqueued");

    return this.mapDatabaseRecord(record);
  }

  /**
   * Get export status by ID
   * 
   * @param exportId - Export record ID
   * @returns Export record with current status
   */
  async getExportStatus(exportId: string): Promise<ExportRecord | null> {
    logger.info({ exportId }, "Fetching export status");

    const db = getDatabase();
    const record = await db("export_history").where({ id: exportId }).first();

    if (!record) {
      logger.warn({ exportId }, "Export record not found");
      return null;
    }

    return this.mapDatabaseRecord(record);
  }

  /**
   * List exports for a user with pagination
   * 
   * @param userId - User ID to filter exports
   * @param options - Pagination options
   * @returns Paginated list of exports
   */
  async listExports(userId: string, options: PaginationOptions): Promise<PaginatedExports> {
    logger.info({ userId, options }, "Listing exports");

    const db = getDatabase();
    const { page, limit } = options;
    const offset = (page - 1) * limit;

    const [records, countResult] = await Promise.all([
      db("export_history")
        .where({ requested_by: userId })
        .orderBy("created_at", "desc")
        .limit(limit)
        .offset(offset),
      db("export_history").where({ requested_by: userId }).count("* as count").first(),
    ]);

    const total = typeof countResult?.count === "number"
      ? countResult.count
      : parseInt(String(countResult?.count || "0"), 10);

    return {
      exports: records.map((r) => this.mapDatabaseRecord(r)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Generate or refresh download URL for an export
   * 
   * @param exportId - Export record ID
   * @returns Download link with expiry
   */
  async generateDownloadUrl(exportId: string): Promise<DownloadLink> {
    logger.info({ exportId }, "Generating download URL");

    const db = getDatabase();
    const record = await db("export_history").where({ id: exportId }).first();

    if (!record) {
      throw new Error("Export not found");
    }

    if (record.status !== "completed") {
      throw new Error(`Export is not completed (status: ${record.status})`);
    }

    if (!record.file_path) {
      throw new Error("Export file path not found");
    }

    // Generate signed URL token
    const token = this.generateDownloadToken(exportId);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + config.EXPORT_DOWNLOAD_URL_EXPIRY_HOURS);

    // In a real implementation with cloud storage (S3/GCS), this would generate a pre-signed URL
    // For local storage, we use a token-based approach
    const downloadUrl = `/api/v1/exports/${exportId}/download?token=${token}`;

    // Update record with new URL and expiry
    await db("export_history")
      .where({ id: exportId })
      .update({
        download_url: downloadUrl,
        download_url_expires_at: expiresAt,
        updated_at: db.fn.now(),
      });

    logger.info({ exportId, expiresAt }, "Download URL generated");

    return {
      url: downloadUrl,
      expiresAt,
    };
  }

  /**
   * Delete an export and its associated file
   * 
   * @param exportId - Export record ID
   */
  async deleteExport(exportId: string): Promise<void> {
    logger.info({ exportId }, "Deleting export");

    const db = getDatabase();
    const record = await db("export_history").where({ id: exportId }).first();

    if (!record) {
      throw new Error("Export not found");
    }

    // Delete file if it exists
    if (record.file_path) {
      try {
        const fs = await import("fs/promises");
        await fs.unlink(record.file_path);
        logger.info({ exportId, filePath: record.file_path }, "Export file deleted");
      } catch (error) {
        logger.error({ error, exportId, filePath: record.file_path }, "Failed to delete export file");
        // Continue with database deletion even if file deletion fails
      }
    }

    // Delete database record
    await db("export_history").where({ id: exportId }).del();

    logger.info({ exportId }, "Export record deleted");
  }

  /**
   * Update export status (used by worker)
   * 
   * @param exportId - Export record ID
   * @param updates - Fields to update
   */
  async updateExportStatus(exportId: string, updates: Partial<ExportRecord>): Promise<void> {
    logger.info({ exportId, updates }, "Updating export status");

    const db = getDatabase();

    // Map camelCase to snake_case for database
    const dbUpdates: any = {
      updated_at: db.fn.now(),
    };

    if (updates.status) dbUpdates.status = updates.status;
    if (updates.file_path) dbUpdates.file_path = updates.file_path;
    if (updates.download_url) dbUpdates.download_url = updates.download_url;
    if (updates.download_url_expires_at) dbUpdates.download_url_expires_at = updates.download_url_expires_at;
    if (updates.file_size_bytes !== undefined) dbUpdates.file_size_bytes = updates.file_size_bytes;
    if (updates.is_compressed !== undefined) dbUpdates.is_compressed = updates.is_compressed;
    if (updates.error_message !== undefined) dbUpdates.error_message = updates.error_message;

    await db("export_history").where({ id: exportId }).update(dbUpdates);

    logger.info({ exportId }, "Export status updated");
  }

  /**
   * Validate date range
   */
  private validateDateRange(startDate: string, endDate: string): void {
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new Error("Invalid date format");
    }

    if (start >= end) {
      throw new Error("Start date must be before end date");
    }

    const daysDiff = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    if (daysDiff > config.EXPORT_MAX_DATE_RANGE_DAYS) {
      throw new Error(
        `Date range exceeds maximum of ${config.EXPORT_MAX_DATE_RANGE_DAYS} days`
      );
    }
  }

  /**
   * Generate download token for URL signing
   */
  private generateDownloadToken(exportId: string): string {
    const secret = process.env.JWT_SECRET || "default-secret-change-in-production";
    const data = `${exportId}:${Date.now()}`;
    return crypto.createHmac("sha256", secret).update(data).digest("hex");
  }

  /**
   * Map database record to ExportRecord type
   */
  private mapDatabaseRecord(record: any): ExportRecord {
    return {
      id: record.id,
      requested_by: record.requested_by,
      format: record.format,
      data_type: record.data_type,
      filters: typeof record.filters === "string" ? JSON.parse(record.filters) : record.filters,
      status: record.status,
      file_path: record.file_path,
      download_url: record.download_url,
      download_url_expires_at: record.download_url_expires_at,
      file_size_bytes: record.file_size_bytes,
      is_compressed: record.is_compressed,
      error_message: record.error_message,
      email_delivery: record.email_delivery,
      email_address: record.email_address,
      created_at: record.created_at,
      updated_at: record.updated_at,
    };
  }
}
