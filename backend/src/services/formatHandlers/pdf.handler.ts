import PDFDocument from "pdfkit";
import type { ExportDataType } from "../../types/export.types.js";
import { logger } from "../../utils/logger.js";

/**
 * PDF Format Handler
 * 
 * Implements PDF generation for datasets.
 * 
 * MEMORY PROFILE WARNING: PDF generation requires buffering data in memory.
 * This handler is NOT suitable for very large datasets. Recommended limit: 10,000 records.
 * For larger datasets, users should use CSV or JSON formats which support true streaming.
 * 
 * The handler applies templates based on data type for consistent formatting.
 */
export class PDFHandler {
  private readonly MAX_RECORDS = 10000;

  /**
   * Generate PDF output from data stream
   * 
   * @param dataStream - Async iterable of data records
   * @param dataType - Type of data being exported
   * @param compress - Whether to apply GZIP compression (not applicable for PDF)
   * @returns Readable stream of PDF data
   */
  async generate(
    dataStream: AsyncIterable<any>,
    dataType: ExportDataType,
    _compress: boolean
  ): Promise<NodeJS.ReadableStream> {
    logger.info({ dataType }, "Generating PDF export");

    // Buffer all records (PDF cannot be truly streamed)
    const records: any[] = [];
    let count = 0;

    for await (const record of dataStream) {
      if (count >= this.MAX_RECORDS) {
        logger.warn(
          { dataType, maxRecords: this.MAX_RECORDS },
          "PDF export truncated at maximum record limit"
        );
        break;
      }
      records.push(record);
      count++;
    }

    logger.info({ dataType, recordCount: records.length }, "Buffered records for PDF generation");

    // Create PDF document
    const doc = new PDFDocument({
      size: "A4",
      margin: 50,
      bufferPages: true,
    });

    // Apply template based on data type
    this.applyTemplate(doc, dataType, records);

    // Finalize PDF
    doc.end();

    return doc as unknown as NodeJS.ReadableStream;
  }

