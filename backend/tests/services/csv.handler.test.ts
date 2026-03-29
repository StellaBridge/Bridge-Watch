import { describe, it, expect, vi, beforeEach } from "vitest";
import { CSVHandler } from "../../src/services/formatHandlers/csv.handler.js";

describe("CSVHandler", () => {
  let csvHandler: CSVHandler;

  beforeEach(() => {
    csvHandler = new CSVHandler();
    vi.resetAllMocks();
  });

  describe("generate", () => {
    it("generates valid CSV output for sample dataset", async () => {
      const sampleData: AsyncIterable<any> = {
        async *[Symbol.asyncIterator]() {
          yield { time: "2024-01-01T00:00:00Z", symbol: "USDC", source: "Stellar DEX", price: 1.0, volume_24h: 1000000 };
          yield { time: "2024-01-01T01:00:00Z", symbol: "EURC", source: "Stellar AMM", price: 1.08, volume_24h: 500000 };
        }
      };

      const stream = await csvHandler.generate(sampleData, "analytics", false);
      
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
      }

      const csvContent = Buffer.concat(chunks).toString();
      
      expect(csvContent).toContain("Timestamp");
      expect(csvContent).toContain("Asset Symbol");
      expect(csvContent).toContain("USDC");
      expect(csvContent).toContain("EURC");
      expect(csvContent).toContain("1"); // Price value
      expect(csvContent).toContain("1000000"); // Volume value
    });

    it("applies compression when requested", async () => {
      const sampleData: AsyncIterable<any> = {
        async *[Symbol.asyncIterator]() {
          for (let i = 0; i < 100; i++) {
            yield { time: `2024-01-${String(i).padStart(2, "0")}T00:00:00Z`, symbol: "USDC", source: "Stellar DEX", price: 1.0, volume_24h: 1000000 };
          }
        }
      };

      const stream = await csvHandler.generate(sampleData, "analytics", true);
      
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
      }

      const compressedData = Buffer.concat(chunks);
      
      // Check for gzip magic number
      expect(compressedData[0]).toBe(0x1f);
      expect(compressedData[1]).toBe(0x8b);
    });

    it("handles different data types with correct columns", async () => {
      const analyticsData: AsyncIterable<any> = {
        async *[Symbol.asyncIterator]() {
          yield { time: "2024-01-01T00:00:00Z", symbol: "USDC", source: "SDEX", price: 1.0, volume_24h: 1000 };
        }
      };

      const analyticsStream = await csvHandler.generate(analyticsData, "analytics", false);
      const analyticsChunks: Buffer[] = [];
      for await (const chunk of analyticsStream) {
        analyticsChunks.push(Buffer.from(chunk));
      }
      expect(Buffer.concat(analyticsChunks).toString()).toContain("Price Source");

      const transactionsData: AsyncIterable<any> = {
        async *[Symbol.asyncIterator]() {
          yield { verified_at: "2024-01-01T00:00:00Z", bridge_id: "bridge1", sequence: 1, leaf_hash: "abc", leaf_index: 0, is_valid: true, proof_depth: 10, metadata: null, job_id: "job1" };
        }
      };

      const transactionsStream = await csvHandler.generate(transactionsData, "transactions", false);
      const transactionsChunks: Buffer[] = [];
      for await (const chunk of transactionsStream) {
        transactionsChunks.push(Buffer.from(chunk));
      }
      expect(Buffer.concat(transactionsChunks).toString()).toContain("Verified At");

      const healthData: AsyncIterable<any> = {
        async *[Symbol.asyncIterator]() {
          yield { time: "2024-01-01T00:00:00Z", symbol: "USDC", overall_score: 85, liquidity_depth_score: 90, price_stability_score: 80, bridge_uptime_score: 95, reserve_backing_score: 85, volume_trend_score: 75 };
        }
      };

      const healthStream = await csvHandler.generate(healthData, "health_metrics", false);
      const healthChunks: Buffer[] = [];
      for await (const chunk of healthStream) {
        healthChunks.push(Buffer.from(chunk));
      }
      expect(Buffer.concat(healthChunks).toString()).toContain("Overall Score");
    });

    it("handles empty dataset", async () => {
      const emptyData: AsyncIterable<any> = {
        async *[Symbol.asyncIterator]() {
          // No yields
        }
      };

      const stream = await csvHandler.generate(emptyData, "analytics", false);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
      }

      const csvContent = Buffer.concat(chunks).toString();
      // Should still have headers
      expect(csvContent).toContain("Timestamp");
    });
  });
});
