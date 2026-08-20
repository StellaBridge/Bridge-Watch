import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";
import type { RouteableAlert } from "./alertRouting.service.js";

const fetch = globalThis.fetch;

export interface SlackBlock {
  type: string;
  [key: string]: any;
}

export interface SlackAttachment {
  color?: string;
  blocks?: SlackBlock[];
  fallback?: string;
}

export interface SlackMessage {
  text?: string;
  blocks?: SlackBlock[];
  attachments?: SlackAttachment[];
}

export interface SlackAlert {
  severity: "critical" | "high" | "medium" | "low";
  assetCode: string;
  sourceType: string;
  triggeredValue: number;
  threshold: number;
  metric: string;
  eventTime: Date;
  ruleName: string;
}

/**
 * Slack notification service for sending Bridge Watch alerts via webhook
 * 
 * Features:
 * - Slack Block Kit formatting for rich alert messages
 * - Color-coded severity indicators
 * - Structured alert information with asset, threshold, and timing details
 * - HTTP timeout and error handling
 * - Configurable via SLACK_WEBHOOK_URL environment variable
 * 
 * GitHub Actions CI retry - fixing intermittent infrastructure error
 */
export class SlackNotificationService {
  private readonly webhookUrl: string | null;
  private readonly timeout: number = 10000; // 10 second timeout

  constructor() {
    this.webhookUrl = config.SLACK_WEBHOOK_URL || null;
  }

  /**
   * Send alert to Slack channel via webhook
   */
  async sendAlert(alert: RouteableAlert): Promise<void> {
    if (!this.webhookUrl) {
      logger.warn("SLACK_WEBHOOK_URL not configured, skipping Slack notification");
      return;
    }

    try {
      const message = this.formatAlertMessage(alert);
      
      const response = await fetch(this.webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        throw new Error(`Slack webhook responded with ${response.status}: ${errorText}`);
      }

      logger.info(
        {
          alertRuleId: alert.alertRuleId,
          assetCode: alert.assetCode,
          severity: alert.severity,
          webhookUrl: this.webhookUrl.replace(/\/[^/]+$/, "/***"),
        },
        "Alert sent to Slack successfully"
      );
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          alertRuleId: alert.alertRuleId,
          assetCode: alert.assetCode,
          severity: alert.severity,
        },
        "Failed to send alert to Slack"
      );
      throw error;
    }
  }

  /**
   * Format alert using Slack Block Kit
   */
  private formatAlertMessage(alert: RouteableAlert): SlackMessage {
    const severityEmoji = this.getSeverityEmoji(alert.severity);
    const severityColor = this.getSeverityColor(alert.severity);
    
    const headerText = `${severityEmoji} ${alert.severity.toUpperCase()} Bridge Alert`;
    const timestamp = Math.floor(alert.eventTime.getTime() / 1000);

    const blocks: SlackBlock[] = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: headerText,
          emoji: true,
        },
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Asset:*\n${alert.assetCode}`,
          },
          {
            type: "mrkdwn",
            text: `*Alert Type:*\n${alert.sourceType}`,
          },
          {
            type: "mrkdwn",
            text: `*Severity:*\n${alert.severity}`,
          },
          {
            type: "mrkdwn",
            text: `*Rule:*\n${alert.ruleName}`,
          },
          {
            type: "mrkdwn",
            text: `*Metric:*\n${alert.metric}`,
          },
          {
            type: "mrkdwn",
            text: `*Threshold:*\n${alert.threshold}`,
          },
          {
            type: "mrkdwn",
            text: `*Triggered Value:*\n${alert.triggeredValue}`,
          },
          {
            type: "mrkdwn",
            text: `*Triggered:*\n<!date^${timestamp}^{date_num} {time_secs}|${alert.eventTime.toISOString()}>`,
          },
        ],
      },
    ];

    // Add context section with additional details if available
    if (alert.ownerAddress) {
      blocks.push({
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Rule ID: \`${alert.alertRuleId}\` | Owner: ${alert.ownerAddress}`,
          },
        ],
      });
    }

    return {
      blocks,
      attachments: [
        {
          color: severityColor,
          fallback: `${headerText}: ${alert.assetCode} ${alert.sourceType} - ${alert.metric} exceeded threshold of ${alert.threshold}`,
        },
      ],
    };
  }

  /**
   * Get emoji for severity level
   */
  private getSeverityEmoji(severity: string): string {
    const emojiMap: Record<string, string> = {
      critical: "🚨",
      high: "⚠️",
      medium: "⚡",
      low: "ℹ️",
    };
    return emojiMap[severity] || "🔔";
  }

  /**
   * Get color code for severity level (Slack attachment colors)
   */
  private getSeverityColor(severity: string): string {
    const colorMap: Record<string, string> = {
      critical: "danger",    // Red
      high: "warning",       // Orange  
      medium: "#ffeb3b",     // Yellow
      low: "good",           // Green
    };
    return colorMap[severity] || "#808080"; // Gray for unknown
  }

  /**
   * Test webhook connectivity
   */
  async testConnection(): Promise<boolean> {
    if (!this.webhookUrl) {
      return false;
    }

    try {
      const testMessage: SlackMessage = {
        text: "Bridge Watch Slack integration test - connection successful! 🎉",
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "🧪 *Bridge Watch Slack Integration Test*\n\nIf you can see this message, your Slack webhook is working correctly!",
            },
          },
        ],
      };

      const response = await fetch(this.webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(testMessage),
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        logger.error(
          { status: response.status, statusText: response.statusText },
          "Slack webhook test failed"
        );
        return false;
      }

      logger.info("Slack webhook test successful");
      return true;
    } catch (error) {
      logger.error({ error }, "Slack webhook test failed");
      return false;
    }
  }

  /**
   * Check if service is configured
   */
  isConfigured(): boolean {
    return Boolean(this.webhookUrl);
  }
}

// Export singleton instance
export const slackNotificationService = new SlackNotificationService();