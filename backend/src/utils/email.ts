import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { config } from "../config/index.js";
import { logger } from "./logger.js";
import type { ExportRecord } from "../types/export.types.js";

let transporter: Transporter | null = null;

/**
 * Get or create email transporter
 * Returns null if SMTP is not configured
 */
function getTransporter(): Transporter | null {
  if (!config.SMTP_HOST || !config.SMTP_USER || !config.SMTP_PASSWORD) {
    logger.warn("SMTP not configured - email delivery disabled");
    return null;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE,
      auth: {
        user: config.SMTP_USER,
        pass: config.SMTP_PASSWORD,
      },
    });

    logger.info({ host: config.SMTP_HOST, port: config.SMTP_PORT }, "Email transporter initialized");
  }

  return transporter;
}

/**
 * Send export completion email with download link
 * 
 * @param exportRecord - The completed export record
 * @param recipientEmail - Email address to send to
 * @returns Promise that resolves when email is sent
 */
export async function sendExportEmail(
  exportRecord: ExportRecord,
  recipientEmail: string
): Promise<void> {
  const transport = getTransporter();

  if (!transport) {
    logger.warn({ exportId: exportRecord.id }, "Skipping email delivery - SMTP not configured");
    return;
  }

  try {
    const subject = `Your Bridge Watch Export is Ready`;
    const html = generateEmailHTML(exportRecord);
    const text = generateEmailText(exportRecord);

    await transport.sendMail({
      from: `"${config.SMTP_FROM_NAME}" <${config.SMTP_FROM_ADDRESS}>`,
      to: recipientEmail,
      subject,
      text,
      html,
    });

    logger.info(
      { exportId: exportRecord.id, recipient: recipientEmail },
      "Export email sent successfully"
    );
  } catch (error) {
    logger.error(
      { error, exportId: exportRecord.id, recipient: recipientEmail },
      "Failed to send export email"
    );
    throw error;
  }
}

/**
 * Generate HTML email content
 */
function generateEmailHTML(exportRecord: ExportRecord): string {
  const expiryDate = exportRecord.download_url_expires_at
    ? new Date(exportRecord.download_url_expires_at).toLocaleString()
    : "N/A";

  const fileSizeMB = exportRecord.file_size_bytes
    ? (exportRecord.file_size_bytes / (1024 * 1024)).toFixed(2)
    : "N/A";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      background-color: #4A90E2;
      color: white;
      padding: 20px;
      text-align: center;
      border-radius: 5px 5px 0 0;
    }
    .content {
      background-color: #f9f9f9;
      padding: 30px;
      border: 1px solid #ddd;
      border-top: none;
      border-radius: 0 0 5px 5px;
    }
    .button {
      display: inline-block;
      background-color: #4A90E2;
      color: white;
      padding: 12px 30px;
      text-decoration: none;
      border-radius: 5px;
      margin: 20px 0;
    }
    .details {
      background-color: white;
      padding: 15px;
      border-radius: 5px;
      margin: 20px 0;
    }
    .details-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #eee;
    }
    .details-row:last-child {
      border-bottom: none;
    }
    .label {
      font-weight: bold;
      color: #666;
    }
    .footer {
      text-align: center;
      color: #999;
      font-size: 12px;
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Your Export is Ready!</h1>
  </div>
  <div class="content">
    <p>Your Bridge Watch data export has been successfully generated and is ready for download.</p>
    
    <div class="details">
      <div class="details-row">
        <span class="label">Export ID:</span>
        <span>${exportRecord.id}</span>
      </div>
      <div class="details-row">
        <span class="label">Format:</span>
        <span>${exportRecord.format.toUpperCase()}</span>
      </div>
      <div class="details-row">
        <span class="label">Data Type:</span>
        <span>${formatDataType(exportRecord.data_type)}</span>
      </div>
      <div class="details-row">
        <span class="label">File Size:</span>
        <span>${fileSizeMB} MB${exportRecord.is_compressed ? " (compressed)" : ""}</span>
      </div>
      <div class="details-row">
        <span class="label">Link Expires:</span>
        <span>${expiryDate}</span>
      </div>
    </div>

    <center>
      <a href="${exportRecord.download_url}" class="button">Download Export</a>
    </center>

    <p style="color: #666; font-size: 14px;">
      <strong>Note:</strong> This download link will expire on ${expiryDate}. 
      Please download your export before this time.
    </p>
  </div>
  <div class="footer">
    <p>Bridge Watch - Cross-Chain Bridge Monitoring</p>
    <p>This is an automated message. Please do not reply to this email.</p>
  </div>
</body>
</html>
  `;
}

/**
 * Generate plain text email content
 */
function generateEmailText(exportRecord: ExportRecord): string {
  const expiryDate = exportRecord.download_url_expires_at
    ? new Date(exportRecord.download_url_expires_at).toLocaleString()
    : "N/A";

  const fileSizeMB = exportRecord.file_size_bytes
    ? (exportRecord.file_size_bytes / (1024 * 1024)).toFixed(2)
    : "N/A";

  return `
Your Bridge Watch Export is Ready!

Your data export has been successfully generated and is ready for download.

Export Details:
- Export ID: ${exportRecord.id}
- Format: ${exportRecord.format.toUpperCase()}
- Data Type: ${formatDataType(exportRecord.data_type)}
- File Size: ${fileSizeMB} MB${exportRecord.is_compressed ? " (compressed)" : ""}
- Link Expires: ${expiryDate}

Download Link:
${exportRecord.download_url}

Note: This download link will expire on ${expiryDate}. Please download your export before this time.

---
Bridge Watch - Cross-Chain Bridge Monitoring
This is an automated message. Please do not reply to this email.
  `;
}

/**
 * Format data type for display
 */
function formatDataType(dataType: string): string {
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

/**
 * Verify email transporter configuration
 * Used for health checks
 */
export async function verifyEmailConfig(): Promise<boolean> {
  const transport = getTransporter();

  if (!transport) {
    return false;
  }

  try {
    await transport.verify();
    logger.info("Email configuration verified successfully");
    return true;
  } catch (error) {
    logger.error({ error }, "Email configuration verification failed");
    return false;
  }
}
