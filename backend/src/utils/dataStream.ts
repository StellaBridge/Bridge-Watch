import { getDatabase } from "../database/connection.js";
import { config } from "../config/index.js";
import type { ExportDataType, ExportFilters } from "../types/export.types.js";
import { logger } from "../utils/logger.js";

/**
 * Async generator that streams data from the database using keyset (cursor)
 * pagination instead of OFFSET-based pagination.
 *
 * Keyset pagination uses the last-seen value of the ORDER BY column to fetch
 * the next page, so the database can seek directly via the index without
 * scanning and discarding preceding rows. This keeps memory bounded to
 * PAGE_SIZE records regardless of total dataset size and avoids the
 * O(N) performance degradation of OFFSET on large tables.
 *
 * @param dataType - The type of data to stream
 * @param filters - Filters to apply to the data query
 * @yields Individual data records
 */
export async function* streamData(
  dataType: ExportDataType,
  filters: ExportFilters
): AsyncGenerator<any, void, unknown> {
  const db = getDatabase();
  const pageSize = config.EXPORT_STREAMING_PAGE_SIZE;
  const maxRows = config.EXPORT_STREAMING_MAX_ROWS ?? 0;
  let yielded = 0;

  // Cursor holds the last seen value of the ORDER BY column for keyset pagination.
  // Starts as null (first page has no cursor constraint).
  let cursor: Date | string | number | null = null;

  logger.info({ dataType, filters, pageSize, maxRows }, "Starting data stream");

  while (true) {
    let records: any[];

    try {
      switch (dataType) {
        case "analytics":
          records = await fetchAnalyticsData(db, filters, pageSize, cursor);
          break;
        case "transactions":
          records = await fetchTransactionsData(db, filters, pageSize, cursor);
          break;
        case "health_metrics":
          records = await fetchHealthMetricsData(db, filters, pageSize, cursor);
          break;
        default:
          throw new Error(`Unsupported data type: ${dataType}`);
      }

      if (records.length === 0) break;

      for (const record of records) {
        yield record;
        yielded++;

        if (maxRows > 0 && yielded >= maxRows) {
          logger.info({ dataType, yielded, maxRows }, "Data stream hit max row limit");
          return;
        }
      }

      // If fewer records than pageSize, we've reached the end
      if (records.length < pageSize) break;

      // Advance cursor to the ORDER BY value of the last record
      cursor = getCursorValue(dataType, records[records.length - 1]);
    } catch (error) {
      logger.error({ error, dataType, yielded }, "Error streaming data");
      throw error;
    }
  }

  logger.info({ dataType, totalRecords: yielded }, "Data stream completed");
}

// ---------------------------------------------------------------------------
// Cursor helpers
// ---------------------------------------------------------------------------

function getCursorValue(dataType: ExportDataType, lastRecord: any): Date | string | number {
  switch (dataType) {
    case "analytics":
      return new Date(lastRecord.time);
    case "transactions":
      return new Date(lastRecord.verified_at);
    case "health_metrics":
      return new Date(lastRecord.time);
    default:
      throw new Error(`Unsupported data type: ${dataType}`);
  }
}

// ---------------------------------------------------------------------------
// Per-type fetch functions — keyset pagination: WHERE <col> < cursor
// (ordering is DESC so the next page is strictly less than the cursor)
// ---------------------------------------------------------------------------

/**
 * Fetch analytics data (prices with VWAP and sources)
 */
async function fetchAnalyticsData(
  db: any,
  filters: ExportFilters,
  limit: number,
  cursor: Date | string | number | null
): Promise<any[]> {
  let query = db("prices")
    .select("time", "symbol", "source", "price", "volume_24h")
    .whereBetween("time", [new Date(filters.startDate), new Date(filters.endDate)])
    .orderBy("time", "desc")
    .limit(limit);

  if (cursor) {
    query = query.where("time", "<", cursor);
  }

  if (filters.assetCodes && filters.assetCodes.length > 0) {
    query = query.whereIn("symbol", filters.assetCodes);
  }

  return query;
}

/**
 * Fetch transactions data (verification results)
 */
async function fetchTransactionsData(
  db: any,
  filters: ExportFilters,
  limit: number,
  cursor: Date | string | number | null
): Promise<any[]> {
  let query = db("verification_results")
    .select(
      "verified_at",
      "bridge_id",
      "sequence",
      "leaf_hash",
      "leaf_index",
      "is_valid",
      "proof_depth",
      "metadata",
      "job_id"
    )
    .whereBetween("verified_at", [new Date(filters.startDate), new Date(filters.endDate)])
    .orderBy("verified_at", "desc")
    .limit(limit);

  if (cursor) {
    query = query.where("verified_at", "<", cursor);
  }

  if (filters.bridgeIds && filters.bridgeIds.length > 0) {
    query = query.whereIn("bridge_id", filters.bridgeIds);
  }

  return query;
}

/**
 * Fetch health metrics data
 */
async function fetchHealthMetricsData(
  db: any,
  filters: ExportFilters,
  limit: number,
  cursor: Date | string | number | null
): Promise<any[]> {
  let query = db("health_scores")
    .select(
      "time",
      "symbol",
      "overall_score",
      "liquidity_depth_score",
      "price_stability_score",
      "bridge_uptime_score",
      "reserve_backing_score",
      "volume_trend_score"
    )
    .whereBetween("time", [new Date(filters.startDate), new Date(filters.endDate)])
    .orderBy("time", "desc")
    .limit(limit);

  if (cursor) {
    query = query.where("time", "<", cursor);
  }

  if (filters.assetCodes && filters.assetCodes.length > 0) {
    query = query.whereIn("symbol", filters.assetCodes);
  }

  return query;
}

/**
 * Count total records for a given data type and filters
 * Used for progress tracking and pagination metadata
 */
export async function countRecords(
  dataType: ExportDataType,
  filters: ExportFilters
): Promise<number> {
  const db = getDatabase();

  let query;
  switch (dataType) {
    case "analytics":
      query = db("prices")
        .count("* as count")
        .whereBetween("time", [new Date(filters.startDate), new Date(filters.endDate)]);
      if (filters.assetCodes && filters.assetCodes.length > 0) {
        query = query.whereIn("symbol", filters.assetCodes);
      }
      break;
    case "transactions":
      query = db("verification_results")
        .count("* as count")
        .whereBetween("verified_at", [new Date(filters.startDate), new Date(filters.endDate)]);
      if (filters.bridgeIds && filters.bridgeIds.length > 0) {
        query = query.whereIn("bridge_id", filters.bridgeIds);
      }
      break;
    case "health_metrics":
      query = db("health_scores")
        .count("* as count")
        .whereBetween("time", [new Date(filters.startDate), new Date(filters.endDate)]);
      if (filters.assetCodes && filters.assetCodes.length > 0) {
        query = query.whereIn("symbol", filters.assetCodes);
      }
      break;
    default:
      throw new Error(`Unsupported data type: ${dataType}`);
  }

  const result = await query.first();
  return typeof result?.count === "number" ? result.count : parseInt(String(result?.count || "0"), 10);
}
