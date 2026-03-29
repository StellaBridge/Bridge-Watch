import { Transform } from "stream";
import { createGzip } from "zlib";
import type { ExportDataType } from "../../types/export.types.js";
import { logger } from "../../utils/logger.js";

/**
 * JSON Format Handler
 * 
 * Implements streaming JSON generation for large datasets.
 * Memory profile: Bounded to stream buffer size (~64KB) regardless of dataset size.
 * Produces valid JSON array structure even when streaming.
 * Supports GZIP compression when output exceeds configured threshold.
 */
export class JSONHandler {
  /**
   * Generate JSON output from data stream
   * 
   * @param dataStream - Async iterable of data records
   * @param dataType - Type of data being exported
   * @param compress - Whether to apply GZIP compression
   * @returns Readable stream of JSON data (optionally compressed)
   */
  async generate(
    dataStream: AsyncIterable<any>,
    dataType: ExportDataType,
    compress: boolean
  ): Promise<NodeJS.ReadableStream> {
    logger.info({ dataType, compress }, "Generating JSON export");

    // Create a transform stream that wraps records in JSON array structure
    const jsonStream = new Transform({
      objectMode: true,
      construct(callback) {
        // Start JSON array
        this.push('{"dataType":"' + dataType + '","records":[');
        (this as any)._firstRecord = true;
        callback();
      },
      transform(chunk, _encoding, callback) {
        try {
          // Add comma separator for all records except the first
          if ((this as any)._firstRecord) {
            (this as any)._firstRecord = false;
          } else {
            this.push(",");
          }
          // Serialize and push the record
          this.push(JSON.stringify(chunk));
          callback();
        } catch (error) {
          callback(error as Error);
        }
      },
      flush(callback) {
        // Close JSON array and object
        this.push("]}");
        callback();
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
      dataIteratorStream.pipe(jsonStream).pipe(gzip);
      return gzip as NodeJS.ReadableStream;
    } else {
      dataIteratorStream.pipe(jsonStream);
      return jsonStream as NodeJS.ReadableStream;
    }
  }
}
