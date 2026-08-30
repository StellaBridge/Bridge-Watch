import crypto from "crypto";
import { EventEmitter } from "events";
import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";
import { Queue, Job, ConnectionOptions } from "bullmq";
import { config } from "../config/index.js";
import { WebhookBatchBufferService } from "./webhookBatchBuffer.service.js";
import type { BatchBufferStatus } from "./webhookBatchBuffer.service.js";
import { redactionService } from "../privacy/redaction.service.js";
import { redactionDecisionService } from "../privacy/redactionDecision.service.js";

const fetch = globalThis.fetch;

// =============================================================================
// TYPES & INTERFACES
// =============================================================================

export type WebhookEventType =
  | "alert.triggered"
  | "alert.resolved"
  | "bridge.status_changed"
  | "health.score_changed"
  | "reserve.commitment_submitted"
  | "reserve.challenge_raised"
  | "circuit_breaker.tripped"
  | "circuit_breaker.reset"
  | "price.deviation_detected"
  | "liquidity.threshold_breached";

export type WebhookDeliveryStatus = "pending" | "buffered" | "success" | "failed" | "retrying";

export type WebhookCircuitBreakerStatus = "closed" | "open" | "half_open";

export interface WebhookEndpoint {
  id: string;
  ownerAddress: string;
  url: string;
  name: string;
  description: string | null;
  secret: string;
  secretRotatedAt: Date | null;
  isActive: boolean;
  rateLimitPerMinute: number;
  customHeaders: Record<string, string>;
  filterEventTypes: WebhookEventType[];
  isBatchDeliveryEnabled: boolean;
  batchWindowMs: number;
  consecutiveFailures: number;
  circuitBreakerStatus: WebhookCircuitBreakerStatus;
  circuitBreakerTrippedAt: Date | null;
  circuitBreakerResetAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookDelivery {
  id: string;
  webhookEndpointId: string;
  eventType: WebhookEventType;
  payload: Record<string, any>;
  status: WebhookDeliveryStatus;
  attempts: number;
  lastAttemptAt: Date | null;
  nextRetryAt: Date | null;
  responseStatus: number | null;
  responseBody: string | null;
  errorMessage: string | null;
  createdAt: Date;
}

export interface WebhookDeliveryLog {
  id: string;
  webhookEndpointId: string;
  webhookDeliveryId: string;
  eventType: WebhookEventType;
  requestHeaders: Record<string, string>;
  requestBody: string;
  responseStatus: number | null;
  responseBody: string | null;
  durationMs: number;
  attemptNumber: number;
  createdAt: Date;
}

export interface WebhookPayload {
  id: string;
  eventType: WebhookEventType;
  timestamp: string;
  data: Record<string, any>;
  webhookUrl: string;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// =============================================================================
// CONSTANTS & CONFIG
// =============================================================================

const WEBHOOK_QUEUE_NAME = "webhook-delivery";

const WEBHOOK_CONNECTION: ConnectionOptions = {
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
  password: config.REDIS_PASSWORD,
};

// Retry configuration: exponential backoff starting at 1s, max 1 hour
const RETRY_DELAYS = [1000, 5000, 15000, 60000, 300000, 900000, 3600000];
const MAX_RETRY_ATTEMPTS = 7;

// Circuit breaker: trip after this many consecutive failures per endpoint
const CONSECUTIVE_FAILURE_THRESHOLD = 10;

// =============================================================================
// WEBHOOK SERVICE CLASS
// =============================================================================

export class WebhookService extends EventEmitter {
  private static instance: WebhookService;
  private deliveryQueue: Queue;
  private rateLimitMap: Map<string, RateLimitEntry> = new Map();
  public readonly batchBuffer: WebhookBatchBufferService;

  private constructor() {
    super();
    this.batchBuffer = new WebhookBatchBufferService(async (params) => {
      try {
        await this.queueBatchDelivery({
          webhookEndpointId: params.endpointId,
          eventType: params.eventType,
          events: params.events as Array<Record<string, any>>,
        });
        await this.resolveBufferedDeliveries(params.deliveryIds, "success");
      } catch (err) {
        await this.resolveBufferedDeliveries(
          params.deliveryIds,
          "failed",
          err instanceof Error ? err.message : String(err),
        );
        throw err;
      }
    });

    this.deliveryQueue = new Queue(WEBHOOK_QUEUE_NAME, {
      connection: WEBHOOK_CONNECTION,
      defaultJobOptions: {
        attempts: MAX_RETRY_ATTEMPTS,
        backoff: {
          type: "custom",
        },
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 1000, // Keep last 1000 failed jobs for debugging
      },
    });

    this.setupQueueListeners();
    this.startRateLimitCleanup();
  }

  public static getInstance(): WebhookService {
    if (!WebhookService.instance) {
      WebhookService.instance = new WebhookService();
    }
    return WebhookService.instance;
  }

