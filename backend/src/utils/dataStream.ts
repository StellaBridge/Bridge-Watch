import { getDatabase } from "../database/connection.js";
import { config } from "../config/index.js";
import type { ExportDataType, ExportFilters } from "../types/export.types.js";
import { logger } from "./logger.js";

/**
 * Async generator that streams data from the database in configurable page sizes
 * to avoid loading entire datasets into memory.
 * 
 * Memory profile: Bounded to PAGE_SIZE * record_size regardless of total dataset size.
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
  let offset = 0;
  let hasMore = true;

  logger.info({ dataType, filters, pageSize }, "Starting data stream");

  while (hasMore) {
    let records: any[] = [];

    try {
      switch (dataType) {
        case "analytics":
          records = await fetchAnalyticsData(db, filters, pageSize, offset);
          break;
        case "transactions":
          records = await fetchTransactionsData(db, filters, pageSize, offset);
          break;
        case "health_metrics":
          records = await fetchHealthMetricsData(db, filters, pageSize, offset);
          break;
        default:
          throw new Error(`Unsupported data type: ${dataType}`);
      }

      if (records.length === 0) {
        hasMore = false;
        break;
      }

      // Yield each record individually for streaming
      for (const record of records) {
        yield record;
      }

      // Check if we've reached the limit or end of data
      if (filters.limit && offset + records.length >= filters.limit) {
        hasMore = false;
      } else if (records.length < pageSize) {
        hasMore = false;
      } else {
        offset += pageSize;
      }
    } catch (error) {
      logger.error({ error, dataType, offset }, "Error streaming data");
      throw error;
    }
  }

  logger.info({ dataType, totalRecords: offset }, "Data stream completed");
}

/**
 * Fetch analytics data (prices with VWAP and sources)
 */
async function fetchAnalyticsData(
  db: any,
  filters: ExportFilters,
  limit: number,
  offset: number
): Promise<any[]> {
  let query = db("prices")
    .select(
      "time",
      "symbol",
      "source",
      "price",
      "volume_24h"
    )
    .whereBetween("time", [new Date(filters.startDate), new Date(filters.endDate)])
    .orderBy("time", "desc")
    .limit(limit)
    .offset(offset);

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
  offset: number
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
    .limit(limit)
    .offset(offset);

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
  offset: number
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
    .limit(limit)
    .offset(offset);

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
