import { Worker, Queue } from "bullmq";
import { createWriteStream } from "fs";
import { mkdir } from "fs/promises";
import { pipeline } from "stream/promises";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";
import { streamData } from "../utils/dataStream.js";
import { sendExportEmail } from "../utils/email.js";
import { CSVHandler } from "../services/formatHandlers/csv.handler.js";
import { JSONHandler } from "../services/formatHandlers/json.handler.js";
import { PDFHandler } from "../services/formatHandlers/pdf.handler.js";
import type { ExportJobPayload } from "../types/export.types.js";
import { getDatabase } from "../database/connection.js";
import path from "path";

const QUEUE_NAME = "export-queue";

const connection = {
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
  password: config.REDIS_PASSWORD || undefined,
};

export const exportQueue = new Queue(QUEUE_NAME, { connection });

/**
 * Determine if compression should be applied
 * For now, always compress CSV and JSON if they exceed threshold
 * PDF is not compressed
 */
function shouldCompress(payload: ExportJobPayload): boolean {
  if (payload.format === "pdf") {
    return false;
  }

  // For simplicity, we'll compress all CSV and JSON exports
  // In a production system, you might estimate size first
  return true;
}

/**
 * Get file extension based on format and compression
 */
function getFileExtension(format: string, compressed: boolean): string {
  if (compressed) {
    return `${format}.gz`;
  }
  return format;
}

/**
 * Export Queue Worker
 * 
 * Processes export jobs asynchronously:
 * 1. Updates status to processing
 * 2. Fetches data using streaming
 * 3. Generates output in requested format
 * 4. Applies compression if needed
 * 5. Saves file to storage
 * 6. Generates download URL
 * 7. Sends email if requested
 * 8. Updates status to completed or failed
 */
export const exportWorker = new Worker(
  QUEUE_NAME,
  async (job) => {
    const payload: ExportJobPayload = job.data;
    logger.info({ jobId: job.id, payload }, "Processing export job");

    const db = getDatabase();

    try {
      // Update status to processing
      await db("export_history")
        .where({ id: payload.exportId })
        .update({ status: "processing", updated_at: db.fn.now() });

      // Ensure export directory exists
      await mkdir(config.EXPORT_STORAGE_PATH, { recursive: true });

      // Determine file extension
      const isCompressed = shouldCompress(payload);
      const extension = getFileExtension(payload.format, isCompressed);
      const fileName = `${payload.exportId}.${extension}`;
      const filePath = path.join(config.EXPORT_STORAGE_PATH, fileName);

      // Stream data from database
      const dataStream = streamData(payload.dataType, payload.filters);

      // Generate output using appropriate format handler
      let outputStream: NodeJS.ReadableStream;
      const csvHandler = new CSVHandler();
      const jsonHandler = new JSONHandler();
      const pdfHandler = new PDFHandler();

      switch (payload.format) {
        case "csv":
          outputStream = await csvHandler.generate(dataStream, payload.dataType, isCompressed);
          break;
        case "json":
          outputStream = await jsonHandler.generate(dataStream, payload.dataType, isCompressed);
          break;
        case "pdf":
          outputStream = await pdfHandler.generate(dataStream, payload.dataType, false);
          break;
        default:
          throw new Error(`Unsupported format: ${payload.format}`);
      }

      // Write to file
      const fileStream = createWriteStream(filePath);
      await pipeline(outputStream, fileStream);

      // Get file size
      const fs = await import("fs/promises");
      const stats = await fs.stat(filePath);
      const fileSizeBytes = stats.size;

      logger.info(
        { exportId: payload.exportId, filePath, fileSizeBytes },
        "Export file generated successfully"
      );

      // Generate download URL
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + config.EXPORT_DOWNLOAD_URL_EXPIRY_HOURS);
      const downloadUrl = `/api/v1/exports/${payload.exportId}/download`;

      // Update record with completion details
      await db("export_history")
        .where({ id: payload.exportId })
        .update({
          status: "completed",
          file_path: filePath,
          download_url: downloadUrl,
          download_url_expires_at: expiresAt,
          file_size_bytes: fileSizeBytes,
          is_compressed: isCompressed,
          updated_at: db.fn.now(),
        });

      logger.info({ exportId: payload.exportId }, "Export completed successfully");

      // Send email if requested
      if (payload.emailDelivery && payload.emailAddress) {
        try {
          const record = await db("export_history").where({ id: payload.exportId }).first();
          await sendExportEmail(
            {
              ...record,
              filters: typeof record.filters === "string" ? JSON.parse(record.filters) : record.filters,
            },
            payload.emailAddress
          );
          logger.info(
            { exportId: payload.exportId, email: payload.emailAddress },
            "Export email sent successfully"
          );
        } catch (emailError) {
          // Email failure should not fail the export job
          logger.error(
            { error: emailError, exportId: payload.exportId },
            "Failed to send export email, but export completed successfully"
          );
        }
      }

      return { success: true, exportId: payload.exportId, filePath };
    } catch (error) {
      logger.error({ error, exportId: payload.exportId }, "Export job failed");

      // Update record with failure details
      await db("export_history")
        .where({ id: payload.exportId })
        .update({
          status: "failed",
          error_message: error instanceof Error ? error.message : String(error),
          updated_at: db.fn.now(),
        });

      throw error;
    }
  },
  {
    connection,
    concurrency: config.EXPORT_QUEUE_CONCURRENCY,
  }
);

// Worker event handlers
exportWorker.on("completed", (job) => {
  logger.info({ jobId: job?.id }, "Export job completed");
});

exportWorker.on("failed", (job, error) => {
  logger.error(
    { jobId: job?.id, error: error.message },
    "Export job failed"
  );
});

exportWorker.on("error", (error) => {
  logger.error({ error }, "Export worker error");
});

logger.info("Export worker initialized");