  // ---------------------------------------------------------------------------
  // QUEUE SETUP
  // ---------------------------------------------------------------------------

  private setupQueueListeners(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.deliveryQueue.on("completed" as any, async (job: Job) => {
      logger.info(
        { jobId: job.id, webhookEndpointId: job.data.webhookEndpointId },
        "Webhook delivery completed successfully"
      );
      await this.updateDeliveryStatus(job.data.deliveryId, "success", { status: 200, body: "" });
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.deliveryQueue.on("failed" as any, async (job: Job | undefined, err: Error) => {
      if (!job) return;
      logger.error(
        { jobId: job.id, webhookEndpointId: job.data.webhookEndpointId, error: err.message },
        "Webhook delivery failed"
      );
      await this.updateDeliveryStatus(job.data.deliveryId, "retrying", undefined, err.message);
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.deliveryQueue.on("retrying" as any, async (job: Job) => {
      logger.warn(
        { jobId: job.id, attempt: job.attemptsMade + 1 },
        "Retrying webhook delivery"
      );
    });
  }

  private startRateLimitCleanup(): void {
    // Clean up rate limit entries every minute
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.rateLimitMap.entries()) {
        if (entry.resetAt < now) {
          this.rateLimitMap.delete(key);
        }
      }
    }, 60000);
  }

  // ---------------------------------------------------------------------------
  // HMAC SIGNING
  // ---------------------------------------------------------------------------

  public generateSecret(): string {
    return crypto.randomBytes(32).toString("hex");
  }

  public signPayload(payload: string, secret: string, timestamp: number): string {
    const signaturePayload = `${timestamp}.${payload}`;
    return crypto
      .createHmac("sha256", secret)
      .update(signaturePayload)
      .digest("hex");
  }

  public generateSignatureHeaders(
    payload: string,
    secret: string
  ): Record<string, string> {
    const timestamp = Date.now();
    const signature = this.signPayload(payload, secret, timestamp);

    return {
      "Content-Type": "application/json",
      "X-Webhook-Signature": signature,
      "X-Webhook-Timestamp": timestamp.toString(),
      "X-Webhook-Event-Id": crypto.randomUUID(),
    };
  }

  public verifySignature(
    payload: string,
    signature: string,
    timestamp: string,
    secret: string,
    toleranceMs: number = 300000 // 5 minutes
  ): boolean {
    const ts = parseInt(timestamp, 10);
    const now = Date.now();

    // Check timestamp tolerance to prevent replay attacks
    if (Math.abs(now - ts) > toleranceMs) {
      logger.warn({ timestamp: ts, now, toleranceMs }, "Webhook signature timestamp outside tolerance");
      return false;
    }

    const expectedSignature = this.signPayload(payload, secret, ts);
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  // ---------------------------------------------------------------------------
  // SECRET ROTATION
  // ---------------------------------------------------------------------------

  public async rotateSecret(webhookEndpointId: string): Promise<string> {
    const db = getDatabase();
    const newSecret = this.generateSecret();

    await db("webhook_endpoints")
      .where("id", webhookEndpointId)
      .update({
        secret: newSecret,
        secret_rotated_at: new Date(),
        updated_at: new Date(),
      });

    logger.info({ webhookEndpointId }, "Webhook secret rotated successfully");

    return newSecret;
  }

  public getActiveSecret(webhookEndpoint: WebhookEndpoint): string {
    return webhookEndpoint.secret;
  }

  // ---------------------------------------------------------------------------
  // RATE LIMITING
  // ---------------------------------------------------------------------------

  public checkRateLimit(webhookEndpointId: string, limitPerMinute: number): boolean {
    const key = `webhook:${webhookEndpointId}`;
    const now = Date.now();
    const entry = this.rateLimitMap.get(key);

    if (!entry || entry.resetAt < now) {
      this.rateLimitMap.set(key, {
        count: 1,
        resetAt: now + 60000,
      });
      return true;
    }

    if (entry.count >= limitPerMinute) {
      logger.warn({ webhookEndpointId, count: entry.count, limit: limitPerMinute }, "Webhook rate limit exceeded");
      return false;
    }

    entry.count++;
    return true;
  }

  // ---------------------------------------------------------------------------
  // CIRCUIT BREAKER
  // ---------------------------------------------------------------------------

  /**
   * Record a successful delivery. Resets the consecutive failure counter.
   */
  public async recordSuccess(webhookEndpointId: string): Promise<void> {
    const db = getDatabase();
    const endpoint = await this.getEndpoint(webhookEndpointId);
    if (!endpoint) return;

    if (endpoint.consecutiveFailures === 0 && endpoint.circuitBreakerStatus === "closed") {
      return; // Nothing to reset
    }

    const updateData: Record<string, any> = {
      consecutive_failures: 0,
      updated_at: new Date(),
    };

    // If we were in half_open state and now succeed, fully close the breaker
    if (endpoint.circuitBreakerStatus === "half_open") {
      updateData.circuit_breaker_status = "closed";
      updateData.circuit_breaker_reset_at = new Date();

      logger.info(
        { webhookEndpointId },
        "Webhook circuit breaker recovered (half_open → closed)"
      );
    }

    await db("webhook_endpoints").where("id", webhookEndpointId).update(updateData);
  }

  /**
   * Record a failed delivery. Increments the consecutive failure counter
   * and trips the circuit breaker when the threshold is reached.
   */
  public async recordFailure(webhookEndpointId: string): Promise<void> {
    const db = getDatabase();
    const endpoint = await this.getEndpoint(webhookEndpointId);
    if (!endpoint) return;

    // If the breaker is already open, don't count further
    if (endpoint.circuitBreakerStatus === "open") {
      return;
    }

    const newCount = endpoint.consecutiveFailures + 1;

    if (newCount >= CONSECUTIVE_FAILURE_THRESHOLD) {
      await this.tripCircuitBreaker(webhookEndpointId, newCount);
    } else {
      await db("webhook_endpoints")
        .where("id", webhookEndpointId)
        .update({
          consecutive_failures: newCount,
          updated_at: new Date(),
        });

      logger.debug(
        { webhookEndpointId, consecutiveFailures: newCount, threshold: CONSECUTIVE_FAILURE_THRESHOLD },
        "Webhook consecutive failure recorded"
      );

      if (newCount >= 3) {
        const currentEndpoint = await this.getEndpoint(webhookEndpointId);
        await this.sendWebhookFailureNotification(currentEndpoint, newCount);
      }
    }
  }

  /**
   * Trip the circuit breaker: mark the endpoint as open, deactivate it,
   * and broadcast a WebSocket system event.
   */
  private async tripCircuitBreaker(
    webhookEndpointId: string,
    failureCount: number,
  ): Promise<void> {
    const db = getDatabase();

    await db("webhook_endpoints")
      .where("id", webhookEndpointId)
      .update({
        consecutive_failures: failureCount,
        circuit_breaker_status: "open",
        circuit_breaker_tripped_at: new Date(),
        is_active: false,
        updated_at: new Date(),
      });

    const endpoint = await this.getEndpoint(webhookEndpointId);

    logger.warn(
      { webhookEndpointId, consecutiveFailures: failureCount },
      "Webhook circuit breaker tripped — endpoint suspended"
    );

    // Broadcast system event via WebSocket (events channel)
    this.emit("webhook:circuit_breaker:tripped", {
      webhookEndpointId,
      endpointName: endpoint?.name ?? "unknown",
      endpointUrl: endpoint?.url ?? "unknown",
      ownerAddress: endpoint?.ownerAddress ?? "unknown",
      consecutiveFailures: failureCount,
      threshold: CONSECUTIVE_FAILURE_THRESHOLD,
      trippedAt: new Date().toISOString(),
    });

    await this.sendWebhookFailureNotification(endpoint, failureCount);
  }

  private async sendWebhookFailureNotification(
    endpoint: WebhookEndpoint | null | undefined,
    failureCount: number,
    statusCode?: number | null
  ): Promise<void> {
    if (!endpoint) return;
    try {
      const { emailNotificationService } = await import("./email.service.js");
      const db = getDatabase();
      let recipientEmail: string | null = null;
      if (endpoint.ownerAddress.includes("@")) {
        recipientEmail = endpoint.ownerAddress;
      } else {
        try {
          const user = await db("users")
            .where({ stellar_address: endpoint.ownerAddress })
            .orWhere({ address: endpoint.ownerAddress })
            .first();
          recipientEmail = user?.email ?? null;
        } catch {
          recipientEmail = null;
        }
        if (!recipientEmail) {
          try {
            const operator = await db("bridge_operators")
              .where({ bridge_id: endpoint.id })
              .first();
            recipientEmail = (operator as any)?.contact_email ?? null;
          } catch {
            recipientEmail = null;
          }
        }
      }
      if (!recipientEmail) {
        logger.warn(
          { webhookEndpointId: endpoint.id },
          "No recipient email found for webhook failure notification"
        );
        return;
      }
      let failureLogsSummary = "";
      try {
        const logs = await db("webhook_delivery_logs")
          .where("webhook_endpoint_id", endpoint.id)
          .orderBy("created_at", "desc")
          .limit(5);
        failureLogsSummary = logs
          .map(
            (l: any) =>
              `Attempt ${l.attempt_number}: ${l.error_message || `HTTP ${l.response_status ?? "unknown"}`} at ${l.created_at}`
          )
          .join("\n");
        if (!failureLogsSummary) failureLogsSummary = "No recent delivery logs available.";
      } catch {
        failureLogsSummary = "Unable to retrieve failure logs.";
      }
      await emailNotificationService.sendAlertEmail(
        { email: recipientEmail },
        {
          alertType: "webhook.endpoint_failed",
          severity: "high",
          assetCode: "WEBHOOK",
          message: `Webhook endpoint ${endpoint.url} has been deactivated after ${failureCount} consecutive failures.`,
          triggeredAt: new Date().toISOString(),
          metadata: {
            endpointUrl: endpoint.url,
            endpointName: endpoint.name,
            statusCode: statusCode ?? null,
            failureCount,
            failureLogsSummary,
            isActive: false,
          },
        }
      );
      logger.info(
        { webhookEndpointId: endpoint.id, recipientEmail },
        "Webhook failure notification email sent"
      );
    } catch (error) {
      logger.error(
        { error, webhookEndpointId: endpoint?.id },
        "Failed to send webhook failure notification email"
      );
    }
  }

  /**
   * Manually reset the circuit breaker from the settings UI.
   * Re-activates the endpoint and clears the failure counter.
   */
  public async resetCircuitBreaker(webhookEndpointId: string): Promise<WebhookEndpoint | null> {
    const db = getDatabase();
    const endpoint = await this.getEndpoint(webhookEndpointId);
    if (!endpoint) return null;

    if (endpoint.circuitBreakerStatus === "closed" && endpoint.consecutiveFailures === 0) {
      return endpoint; // Already closed, no-op
    }

    await db("webhook_endpoints")
      .where("id", webhookEndpointId)
      .update({
        consecutive_failures: 0,
        circuit_breaker_status: "closed",
        circuit_breaker_reset_at: new Date(),
        is_active: true,
        updated_at: new Date(),
      });

    logger.info(
      { webhookEndpointId },
      "Webhook circuit breaker manually reset"
    );

    // Broadcast system event
    this.emit("webhook:circuit_breaker:reset", {
      webhookEndpointId,
      endpointName: endpoint.name,
      endpointUrl: endpoint.url,
      ownerAddress: endpoint.ownerAddress,
      resetAt: new Date().toISOString(),
    });

    return this.getEndpoint(webhookEndpointId);
  }

  /**
   * Get the current circuit breaker state for an endpoint.
   */
  public getCircuitBreakerState(endpoint: WebhookEndpoint): {
    status: WebhookCircuitBreakerStatus;
    consecutiveFailures: number;
    threshold: number;
    trippedAt: Date | null;
    resetAt: Date | null;
  } {
    return {
      status: endpoint.circuitBreakerStatus,
      consecutiveFailures: endpoint.consecutiveFailures,
      threshold: CONSECUTIVE_FAILURE_THRESHOLD,
      trippedAt: endpoint.circuitBreakerTrippedAt,
      resetAt: endpoint.circuitBreakerResetAt,
    };
  }

  // ---------------------------------------------------------------------------
  // ENDPOINT MANAGEMENT
  // ---------------------------------------------------------------------------

  public async createEndpoint(params: {
    ownerAddress: string;
    url: string;
    name: string;
    description?: string;
    rateLimitPerMinute?: number;
    customHeaders?: Record<string, string>;
    eventTypes?: WebhookEventType[];
    isBatchDeliveryEnabled?: boolean;
    batchWindowMs?: number;
  }): Promise<WebhookEndpoint> {
    const db = getDatabase();
    const secret = this.generateSecret();

    const [endpoint] = await db("webhook_endpoints")
      .insert({
        id: crypto.randomUUID(),
        owner_address: params.ownerAddress,
        url: params.url,
        name: params.name,
        description: params.description || null,
        secret,
        is_active: true,
        rate_limit_per_minute: params.rateLimitPerMinute || 60,
        custom_headers: JSON.stringify(params.customHeaders || {}),
        filter_event_types: JSON.stringify(params.eventTypes || []),
        is_batch_delivery_enabled: params.isBatchDeliveryEnabled || false,
        batch_window_ms: params.batchWindowMs || 5000,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning("*");

    logger.info({ webhookEndpointId: endpoint.id, ownerAddress: params.ownerAddress }, "Webhook endpoint created");

    return this.mapToEndpoint(endpoint);
  }

  public async updateEndpoint(
    webhookEndpointId: string,
    updates: Partial<{
      url: string;
      name: string;
      description: string;
      isActive: boolean;
      rateLimitPerMinute: number;
      customHeaders: Record<string, string>;
      filterEventTypes: WebhookEventType[];
      isBatchDeliveryEnabled: boolean;
      batchWindowMs: number;
    }>
  ): Promise<WebhookEndpoint | null> {
    const db = getDatabase();
    const updateData: Record<string, any> = { updated_at: new Date() };

    if (updates.url !== undefined) updateData.url = updates.url;
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.isActive !== undefined) updateData.is_active = updates.isActive;
    if (updates.rateLimitPerMinute !== undefined) updateData.rate_limit_per_minute = updates.rateLimitPerMinute;
    if (updates.customHeaders !== undefined) updateData.custom_headers = JSON.stringify(updates.customHeaders);
    if (updates.filterEventTypes !== undefined) updateData.filter_event_types = JSON.stringify(updates.filterEventTypes);
    if (updates.isBatchDeliveryEnabled !== undefined) updateData.is_batch_delivery_enabled = updates.isBatchDeliveryEnabled;
    if (updates.batchWindowMs !== undefined) updateData.batch_window_ms = updates.batchWindowMs;

    const [endpoint] = await db("webhook_endpoints")
      .where("id", webhookEndpointId)
      .update(updateData)
      .returning("*");

    if (!endpoint) return null;

    logger.info({ webhookEndpointId }, "Webhook endpoint updated");
    return this.mapToEndpoint(endpoint);
  }

  public async deleteEndpoint(webhookEndpointId: string): Promise<boolean> {
    const db = getDatabase();
    const deleted = await db("webhook_endpoints")
      .where("id", webhookEndpointId)
      .delete();

    if (deleted) {
      logger.info({ webhookEndpointId }, "Webhook endpoint deleted");
    }

    return deleted > 0;
  }

  public async getEndpoint(webhookEndpointId: string): Promise<WebhookEndpoint | null> {
    const db = getDatabase();
    const endpoint = await db("webhook_endpoints")
      .where("id", webhookEndpointId)
      .first();

    return endpoint ? this.mapToEndpoint(endpoint) : null;
  }

  public async listEndpoints(ownerAddress?: string): Promise<WebhookEndpoint[]> {
    const db = getDatabase();
    let query = db("webhook_endpoints");

    if (ownerAddress) {
      query = query.where("owner_address", ownerAddress);
    }

    const endpoints = await query.orderBy("created_at", "desc");
    return endpoints.map(this.mapToEndpoint);
  }

  public async getEndpointsForEvent(eventType: WebhookEventType): Promise<WebhookEndpoint[]> {
    const db = getDatabase();
    const endpoints = await db("webhook_endpoints")
      .where("is_active", true)
      .whereNotNull("filter_event_types")
      .whereNot("filter_event_types", "[]");

    return endpoints
      .map(this.mapToEndpoint)
      .filter((endpoint) =>
        endpoint.filterEventTypes.length === 0 ||
        endpoint.filterEventTypes.includes(eventType)
      );
  }

  // ---------------------------------------------------------------------------
  // DELIVERY MANAGEMENT
  // ---------------------------------------------------------------------------

  public async queueDelivery(params: {
    webhookEndpointId: string;
    eventType: WebhookEventType;
    payload: Record<string, any>;
    scheduledAt?: number;
  }): Promise<WebhookDelivery> {
    const db = getDatabase();

    const payload = this.redactWebhookPayload(params.payload);

    const endpoint = await this.getEndpoint(params.webhookEndpointId);
    if (!endpoint) {
      throw new Error(`Webhook endpoint not found: ${params.webhookEndpointId}`);
    }

    if (!this.checkRateLimit(params.webhookEndpointId, endpoint.rateLimitPerMinute)) {
      throw new Error(`Rate limit exceeded for webhook endpoint: ${params.webhookEndpointId}`);
    }

    // Route through batch buffer when enabled — the buffer auto-flushes after batchWindowMs
    if (endpoint.isBatchDeliveryEnabled) {
      const [delivery] = await db("webhook_deliveries")
        .insert({
          id: crypto.randomUUID(),
          webhook_endpoint_id: params.webhookEndpointId,
          event_type: params.eventType,
          payload: JSON.stringify(payload),
          status: "buffered",
          attempts: 0,
          created_at: new Date(),
        })
        .returning("*");

      this.batchBuffer.buffer({
        endpointId: params.webhookEndpointId,
        deliveryId: delivery.id,
        eventType: params.eventType,
        payload,
        windowMs: endpoint.batchWindowMs,
      });

      logger.info(
        { deliveryId: delivery.id, webhookEndpointId: params.webhookEndpointId, eventType: params.eventType, windowMs: endpoint.batchWindowMs },
        "Event buffered for batch delivery",
      );

      return this.mapToDelivery(delivery);
    }

    // Standard immediate delivery
    const [delivery] = await db("webhook_deliveries")
      .insert({
        id: crypto.randomUUID(),
        webhook_endpoint_id: params.webhookEndpointId,
        event_type: params.eventType,
        payload: JSON.stringify(payload),
        status: "pending",
        attempts: 0,
        created_at: new Date(),
      })
      .returning("*");

    const jobData = {
      deliveryId: delivery.id,
      webhookEndpointId: params.webhookEndpointId,
      eventType: params.eventType,
      payload,
      attemptNumber: 0,
    };

    if (params.scheduledAt && params.scheduledAt > Date.now()) {
      await this.deliveryQueue.add("webhook-delivery", jobData, { delay: params.scheduledAt - Date.now() });
    } else {
      await this.deliveryQueue.add("webhook-delivery", jobData);
    }

    logger.info(
      { deliveryId: delivery.id, webhookEndpointId: params.webhookEndpointId, eventType: params.eventType },
      "Webhook delivery queued",
    );

    return this.mapToDelivery(delivery);
  }

  /** Manually flush the batch buffer for a specific endpoint before the window expires. */
  public async flushBatchBuffer(webhookEndpointId: string): Promise<{ flushed: number }> {
    return this.batchBuffer.flush(webhookEndpointId);
  }

  private async resolveBufferedDeliveries(
    deliveryIds: string[],
    status: "success" | "failed",
    errorMessage?: string,
  ): Promise<void> {
    if (deliveryIds.length === 0) return;
    const db = getDatabase();
    await db("webhook_deliveries")
      .whereIn("id", deliveryIds)
      .update({
        status,
        last_attempt_at: new Date(),
        ...(errorMessage ? { error_message: errorMessage } : {}),
      });
  }

  /** Return live status of batch buffer windows. */
  public getBatchBufferStatus(webhookEndpointId?: string): BatchBufferStatus | BatchBufferStatus[] | null {
    if (webhookEndpointId) {
      return this.batchBuffer.getStatus(webhookEndpointId);
    }
    return this.batchBuffer.listAll();
  }

  public async queueBatchDelivery(params: {
    webhookEndpointId: string;
    eventType: WebhookEventType;
    events: Array<Record<string, any>>;
  }): Promise<WebhookDelivery[]> {
    const db = getDatabase();
    const endpoint = await this.getEndpoint(params.webhookEndpointId);

    if (!endpoint) {
      throw new Error(`Webhook endpoint not found: ${params.webhookEndpointId}`);
    }

    if (!endpoint.isBatchDeliveryEnabled) {
      throw new Error("Batch delivery is not enabled for this endpoint");
    }

    const events = params.events.map((event) => this.redactWebhookPayload(event));

    const batchPayload = {
      batch: true,
      eventType: params.eventType,
      count: events.length,
      events,
      timestamp: new Date().toISOString(),
    };

    // Create batch delivery record
    const [delivery] = await db("webhook_deliveries")
      .insert({
        id: crypto.randomUUID(),
        webhook_endpoint_id: params.webhookEndpointId,
        event_type: params.eventType,
        payload: JSON.stringify(batchPayload),
        status: "pending",
        attempts: 0,
        created_at: new Date(),
      })
      .returning("*");

    await this.deliveryQueue.add("webhook-delivery", {
      deliveryId: delivery.id,
      webhookEndpointId: params.webhookEndpointId,
      eventType: params.eventType,
      payload: batchPayload,
      attemptNumber: 0,
    });

    logger.info(
      { deliveryId: delivery.id, webhookEndpointId: params.webhookEndpointId, eventCount: params.events.length },
      "Batch webhook delivery queued"
    );

    return [this.mapToDelivery(delivery)];
  }

  /**
   * Redact a webhook payload through the webhook sink policy and record the
   * resulting decision. Runs before persistence and queueing so every stored
   * and transmitted copy (deliveries, job data, logs, outbox) is scrubbed.
   */
  private redactWebhookPayload(payload: Record<string, any>): Record<string, any> {
    const result = redactionService.redact(payload, { sink: "webhook" });
    void redactionDecisionService.record(result.decision);
    return result.output as Record<string, any>;
  }

  public async processDelivery(job: Job): Promise<{ status: number; body: string }> {
    const { deliveryId, webhookEndpointId, eventType, payload } = job.data;

    const endpoint = await this.getEndpoint(webhookEndpointId);
    if (!endpoint || !endpoint.isActive) {
      throw new Error(`Webhook endpoint is not active: ${webhookEndpointId}`);
    }

    // Refuse delivery if circuit breaker is tripped
    if (endpoint.circuitBreakerStatus === "open") {
      throw new Error(
        `Webhook endpoint circuit breaker is open: ${webhookEndpointId}. ` +
        `Reset the circuit breaker in endpoint settings to resume deliveries.`
      );
    }

    const payloadString = JSON.stringify(payload);
    const signatureHeaders = this.generateSignatureHeaders(payloadString, endpoint.secret);

    // Merge custom headers
    const headers = {
      ...signatureHeaders,
      ...endpoint.customHeaders,
      "User-Agent": "BridgeWatch-Webhook/1.0",
    };

    const startTime = Date.now();

    try {
      const response = await fetch(endpoint.url, {
        method: "POST",
        headers,
        body: payloadString,
        signal: AbortSignal.timeout(30000), // 30s timeout
      });

      const durationMs = Date.now() - startTime;
      const responseBody = await response.text();

      // Log the delivery attempt
      await this.logDeliveryAttempt({
        webhookEndpointId,
        webhookDeliveryId: deliveryId,
        eventType,
        requestHeaders: headers,
        requestBody: payloadString,
        responseStatus: response.status,
        responseBody,
        durationMs,
        attemptNumber: job.attemptsMade + 1,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${responseBody.substring(0, 500)}`);
      }

      // Update delivery status
      await this.updateDeliveryStatusFromResponse(deliveryId, response.status, responseBody);

      logger.info(
        { deliveryId, status: response.status, durationMs },
        "Webhook delivered successfully"
      );

      return { status: response.status, body: responseBody };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      // Log the failed attempt
      await this.logDeliveryAttempt({
        webhookEndpointId,
        webhookDeliveryId: deliveryId,
        eventType,
        requestHeaders: headers,
        requestBody: payloadString,
        responseStatus: null,
        responseBody: null,
        durationMs,
        attemptNumber: job.attemptsMade + 1,
        errorMessage,
      });

      throw error;
    }
  }

  public async updateDeliveryStatus(
    deliveryId: string,
    status: WebhookDeliveryStatus,
    responseData?: { status: number; body: string },
    errorMessage?: string
  ): Promise<void> {
    const db = getDatabase();
    const updateData: Record<string, any> = { status };

    if (status === "success" && responseData) {
      updateData.response_status = responseData.status;
      updateData.response_body = responseData.body;
      updateData.last_attempt_at = new Date();
    }

    if (status === "retrying") {
      updateData.attempts = db.raw("attempts + 1");
      updateData.last_attempt_at = new Date();
      updateData.next_retry_at = new Date(Date.now() + RETRY_DELAYS[Math.min(0, 0)]);
      updateData.error_message = errorMessage;
    }

    if (errorMessage) {
      updateData.error_message = errorMessage;
    }

    await db("webhook_deliveries").where("id", deliveryId).update(updateData);
  }

  private async updateDeliveryStatusFromResponse(
    deliveryId: string,
    responseStatus: number,
    responseBody: string
  ): Promise<void> {
    const db = getDatabase();
    await db("webhook_deliveries")
      .where("id", deliveryId)
      .update({
        status: "success",
        response_status: responseStatus,
        response_body: responseBody,
        last_attempt_at: new Date(),
      });
  }

  public async getDelivery(deliveryId: string): Promise<WebhookDelivery | null> {
    const db = getDatabase();
    const delivery = await db("webhook_deliveries")
      .where("id", deliveryId)
      .first();

    return delivery ? this.mapToDelivery(delivery) : null;
  }

  public async listDeliveries(
    webhookEndpointId?: string,
    status?: WebhookDeliveryStatus,
    limit: number = 100
  ): Promise<WebhookDelivery[]> {
    const db = getDatabase();
    let query = db("webhook_deliveries").orderBy("created_at", "desc").limit(limit);

    if (webhookEndpointId) {
      query = query.where("webhook_endpoint_id", webhookEndpointId);
    }

    if (status) {
      query = query.where("status", status);
    }

    const deliveries = await query;
    return deliveries.map(this.mapToDelivery);
  }

  // ---------------------------------------------------------------------------
  // DELIVERY LOGGING
  // ---------------------------------------------------------------------------

  public async logDeliveryAttempt(params: {
    webhookEndpointId: string;
    webhookDeliveryId: string;
    eventType: WebhookEventType;
    requestHeaders: Record<string, string>;
    requestBody: string;
    responseStatus: number | null;
    responseBody: string | null;
    durationMs: number;
    attemptNumber: number;
    errorMessage?: string;
  }): Promise<void> {
    const db = getDatabase();
    const payload = {
      id: crypto.randomUUID(),
      webhook_endpoint_id: params.webhookEndpointId,
      webhook_delivery_id: params.webhookDeliveryId,
      event_type: params.eventType,
      request_headers: JSON.stringify(params.requestHeaders),
      request_body: params.requestBody,
      response_status: params.responseStatus,
      response_body: params.responseBody,
      duration_ms: params.durationMs,
      attempt_number: params.attemptNumber,
      error_message: params.errorMessage || null,
      created_at: new Date(),
    };

    try {
      await db("webhook_delivery_logs")
        .insert(payload)
        .onConflict(["webhook_delivery_id", "attempt_number"])
        .merge({
          request_headers: payload.request_headers,
          request_body: payload.request_body,
          response_status: payload.response_status,
          response_body: payload.response_body,
          duration_ms: payload.duration_ms,
          error_message: payload.error_message,
          created_at: payload.created_at,
        });
    } catch (error: any) {
      const isUniqueViolation =
        error?.code === "23505" || /duplicate|unique/i.test(error?.message ?? "");
      if (isUniqueViolation) {
        logger.warn(
          { webhookDeliveryId: params.webhookDeliveryId, attemptNumber: params.attemptNumber },
          "Delivery log unique collision, resolving via upsert"
        );
        await db("webhook_delivery_logs")
          .where({
            webhook_delivery_id: params.webhookDeliveryId,
            attempt_number: params.attemptNumber,
          })
          .update({
            request_headers: payload.request_headers,
            request_body: payload.request_body,
            response_status: payload.response_status,
            response_body: payload.response_body,
            duration_ms: payload.duration_ms,
            error_message: payload.error_message,
          });
        return;
      }
      throw error;
    }
  }

  public async getDeliveryLogs(
    deliveryId: string,
    limit: number = 50
  ): Promise<WebhookDeliveryLog[]> {
    const db = getDatabase();
    const logs = await db("webhook_delivery_logs")
      .where("webhook_delivery_id", deliveryId)
      .orderBy("created_at", "desc")
      .limit(limit);

    return logs.map(this.mapToDeliveryLog);
  }

  public async getWebhookHistory(
    webhookEndpointId: string,
    limit: number = 100
  ): Promise<WebhookDelivery[]> {
    const db = getDatabase();
    const deliveries = await db("webhook_deliveries")
      .where("webhook_endpoint_id", webhookEndpointId)
      .orderBy("created_at", "desc")
      .limit(limit);

    return deliveries.map(this.mapToDelivery);
  }

  // ---------------------------------------------------------------------------
  // TEST DELIVERY
  // ---------------------------------------------------------------------------

  public async sendTestDelivery(webhookEndpointId: string): Promise<{
    success: boolean;
    status?: number;
    durationMs: number;
    error?: string;
  }> {
    const endpoint = await this.getEndpoint(webhookEndpointId);
    if (!endpoint) {
      throw new Error(`Webhook endpoint not found: ${webhookEndpointId}`);
    }

    const testPayload = {
      eventType: "test",
      timestamp: new Date().toISOString(),
      data: {
        message: "This is a test webhook delivery from BridgeWatch",
        webhookEndpointId,
        test: true,
      },
    };

    const payloadString = JSON.stringify(testPayload);
    const signatureHeaders = this.generateSignatureHeaders(payloadString, endpoint.secret);
    const headers = {
      ...signatureHeaders,
      ...endpoint.customHeaders,
      "User-Agent": "BridgeWatch-Webhook/1.0",
    };

    const startTime = Date.now();

    try {
      const response = await fetch(endpoint.url, {
        method: "POST",
        headers,
        body: payloadString,
        signal: AbortSignal.timeout(30000),
      });

      const durationMs = Date.now() - startTime;
      const responseBody = await response.text();

      return {
        success: response.ok,
        status: response.status,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      return {
        success: false,
        durationMs,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // ---------------------------------------------------------------------------
  // MAPPERS
  // ---------------------------------------------------------------------------

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
      customHeaders: typeof row.custom_headers === "string" ? JSON.parse(row.custom_headers) : row.custom_headers || {},
      filterEventTypes: typeof row.filter_event_types === "string" ? JSON.parse(row.filter_event_types) : row.filter_event_types || [],
      isBatchDeliveryEnabled: row.is_batch_delivery_enabled,
      batchWindowMs: row.batch_window_ms,
      consecutiveFailures: row.consecutive_failures ?? 0,
      circuitBreakerStatus: row.circuit_breaker_status ?? "closed",
      circuitBreakerTrippedAt: row.circuit_breaker_tripped_at ?? null,
      circuitBreakerResetAt: row.circuit_breaker_reset_at ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapToDelivery(row: any): WebhookDelivery {
    return {
      id: row.id,
      webhookEndpointId: row.webhook_endpoint_id,
      eventType: row.event_type,
      payload: typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload,
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

  private mapToDeliveryLog(row: any): WebhookDeliveryLog {
    return {
      id: row.id,
      webhookEndpointId: row.webhook_endpoint_id,
      webhookDeliveryId: row.webhook_delivery_id,
      eventType: row.event_type,
      requestHeaders: typeof row.request_headers === "string" ? JSON.parse(row.request_headers) : row.request_headers,
      requestBody: row.request_body,
      responseStatus: row.response_status,
      responseBody: row.response_body,
      durationMs: row.duration_ms,
      attemptNumber: row.attempt_number,
      createdAt: row.created_at,
    };
  }
}

// Export singleton instance
export const webhookService = WebhookService.getInstance();
