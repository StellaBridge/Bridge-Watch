import { stringify } from "csv-stringify";
import { Transform } from "stream";
import { createGzip } from "zlib";
import type { ExportDataType } from "../../types/export.types.js";
import { logger } from "../../utils/logger.js";

/**
 * CSV Format Handler
 * 
 * Implements streaming CSV generation for large datasets.
 * Memory profile: Bounded to stream buffer size (~64KB) regardless of dataset size.
 * Supports GZIP compression when output exceeds configured threshold.
 */
export class CSVHandler {
  /**
   * Generate CSV output from data stream
   * 
   * @param dataStream - Async iterable of data records
   * @param dataType - Type of data being exported
   * @param compress - Whether to apply GZIP compression
   * @returns Readable stream of CSV data (optionally compressed)
   */
  async generate(
    dataStream: AsyncIterable<any>,
    dataType: ExportDataType,
    compress: boolean
  ): Promise<NodeJS.ReadableStream> {
    logger.info({ dataType, compress }, "Generating CSV export");

    const columns = this.getColumnsForDataType(dataType);
    const stringifier = stringify({
      header: true,
      columns,
      cast: {
        date: (value) => value instanceof Date ? value.toISOString() : value,
        boolean: (value) => value ? "true" : "false",
        object: (value) => JSON.stringify(value),
      },
    });

    // Convert async iterable to readable stream
    const dataIteratorStream = new Transform({
      objectMode: true,
      async transform(chunk, _encoding, callback) {
        callback(null, chunk);
      },
    });

    // Start consuming the async iterable
    (async () => {
      try {
        for await (const record of dataStream) {
          if (!dataIteratorStream.write(record)) {
            // Wait for drain event if buffer is full
            await new Promise((resolve) => dataIteratorStream.once("drain", resolve));
          }
        }
        dataIteratorStream.end();
      } catch (error) {
        dataIteratorStream.destroy(error as Error);
      }
    })();

    // Create the pipeline
    if (compress) {
      const gzip = createGzip();
      dataIteratorStream.pipe(stringifier).pipe(gzip);
      return gzip as NodeJS.ReadableStream;
    } else {
      dataIteratorStream.pipe(stringifier);
      return stringifier as NodeJS.ReadableStream;
    }
  }

  /**
   * Get column definitions for each data type
   */
  private getColumnsForDataType(dataType: ExportDataType): Record<string, string> {
    switch (dataType) {
      case "analytics":
        return {
          time: "Timestamp",
          symbol: "Asset Symbol",
          source: "Price Source",
          price: "Price (USD)",
          volume_24h: "24h Volume",
        };
      case "transactions":
        return {
          verified_at: "Verified At",
          bridge_id: "Bridge ID",
          sequence: "Sequence",
          leaf_hash: "Leaf Hash",
          leaf_index: "Leaf Index",
          is_valid: "Is Valid",
          proof_depth: "Proof Depth",
          metadata: "Metadata",
          job_id: "Job ID",
        };
      case "health_metrics":
        return {
          time: "Timestamp",
          symbol: "Asset Symbol",
          overall_score: "Overall Score",
          liquidity_depth_score: "Liquidity Depth Score",
          price_stability_score: "Price Stability Score",
          bridge_uptime_score: "Bridge Uptime Score",
          reserve_backing_score: "Reserve Backing Score",
          volume_trend_score: "Volume Trend Score",
        };
      default:
        throw new Error(`Unsupported data type: ${dataType}`);
    }
  }
}
