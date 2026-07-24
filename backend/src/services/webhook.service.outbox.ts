import type { Knex } from "knex";
import { randomBytes } from "crypto";
import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";
import { OutboxProducer } from "../outbox/eventProducer.js";
import { DEFAULT_WEBHOOK_RETRY_CONFIG } from "../database/types.js";

// Import existing types from original webhook service
import type {
  WebhookEventType,
  WebhookEndpoint,
  WebhookDelivery,
} from "./webhook.service.js";

/**
 * Outbox-integrated Webhook Service
 * Replaces direct BullMQ queuing with transactional outbox pattern
 */
export class OutboxWebhookService {
  private outboxProducer: OutboxProducer;

  constructor(private db: Knex = getDatabase()) {
    this.outboxProducer = new OutboxProducer(db);
  }

  /**
   * Queue webhook delivery using outbox pattern
   * Replaces the original queueDelivery method with transactional guarantees
   */
  async queueDelivery(params: {
    webhookEndpointId: string;
    eventType: WebhookEventType;
    payload: Record<string, any>;
    scheduledAt?: number;
  }): Promise<WebhookDelivery> {
    return await this.db.transaction(async (tx) => {
      // Check rate limit and get endpoint details
      const endpoint = await this.getEndpointTransactional(tx, params.webhookEndpointId);
      if (!endpoint) {
        throw new Error(`Webhook endpoint not found: ${params.webhookEndpointId}`);
      }

      if (!this.checkRateLimit(params.webhookEndpointId, endpoint.rateLimitPerMinute)) {
        throw new Error(`Rate limit exceeded for webhook endpoint: ${params.webhookEndpointId}`);
      }

      // Create delivery record in webhook_deliveries table (existing behavior)
      const deliveryId = crypto.randomUUID();
      const [delivery] = await tx("webhook_deliveries")
        .insert({
          id: deliveryId,
          webhook_endpoint_id: params.webhookEndpointId,
          event_type: params.eventType,
          payload: JSON.stringify(params.payload),
          status: "pending",
          attempts: 0,
          created_at: new Date(),
        })
        .returning("*");

      // Publish webhook delivery event to outbox (NEW: transactional)
      await this.outboxProducer.publishTransactional(tx, {
        aggregateType: "Webhook",
        aggregateId: deliveryId,
        eventType: "webhook.delivery",
        payload: {
          deliveryId,
          webhookEndpointId: params.webhookEndpointId,
          eventType: params.eventType,
          payload: params.payload,
          url: endpoint.url,
          secret: endpoint.secret,
          customHeaders: endpoint.customHeaders,
          scheduledAt: params.scheduledAt,
        },
        metadata: {
          traceId: `webhook-${deliveryId}`,
          source: "webhook-service",
          endpoint: endpoint.name,
        },
      });

      logger.info(
        {
          deliveryId,
          webhookEndpointId: params.webhookEndpointId,
          eventType: params.eventType,
        },
        "Webhook delivery queued via outbox"
      );

      return this.mapToDelivery(delivery);
    });
  }

  /**
   * Queue batch webhook delivery using outbox pattern
   */
  async queueBatchDelivery(params: {
    webhookEndpointId: string;
    eventType: WebhookEventType;
    events: Array<Record<string, any>>;
  }): Promise<WebhookDelivery[]> {
    return await this.db.transaction(async (tx) => {
      const endpoint = await this.getEndpointTransactional(tx, params.webhookEndpointId);
      if (!endpoint) {
        throw new Error(`Webhook endpoint not found: ${params.webhookEndpointId}`);
      }

      if (!endpoint.isBatchDeliveryEnabled) {
        throw new Error("Batch delivery is not enabled for this endpoint");
      }

      const batchId = crypto.randomUUID();
      const batchPayload = {
        batch: true,
        batchId,
        eventType: params.eventType,
        count: params.events.length,
        events: params.events,
        timestamp: new Date().toISOString(),
      };

      // Create batch delivery record
      const [delivery] = await tx("webhook_deliveries")
        .insert({
          id: batchId,
          webhook_endpoint_id: params.webhookEndpointId,
          event_type: params.eventType,
          payload: JSON.stringify(batchPayload),
          status: "pending",
          attempts: 0,
          created_at: new Date(),
        })
        .returning("*");

      // Publish batch delivery event to outbox
      await this.outboxProducer.publishTransactional(tx, {
        aggregateType: "Webhook",
        aggregateId: batchId,
        eventType: "webhook.batch_delivery",
        payload: {
          deliveryId: batchId,
          webhookEndpointId: params.webhookEndpointId,
          eventType: params.eventType,
          events: params.events,
          url: endpoint.url,
          secret: endpoint.secret,
          customHeaders: endpoint.customHeaders,
          batchWindowMs: endpoint.batchWindowMs,
        },
        metadata: {
          traceId: `webhook-batch-${batchId}`,
          source: "webhook-service",
          endpoint: endpoint.name,
          batchSize: params.events.length,
        },
      });

      logger.info(
        {
          batchId,
          webhookEndpointId: params.webhookEndpointId,
          eventType: params.eventType,
          eventCount: params.events.length,
        },
        "Webhook batch delivery queued via outbox"
      );

      return [this.mapToDelivery(delivery)];
    });
  }