  /**
   * Apply template styling and content based on data type
   */
  private applyTemplate(doc: PDFKit.PDFDocument, dataType: ExportDataType, records: any[]): void {
    const now = new Date().toISOString();

    // Header
    doc
      .fontSize(20)
      .font("Helvetica-Bold")
      .text("Bridge Watch Export Report", { align: "center" });

    doc.moveDown(0.5);

    doc
      .fontSize(12)
      .font("Helvetica")
      .text(`Data Type: ${this.formatDataType(dataType)}`, { align: "center" });

    doc.text(`Generated: ${now}`, { align: "center" });
    doc.text(`Total Records: ${records.length}`, { align: "center" });

    doc.moveDown(1);

    // Draw separator line
    doc
      .moveTo(50, doc.y)
      .lineTo(550, doc.y)
      .stroke();

    doc.moveDown(1);

    // Content based on data type
    switch (dataType) {
      case "analytics":
        this.renderAnalyticsTemplate(doc, records);
        break;
      case "transactions":
        this.renderTransactionsTemplate(doc, records);
        break;
      case "health_metrics":
        this.renderHealthMetricsTemplate(doc, records);
        break;
    }

    // Footer on last page
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      doc
        .fontSize(8)
        .font("Helvetica")
        .text(
          `Page ${i + 1} of ${pages.count} | Bridge Watch | ${now}`,
          50,
          doc.page.height - 50,
          { align: "center" }
        );
    }
  }

  /**
   * Render analytics data template
   */
  private renderAnalyticsTemplate(doc: PDFKit.PDFDocument, records: any[]): void {
    doc.fontSize(14).font("Helvetica-Bold").text("Price Analytics Data");
    doc.moveDown(0.5);

    doc.fontSize(9).font("Helvetica");

    // Table header
    const startY = doc.y;
    doc.text("Timestamp", 50, startY, { width: 100, continued: false });
    doc.text("Symbol", 160, startY, { width: 60, continued: false });
    doc.text("Source", 230, startY, { width: 80, continued: false });
    doc.text("Price", 320, startY, { width: 80, continued: false });
    doc.text("Volume 24h", 410, startY, { width: 100, continued: false });

    doc.moveDown(0.3);
    doc
      .moveTo(50, doc.y)
      .lineTo(550, doc.y)
      .stroke();
    doc.moveDown(0.3);

    // Table rows
    for (const record of records) {
      if (doc.y > 700) {
        doc.addPage();
        doc.fontSize(9).font("Helvetica");
      }

      const rowY = doc.y;
      doc.text(new Date(record.time).toISOString().slice(0, 16), 50, rowY, { width: 100 });
      doc.text(record.symbol || "N/A", 160, rowY, { width: 60 });
      doc.text(record.source || "N/A", 230, rowY, { width: 80 });
      doc.text(record.price ? `$${Number(record.price).toFixed(4)}` : "N/A", 320, rowY, { width: 80 });
      doc.text(record.volume_24h ? `$${Number(record.volume_24h).toFixed(2)}` : "N/A", 410, rowY, { width: 100 });
      doc.moveDown(0.5);
    }
  }

  /**
   * Render transactions data template
   */
  private renderTransactionsTemplate(doc: PDFKit.PDFDocument, records: any[]): void {
    doc.fontSize(14).font("Helvetica-Bold").text("Verification Transactions");
    doc.moveDown(0.5);

    doc.fontSize(9).font("Helvetica");

    for (const record of records) {
      if (doc.y > 700) {
        doc.addPage();
        doc.fontSize(9).font("Helvetica");
      }

      doc.font("Helvetica-Bold").text(`Bridge ID: ${record.bridge_id}`);
      doc.font("Helvetica");
      doc.text(`Verified At: ${new Date(record.verified_at).toISOString()}`);
      doc.text(`Sequence: ${record.sequence}`);
      doc.text(`Leaf Hash: ${record.leaf_hash}`);
      doc.text(`Leaf Index: ${record.leaf_index}`);
      doc.text(`Valid: ${record.is_valid ? "Yes" : "No"}`);
      if (record.proof_depth) doc.text(`Proof Depth: ${record.proof_depth}`);
      if (record.job_id) doc.text(`Job ID: ${record.job_id}`);

      doc.moveDown(0.5);
      doc
        .moveTo(50, doc.y)
        .lineTo(550, doc.y)
        .strokeOpacity(0.3)
        .stroke()
        .strokeOpacity(1);
      doc.moveDown(0.5);
    }
  }

  /**
   * Render health metrics data template
   */
  private renderHealthMetricsTemplate(doc: PDFKit.PDFDocument, records: any[]): void {
    doc.fontSize(14).font("Helvetica-Bold").text("Health Metrics Data");
    doc.moveDown(0.5);

    doc.fontSize(9).font("Helvetica");

    for (const record of records) {
      if (doc.y > 700) {
        doc.addPage();
        doc.fontSize(9).font("Helvetica");
      }

      doc.font("Helvetica-Bold").text(`${record.symbol} - ${new Date(record.time).toISOString().slice(0, 16)}`);
      doc.font("Helvetica");
      doc.text(`Overall Score: ${record.overall_score}/100`);
      doc.text(`Liquidity Depth: ${record.liquidity_depth_score}/100`);
      doc.text(`Price Stability: ${record.price_stability_score}/100`);
      doc.text(`Bridge Uptime: ${record.bridge_uptime_score}/100`);
      doc.text(`Reserve Backing: ${record.reserve_backing_score}/100`);
      doc.text(`Volume Trend: ${record.volume_trend_score}/100`);

      doc.moveDown(0.5);
      doc
        .moveTo(50, doc.y)
        .lineTo(550, doc.y)
        .strokeOpacity(0.3)
        .stroke()
        .strokeOpacity(1);
      doc.moveDown(0.5);
    }
  }

  /**
   * Format data type for display
   */
  private formatDataType(dataType: ExportDataType): string {
    switch (dataType) {
      case "analytics":
        return "Price Analytics";
      case "transactions":
        return "Verification Transactions";
      case "health_metrics":
        return "Health Metrics";
      default:
        return dataType;
    }
  }
}
