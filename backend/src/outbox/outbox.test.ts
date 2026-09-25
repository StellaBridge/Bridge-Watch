import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Knex } from "knex";
import knex from "knex";
import { OutboxProducer } from "./eventProducer.js";
import { OutboxDispatcher } from "./eventDispatcher.js";
import { OutboxAdminApi } from "./adminApi.js";

// Test database configuration
const testDbConfig: Knex.Config = {
  client: "sqlite3",
  connection: ":memory:",
  useNullAsDefault: true,
  migrations: {
    directory: "./src/database/migrations",
  },
};

describe("Outbox Pattern Implementation", () => {
  let db: Knex;
  let outboxProducer: OutboxProducer;
  let adminApi: OutboxAdminApi;

  beforeEach(async () => {
    // Create in-memory SQLite database for testing
    db = knex(testDbConfig);
    
    // Create outbox tables manually for SQLite (simplified schema)
    await db.schema.createTable("outbox_events_sequence", (table) => {
      table.string("aggregate_type").notNullable();
      table.string("aggregate_id").notNullable();
      table.bigInteger("seq").notNullable().defaultTo(0);
      table.primary(["aggregate_type", "aggregate_id"]);
    });

    await db.schema.createTable("outbox_events", (table) => {
      table.increments("id").primary();
      table.string("aggregate_type").notNullable();
      table.string("aggregate_id").notNullable();
      table.bigInteger("sequence_no").notNullable();
      table.string("event_type").notNullable();
      table.text("payload").notNullable();
      table.text("metadata").notNullable().defaultTo("{}");
      table.string("status").notNullable().defaultTo("pending");
      table.integer("retry_count").notNullable().defaultTo(0);
      table.timestamp("retry_after").notNullable().defaultTo(db.fn.now());
      table.timestamp("delivered_at").nullable();
      table.text("error_message").nullable();
      table.timestamp("created_at").notNullable().defaultTo(db.fn.now());
      
      table.unique(["aggregate_type", "aggregate_id", "sequence_no"]);
    });

    await db.schema.createTable("dead_letter_events", (table) => {
      table.string("id").primary();
      table.integer("outbox_id").notNullable();
      table.string("event_type").notNullable();
      table.string("aggregate_id").notNullable();
      table.text("payload").notNullable();
      table.integer("error_count").notNullable().defaultTo(1);
      table.text("last_error").notNullable();
      table.timestamp("last_attempt").notNullable().defaultTo(db.fn.now());
      table.timestamp("created_at").notNullable().defaultTo(db.fn.now());
    });

    // Mock the PostgreSQL sequence function for SQLite
    const mockGetNextSequence = async (aggregateType: string, aggregateId: string) => {
      const existing = await db("outbox_events_sequence")
        .where({ aggregate_type: aggregateType, aggregate_id: aggregateId })
        .first();

      if (existing) {
        const newSeq = existing.seq + 1;
        await db("outbox_events_sequence")
          .where({ aggregate_type: aggregateType, aggregate_id: aggregateId })
          .update({ seq: newSeq });
        return newSeq;
      } else {
        await db("outbox_events_sequence").insert({
          aggregate_type: aggregateType,
          aggregate_id: aggregateId,
          seq: 1,
        });
        return 1;
      }
    };

    // Mock the raw query for sequence generation
    vi.spyOn(db, "raw").mockImplementation((async (sql: string, bindings?: any[]) => {
      if (sql.includes("get_next_outbox_sequence")) {
        const [aggregateType, aggregateId] = bindings || [];
        const seq = await mockGetNextSequence(aggregateType, aggregateId);
        return [{ get_next_outbox_sequence: seq }];
      }
      return [];
    }) as any);

    outboxProducer = new OutboxProducer(db);
    adminApi = new OutboxAdminApi(db);
  });

  afterEach(async () => {
    await db.destroy();
    vi.restoreAllMocks();
  });

  describe("OutboxProducer", () => {
    it("should publish event transactionally", async () => {
      await db.transaction(async (tx) => {
        await outboxProducer.publishTransactional(tx, {
          aggregateType: "Alert",
          aggregateId: "alert-123",
          eventType: "alert.triggered",
          payload: {
            ruleId: "rule-456",
            assetCode: "USDC",
            alertType: "price_deviation",
          },
          metadata: {
            traceId: "trace-789",
          },
        });
      });

      const events = await db("outbox_events").select("*");
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        aggregate_type: "Alert",
        aggregate_id: "alert-123",
        sequence_no: 1,
        event_type: "alert.triggered",
        status: "pending",
        retry_count: 0,
      });

      const payload = JSON.parse(events[0].payload);
      expect(payload).toMatchObject({
        ruleId: "rule-456",
        assetCode: "USDC",
        alertType: "price_deviation",
      });
    });

    it("should maintain sequence ordering per aggregate", async () => {
      const aggregateId = "alert-123";

      // Publish multiple events for the same aggregate
      for (let i = 1; i <= 3; i++) {
        await outboxProducer.publish({
          aggregateType: "Alert",
          aggregateId,
          eventType: "alert.triggered",
          payload: { eventNumber: i },
        });
      }

      const events = await db("outbox_events")
        .where({ aggregate_id: aggregateId })
        .orderBy("sequence_no", "asc");

      expect(events).toHaveLength(3);
      expect(events[0].sequence_no).toBe(1);
      expect(events[1].sequence_no).toBe(2);
      expect(events[2].sequence_no).toBe(3);
    });

    it("should handle different aggregates independently", async () => {
      await Promise.all([
        outboxProducer.publish({
          aggregateType: "Alert",
          aggregateId: "alert-1",
          eventType: "alert.triggered",
          payload: {},
        }),
        outboxProducer.publish({
          aggregateType: "Alert",
          aggregateId: "alert-2",
          eventType: "alert.triggered",
          payload: {},
        }),
        outboxProducer.publish({
          aggregateType: "Webhook",
          aggregateId: "webhook-1",
          eventType: "webhook.delivery",
          payload: {},
        }),
      ]);

      const alertEvents = await db("outbox_events")
        .where({ aggregate_type: "Alert" })
        .orderBy(["aggregate_id", "sequence_no"]);

      const webhookEvents = await db("outbox_events")
        .where({ aggregate_type: "Webhook" });

      expect(alertEvents).toHaveLength(2);
      expect(webhookEvents).toHaveLength(1);

      // Each aggregate should start with sequence 1
      expect(alertEvents[0].sequence_no).toBe(1);
      expect(alertEvents[1].sequence_no).toBe(1);
      expect(webhookEvents[0].sequence_no).toBe(1);
    });

    it("should get pending events with proper ordering", async () => {
      // Create events with different timestamps
      await outboxProducer.publish({
        aggregateType: "Alert",
        aggregateId: "alert-1",
        eventType: "alert.triggered",
        payload: {},
      });

      await outboxProducer.publish({
        aggregateType: "Alert",
        aggregateId: "alert-1",
        eventType: "alert.resolved",
        payload: {},
      });

      await outboxProducer.publish({
        aggregateType: "Webhook",
        aggregateId: "webhook-1",
        eventType: "webhook.delivery",
        payload: {},
      });

      const pendingEvents = await outboxProducer.getPendingEvents(10, false);

      expect(pendingEvents).toHaveLength(3);
      
      // Should be ordered by aggregate_type, aggregate_id, sequence_no
      expect(pendingEvents[0].aggregateType).toBe("Alert");
      expect(pendingEvents[0].sequenceNo).toBe("1");
      expect(pendingEvents[1].aggregateType).toBe("Alert");
      expect(pendingEvents[1].sequenceNo).toBe("2");
      expect(pendingEvents[2].aggregateType).toBe("Webhook");
      expect(pendingEvents[2].sequenceNo).toBe("1");
    });

    it("should mark events as delivered", async () => {
      await outboxProducer.publish({
        aggregateType: "Alert",
        aggregateId: "alert-123",
        eventType: "alert.triggered",
        payload: {},
      });

      const [event] = await db("outbox_events").select("*");
      await outboxProducer.markDelivered(event.id.toString());

      const [updatedEvent] = await db("outbox_events").select("*");
      expect(updatedEvent.status).toBe("delivered");
      expect(updatedEvent.delivered_at).toBeTruthy();
    });

    it("should handle retry logic with exponential backoff", async () => {
      await outboxProducer.publish({
        aggregateType: "Alert",
        aggregateId: "alert-123",
        eventType: "alert.triggered",
        payload: {},
      });

      const [event] = await db("outbox_events").select("*");
      const eventId = event.id.toString();

      // First retry
      await outboxProducer.markForRetry(eventId, "Network error", 5);
      
      let [retryEvent] = await db("outbox_events").select("*");
      expect(retryEvent.status).toBe("pending");
      expect(retryEvent.retry_count).toBe(1);
      expect(retryEvent.error_message).toBe("Network error");
      expect(new Date(retryEvent.retry_after).getTime()).toBeGreaterThan(Date.now());

      // Multiple retries should increase backoff
      for (let i = 2; i < 5; i++) {
        await outboxProducer.markForRetry(eventId, "Network error", 5);
        [retryEvent] = await db("outbox_events").select("*");
        expect(retryEvent.retry_count).toBe(i);
      }

      // Final retry should move to dead letter queue
      await outboxProducer.markForRetry(eventId, "Final error", 5);
      
      const [finalEvent] = await db("outbox_events").select("*");
      expect(finalEvent.status).toBe("dead_letter");

      const deadLetterEvents = await db("dead_letter_events").select("*");
      expect(deadLetterEvents).toHaveLength(1);
      expect(deadLetterEvents[0].last_error).toBe("Final error");
      expect(deadLetterEvents[0].error_count).toBe(5);
    });
  });

  describe("OutboxAdminApi", () => {
    beforeEach(async () => {
      // Create test data
      await outboxProducer.publish({
        aggregateType: "Alert",
        aggregateId: "alert-1",
        eventType: "alert.triggered",
        payload: { test: "data1" },
      });

      await outboxProducer.publish({
        aggregateType: "Alert",
        aggregateId: "alert-2",
        eventType: "alert.triggered",
        payload: { test: "data2" },
      });

      // Mark one as delivered
      const events = await db("outbox_events").select("*");
      await outboxProducer.markDelivered(events[0].id.toString());

      // Mark one as failed
      await outboxProducer.markForRetry(events[1].id.toString(), "Test error", 1);
    });

    it("should get comprehensive stats", async () => {
      const stats = await adminApi.getStats();

      expect(stats.outbox.totalEvents).toBe(2);
      expect(stats.outbox.delivered).toBe(1);
      expect(stats.outbox.failed).toBe(1);
      expect(stats.outbox.pending).toBe(0);
      expect(stats.deadLetter.total).toBe(1);
    });

    it("should get pending events with pagination", async () => {
      // Add more pending events
      for (let i = 0; i < 5; i++) {
        await outboxProducer.publish({
          aggregateType: "Test",
          aggregateId: `test-${i}`,
          eventType: "test.event" as any,
          payload: { index: i },
        });
      }

      const result = await adminApi.getPendingEvents(3, 0);
      
      expect(result.events).toHaveLength(3);
      expect(result.total).toBe(5);
      expect(result.hasMore).toBe(true);

      const nextPage = await adminApi.getPendingEvents(3, 3);
      expect(nextPage.events).toHaveLength(2);
      expect(nextPage.hasMore).toBe(false);
    });

    it("should retry failed events", async () => {
      const events = await db("outbox_events").where({ status: "failed" });
      expect(events).toHaveLength(1);

      const result = await adminApi.retryEvent(events[0].id.toString());
      
      expect(result.success).toBe(true);
      expect(result.message).toBe("Event queued for retry");

      const [retriedEvent] = await db("outbox_events").where({ id: events[0].id });
      expect(retriedEvent.status).toBe("pending");
      expect(retriedEvent.retry_count).toBe(0);
      expect(retriedEvent.error_message).toBeNull();
    });

    it("should handle retry of non-existent event", async () => {
      const result = await adminApi.retryEvent("non-existent-id");
      
      expect(result.success).toBe(false);
      expect(result.message).toContain("Event not found");
    });

    it("should handle retry of non-failed event", async () => {
      const events = await db("outbox_events").where({ status: "delivered" });
      const result = await adminApi.retryEvent(events[0].id.toString());
      
      expect(result.success).toBe(false);
      expect(result.message).toContain("not in failed state");
    });
  });

  describe("Integration Tests", () => {
    it("should handle complete event lifecycle", async () => {
      // 1. Publish event
      await outboxProducer.publish({
        aggregateType: "Alert",
        aggregateId: "alert-lifecycle",
        eventType: "alert.triggered",
        payload: {
          ruleId: "rule-123",
          assetCode: "USDC",
        },
      });

      // 2. Get pending events
      const pendingEvents = await outboxProducer.getPendingEvents(10);
      expect(pendingEvents).toHaveLength(1);
      expect(pendingEvents[0].status).toBe("pending");

      // 3. Mark as processing
      const eventId = pendingEvents[0].id;
      const marked = await outboxProducer.markProcessing(eventId);
      expect(marked).toBe(true);

      const [processingEvent] = await db("outbox_events").where({ id: eventId });
      expect(processingEvent.status).toBe("processing");

      // 4. Mark as delivered
      await outboxProducer.markDelivered(eventId);

      const [deliveredEvent] = await db("outbox_events").where({ id: eventId });
      expect(deliveredEvent.status).toBe("delivered");
      expect(deliveredEvent.delivered_at).toBeTruthy();

      // 5. Verify stats
      const stats = await adminApi.getStats();
      expect(stats.outbox.delivered).toBe(1);
      expect(stats.outbox.pending).toBe(0);
      expect(stats.outbox.processing).toBe(0);
    });

    it("should prevent duplicate processing", async () => {
      await outboxProducer.publish({
        aggregateType: "Alert",
        aggregateId: "alert-duplicate",
        eventType: "alert.triggered",
        payload: {},
      });

      const [event] = await db("outbox_events").select("*");
      const eventId = event.id.toString();

      // First mark should succeed
      const firstMark = await outboxProducer.markProcessing(eventId);
      expect(firstMark).toBe(true);

      // Second mark should fail (already processing)
      const secondMark = await outboxProducer.markProcessing(eventId);
      expect(secondMark).toBe(false);
    });
  });
});