  /**
   * Create webhook endpoint with outbox event
   */
  async createEndpoint(
    ownerAddress: string,
    params: {
      url: string;
      name: string;
      description?: string;
      filterEventTypes?: WebhookEventType[];
      customHeaders?: Record<string, string>;
      rateLimitPerMinute?: number;
      isBatchDeliveryEnabled?: boolean;
      batchWindowMs?: number;
      retryMaxAttempts?: number;
      retryBaseDelayMs?: number;
      retryMaxDelayMs?: number;
      retryBackoffMultiplier?: number;
      retryJitterRatio?: number;
    }
  ): Promise<WebhookEndpoint> {
    return await this.db.transaction(async (tx) => {
      const endpointId = crypto.randomUUID();
      const secret = this.generateSecret();

      const [endpoint] = await tx("webhook_endpoints")
        .insert({
          id: endpointId,
          owner_address: ownerAddress,
          url: params.url,
          name: params.name,
          description: params.description,
          secret,
          is_active: true,
          rate_limit_per_minute: params.rateLimitPerMinute || 60,
          custom_headers: JSON.stringify(params.customHeaders || {}),
          filter_event_types: JSON.stringify(params.filterEventTypes || []),
          is_batch_delivery_enabled: params.isBatchDeliveryEnabled || false,
          batch_window_ms: params.batchWindowMs || 5000,
          retry_max_attempts: params.retryMaxAttempts ?? DEFAULT_WEBHOOK_RETRY_CONFIG.retryMaxAttempts,
          retry_base_delay_ms: params.retryBaseDelayMs ?? DEFAULT_WEBHOOK_RETRY_CONFIG.retryBaseDelayMs,
          retry_max_delay_ms: params.retryMaxDelayMs ?? DEFAULT_WEBHOOK_RETRY_CONFIG.retryMaxDelayMs,
          retry_backoff_multiplier: params.retryBackoffMultiplier ?? DEFAULT_WEBHOOK_RETRY_CONFIG.retryBackoffMultiplier,
          retry_jitter_ratio: params.retryJitterRatio ?? DEFAULT_WEBHOOK_RETRY_CONFIG.retryJitterRatio,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning("*");

      // Publish webhook endpoint created event
      await this.outboxProducer.publishTransactional(tx, {
        aggregateType: "Webhook",
        aggregateId: endpointId,
        eventType: "webhook.endpoint_created" as any,
        payload: {
          endpointId,
          ownerAddress,
          url: params.url,
          name: params.name,
          filterEventTypes: params.filterEventTypes || [],
          isBatchDeliveryEnabled: params.isBatchDeliveryEnabled || false,
        },
        metadata: {
          traceId: `webhook-endpoint-${endpointId}`,
          source: "webhook-service",
        },
      });

      return this.mapToEndpoint(endpoint);
    });
  }

  /**
   * Update webhook endpoint with outbox event
   */
  async updateEndpoint(
    endpointId: string,
    ownerAddress: string,
    updates: Partial<{
      name: string;
      description: string;
      isActive: boolean;
      rateLimitPerMinute: number;
      customHeaders: Record<string, string>;
      filterEventTypes: WebhookEventType[];
      isBatchDeliveryEnabled: boolean;
      batchWindowMs: number;
      retryMaxAttempts: number;
      retryBaseDelayMs: number;
      retryMaxDelayMs: number;
      retryBackoffMultiplier: number;
      retryJitterRatio: number;
    }>
  ): Promise<WebhookEndpoint | null> {
    return await this.db.transaction(async (tx) => {
      const [existing] = await tx("webhook_endpoints")
        .select("*")
        .where({ id: endpointId, owner_address: ownerAddress });

      if (!existing) {
        return null;
      }

      const updateData: any = {
        updated_at: new Date(),
      };

      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.description !== undefined) updateData.description = updates.description;
      if (updates.isActive !== undefined) updateData.is_active = updates.isActive;
      if (updates.rateLimitPerMinute !== undefined) updateData.rate_limit_per_minute = updates.rateLimitPerMinute;
      if (updates.customHeaders !== undefined) updateData.custom_headers = JSON.stringify(updates.customHeaders);
      if (updates.filterEventTypes !== undefined) updateData.filter_event_types = JSON.stringify(updates.filterEventTypes);
      if (updates.isBatchDeliveryEnabled !== undefined) updateData.is_batch_delivery_enabled = updates.isBatchDeliveryEnabled;
      if (updates.batchWindowMs !== undefined) updateData.batch_window_ms = updates.batchWindowMs;
      if (updates.retryMaxAttempts !== undefined) updateData.retry_max_attempts = Math.max(1, Math.min(20, updates.retryMaxAttempts));
      if (updates.retryBaseDelayMs !== undefined) updateData.retry_base_delay_ms = Math.max(100, updates.retryBaseDelayMs);
      if (updates.retryMaxDelayMs !== undefined) updateData.retry_max_delay_ms = Math.max(1000, updates.retryMaxDelayMs);
      if (updates.retryBackoffMultiplier !== undefined) updateData.retry_backoff_multiplier = Math.max(1, Math.min(10, updates.retryBackoffMultiplier));
      if (updates.retryJitterRatio !== undefined) updateData.retry_jitter_ratio = Math.max(0, Math.min(1, updates.retryJitterRatio));

      const [updated] = await tx("webhook_endpoints")
        .where({ id: endpointId })
        .update(updateData)
        .returning("*");

      // Publish webhook endpoint updated event
      await this.outboxProducer.publishTransactional(tx, {
        aggregateType: "Webhook",
        aggregateId: endpointId,
        eventType: "webhook.endpoint_updated" as any,
        payload: {
          endpointId,
          ownerAddress,
          updates,
          previousState: {
            name: existing.name,
            isActive: existing.is_active,
            rateLimitPerMinute: existing.rate_limit_per_minute,
          },
        },
        metadata: {
          traceId: `webhook-endpoint-update-${endpointId}`,
          source: "webhook-service",
        },
      });

      return this.mapToEndpoint(updated);
    });
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  private async getEndpointTransactional(
    tx: Knex.Transaction,
    endpointId: string
  ): Promise<WebhookEndpoint | null> {
    const [endpoint] = await tx("webhook_endpoints")
      .select("*")
      .where({ id: endpointId, is_active: true });

    return endpoint ? this.mapToEndpoint(endpoint) : null;
  }

  private checkRateLimit(endpointId: string, rateLimitPerMinute: number): boolean {
    // Simplified rate limiting - in production, use Redis or similar
    // This is a placeholder implementation
    return true;
  }

  private generateSecret(): string {
    return randomBytes(32).toString("hex");
  }

  private mapToEndpoint(row: any): WebhookEndpoint {
    return {
      id: row.id,
      ownerAddress: row.owner_address,
      url: row.url,
      name: row.name,
      description: row.description,
      secret: row.secret,
      secretRotatedAt: row.secret_rotated_at,
      isActive: row.is_active,
      rateLimitPerMinute: row.rate_limit_per_minute,
      customHeaders: JSON.parse(row.custom_headers || "{}"),
      filterEventTypes: JSON.parse(row.filter_event_types || "[]"),
      isBatchDeliveryEnabled: row.is_batch_delivery_enabled,
      batchWindowMs: row.batch_window_ms,
      consecutiveFailures: row.consecutive_failures ?? 0,
      circuitBreakerStatus: row.circuit_breaker_status ?? "closed",
      circuitBreakerTrippedAt: row.circuit_breaker_tripped_at ?? null,
      circuitBreakerResetAt: row.circuit_breaker_reset_at ?? null,
      retryMaxAttempts: row.retry_max_attempts ?? DEFAULT_WEBHOOK_RETRY_CONFIG.retryMaxAttempts,
      retryBaseDelayMs: row.retry_base_delay_ms ?? DEFAULT_WEBHOOK_RETRY_CONFIG.retryBaseDelayMs,
      retryMaxDelayMs: row.retry_max_delay_ms ?? DEFAULT_WEBHOOK_RETRY_CONFIG.retryMaxDelayMs,
      retryBackoffMultiplier: row.retry_backoff_multiplier ?? DEFAULT_WEBHOOK_RETRY_CONFIG.retryBackoffMultiplier,
      retryJitterRatio: row.retry_jitter_ratio ?? DEFAULT_WEBHOOK_RETRY_CONFIG.retryJitterRatio,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapToDelivery(row: any): WebhookDelivery {
    return {
      id: row.id,
      webhookEndpointId: row.webhook_endpoint_id,
      eventType: row.event_type,
      payload: JSON.parse(row.payload),
      status: row.status,
      attempts: row.attempts,
      lastAttemptAt: row.last_attempt_at,
      nextRetryAt: row.next_retry_at,
      responseStatus: row.response_status,
      responseBody: row.response_body,
      errorMessage: row.error_message,
      createdAt: row.created_at,
    };
  }
}