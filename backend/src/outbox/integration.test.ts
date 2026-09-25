import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import type { Knex } from "knex";
import knex from "knex";
import { OutboxProducer } from "./eventProducer.js";
import { OutboxDispatcher } from "./eventDispatcher.js";
import { OutboxAdminApi } from "./adminApi.js";
import { OutboxSystem } from "./index.js";

// Mock Redis for BullMQ
vi.mock("ioredis", () => {
  return {
    default: vi.fn(() => ({
      connect: vi.fn(),
      disconnect: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    })),
  };
});

vi.mock("bullmq", () => {
  const mockJobs: any[] = [];
  
  return {
    Queue: vi.fn(() => ({
      add: vi.fn((name, data, opts) => {
        mockJobs.push({ name, data, opts });
        return Promise.resolve({ id: `job-${Date.now()}` });
      }),
      addBulk: vi.fn((jobs) => {
        mockJobs.push(...jobs);
        return Promise.resolve(jobs.map((_, i) => ({ id: `job-${Date.now()}-${i}` })));
      }),
      close: vi.fn(),
      getWaiting: vi.fn(() => Promise.resolve([])),
      getActive: vi.fn(() => Promise.resolve([])),
    })),
    Worker: vi.fn(() => ({
      on: vi.fn(),
      close: vi.fn(),
    })),
    Job: vi.fn(),
  };
});

describe("Outbox Pattern Integration Tests", () => {
  let db: Knex;
  let outboxSystem: OutboxSystem;
  let outboxProducer: OutboxProducer;
  let dispatcher: OutboxDispatcher;
  let adminApi: OutboxAdminApi;

  beforeAll(async () => {
    // Create test database
    db = knex({
      client: "sqlite3",
      connection: ":memory:",
      useNullAsDefault: true,
    });

    // Create schema
    await createTestSchema(db);

    // Initialize outbox system
    outboxSystem = new OutboxSystem(db, {
      batchSize: 10,
      pollIntervalMs: 100, // Fast polling for tests
      maxRetries: 3,
      concurrency: 2,
      queueName: "test-outbox",
    });

    await outboxSystem.initialize();
    
    outboxProducer = new OutboxProducer(db);
    dispatcher = outboxSystem.getDispatcher()!;
    adminApi = outboxSystem.getAdminApi();
  });

  afterAll(async () => {
    await outboxSystem.stop();
    await db.destroy();
  });

  beforeEach(async () => {
    // Clean up tables
    await db("dead_letter_events").del();
    await db("outbox_events").del();
    await db("outbox_events_sequence").del();
    await db("alert_events").del();
    await db("webhook_deliveries").del();
  });

  describe("End-to-End Event Flow", () => {
    it("should handle complete alert lifecycle with outbox", async () => {
      // 1. Simulate alert evaluation with outbox events
      await simulateAlertEvaluation();

      // 2. Verify events are in outbox
      const pendingEvents = await outboxProducer.getPendingEvents(10);
      expect(pendingEvents.length).toBeGreaterThan(0);

      // 3. Process events (simulate dispatcher)
      await processAllPendingEvents();

      // 4. Verify events are delivered
      const stats = await adminApi.getStats();
      expect(stats.outbox.delivered).toBeGreaterThan(0);
      expect(stats.outbox.pending).toBe(0);
    });

    it("should maintain event ordering within aggregates", async () => {
      const alertId = "alert-ordering-test";

      // Publish multiple events for same alert
      await db.transaction(async (tx) => {
        for (let i = 1; i <= 5; i++) {
          await outboxProducer.publishTransactional(tx, {
            aggregateType: "Alert",
            aggregateId: alertId,
            eventType: (i === 1 ? "alert.triggered" : "alert.updated") as any,
            payload: { step: i, timestamp: new Date().toISOString() },
          });
        }
      });

      // Verify sequence numbers are correct
      const events = await db("outbox_events")
        .where({ aggregate_id: alertId })
        .orderBy("sequence_no", "asc");

      expect(events).toHaveLength(5);
      events.forEach((event, index) => {
        expect(event.sequence_no).toBe(index + 1);
      });
    });

    it("should handle concurrent event publishing", async () => {
      const concurrentPromises = [];

      // Simulate concurrent alert evaluations
      for (let i = 0; i < 10; i++) {
        concurrentPromises.push(
          simulateAlertEvaluation(`concurrent-alert-${i}`)
        );
      }

      await Promise.all(concurrentPromises);

      // Verify all events were created
      const totalEvents = await db("outbox_events").count("* as count");
      expect(parseInt(totalEvents[0].count as string)).toBeGreaterThanOrEqual(10);

      // Verify no sequence conflicts
      const sequenceCheck = await db("outbox_events")
        .select("aggregate_type", "aggregate_id", "sequence_no")
        .groupBy("aggregate_type", "aggregate_id", "sequence_no")
        .having(db.raw("COUNT(*) > 1"));

      expect(sequenceCheck).toHaveLength(0);
    });

    it("should handle retry logic with exponential backoff", async () => {
      // Create an event
      await outboxProducer.publish({
        aggregateType: "Test",
        aggregateId: "retry-test",
        eventType: "test.event" as any,
        payload: { test: true },
      });

      const [event] = await db("outbox_events").select("*");
      const eventId = event.id.toString();

      // Simulate failures with retry
      const initialTime = Date.now();
      
      for (let attempt = 1; attempt <= 3; attempt++) {
        await outboxProducer.markForRetry(eventId, `Attempt ${attempt} failed`, 5);
        
        const [retryEvent] = await db("outbox_events").where({ id: eventId });
        expect(retryEvent.retry_count).toBe(attempt);
        expect(retryEvent.status).toBe("pending");
        
        // Verify exponential backoff
        const retryAfter = new Date(retryEvent.retry_after).getTime();
        const expectedMinDelay = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s
        expect(retryAfter - initialTime).toBeGreaterThanOrEqual(expectedMinDelay);
      }
    });

    it("should move events to dead letter queue after max retries", async () => {
      await outboxProducer.publish({
        aggregateType: "Test",
        aggregateId: "dlq-test",
        eventType: "test.event" as any,
        payload: { willFail: true },
      });

      const [event] = await db("outbox_events").select("*");
      const eventId = event.id.toString();

      // Exceed max retries
      for (let i = 1; i <= 5; i++) {
        await outboxProducer.markForRetry(eventId, `Failure ${i}`, 3);
      }

      // Verify event is dead-lettered and in DLQ
      const [failedEvent] = await db("outbox_events").where({ id: eventId });
      expect(failedEvent.status).toBe("dead_letter");

      const dlqEvents = await db("dead_letter_events").select("*");
      expect(dlqEvents).toHaveLength(1);
      expect(dlqEvents[0].outbox_id).toBe(parseInt(eventId));
      expect(dlqEvents[0].error_count).toBe(4); // Final retry count
    });
  });

  describe("Admin Operations", () => {
    beforeEach(async () => {
      // Create test data
      await createTestEvents();
    });

    it("should provide accurate statistics", async () => {
      const stats = await adminApi.getStats();

      expect(stats.outbox.totalEvents).toBeGreaterThan(0);
      expect(stats.outbox.pending).toBeGreaterThan(0);
      expect(typeof stats.outbox.delivered).toBe("number");
      expect(typeof stats.outbox.failed).toBe("number");
    });

    it("should retry failed events successfully", async () => {
      // Create and fail an event
      await outboxProducer.publish({
        aggregateType: "Test",
        aggregateId: "retry-admin-test",
        eventType: "test.event" as any,
        payload: {},
      });

      const [event] = await db("outbox_events").select("*");
      const eventId = event.id.toString();

      // Force failure
      await outboxProducer.markForRetry(eventId, "Test failure", 1);

      // Retry via admin API
      const result = await adminApi.retryEvent(eventId);
      expect(result.success).toBe(true);

      // Verify event is back to pending
      const [retriedEvent] = await db("outbox_events").where({ id: eventId });
      expect(retriedEvent.status).toBe("pending");
      expect(retriedEvent.retry_count).toBe(0);
    });

    it("should handle batch retry operations", async () => {
      const eventIds: string[] = [];

      // Create multiple failed events
      for (let i = 0; i < 3; i++) {
        await outboxProducer.publish({
          aggregateType: "Test",
          aggregateId: `batch-retry-${i}`,
          eventType: "test.event" as any,
          payload: {},
        });
      }

      const events = await db("outbox_events").select("*");
      for (const event of events) {
        await outboxProducer.markForRetry(event.id.toString(), "Batch test failure", 1);
        eventIds.push(event.id.toString());
      }

      // Batch retry
      const result = await (adminApi as any).retryEvents(eventIds);
      expect(result.success).toBe(3);
      expect(result.failed).toBe(0);

      // Verify all events are pending
      const retriedEvents = await db("outbox_events").where("status", "pending");
      expect(retriedEvents).toHaveLength(3);
    });
  });

  describe("System Health and Monitoring", () => {
    it("should report healthy status when system is running", async () => {
      const health = await outboxSystem.healthCheck();

      expect(health.status).toBe("healthy");
      expect(health.details.initialized).toBe(true);
      expect(health.details.dispatcherRunning).toBe(true);
    });

    it("should report degraded status with high failure rate", async () => {
      // Create many failed events
      for (let i = 0; i < 150; i++) {
        await outboxProducer.publish({
          aggregateType: "Test",
          aggregateId: `failure-test-${i}`,
          eventType: "test.event" as any,
          payload: {},
        });

        const [event] = await db("outbox_events")
          .select("*")
          .orderBy("id", "desc")
          .limit(1);

        await outboxProducer.markForRetry(event.id.toString(), "Mass failure test", 1);
      }

      const health = await outboxSystem.healthCheck();
      expect(health.status).toBe("degraded");
      expect(health.details.failedEvents).toBeGreaterThan(100);
    });
  });

  describe("Performance and Scalability", () => {
    it("should handle high-volume event publishing", async () => {
      const startTime = Date.now();
      const eventCount = 1000;

      // Batch publish events
      const events = Array.from({ length: eventCount }, (_, i) => ({
        aggregateType: "Performance",
        aggregateId: `perf-test-${i % 100}`, // 100 different aggregates
        eventType: "performance.test" as any,
        payload: { index: i, timestamp: new Date().toISOString() },
      }));

      await outboxProducer.publishBatch(events);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Verify all events were created
      const totalEvents = await db("outbox_events").count("* as count");
      expect(parseInt(totalEvents[0].count as string)).toBe(eventCount);

      // Performance assertion (should complete within reasonable time)
      expect(duration).toBeLessThan(10000); // 10 seconds max

      console.log(`Published ${eventCount} events in ${duration}ms (${(eventCount / duration * 1000).toFixed(2)} events/sec)`);
    });

    it("should maintain performance with large outbox table", async () => {
      // Create large number of delivered events (simulating production load)
      const batchSize = 100;
      const batches = 10;

      for (let batch = 0; batch < batches; batch++) {
        const events = Array.from({ length: batchSize }, (_, i) => ({
          aggregateType: "Load",
          aggregateId: `load-test-${batch}-${i}`,
          eventType: "load.test" as any,
          payload: { batch, index: i },
        }));

        await outboxProducer.publishBatch(events);

        // Mark some as delivered to simulate processing
        const batchEvents = await db("outbox_events")
          .select("*")
          .orderBy("id", "desc")
          .limit(batchSize);

        for (const event of batchEvents.slice(0, batchSize / 2)) {
          await outboxProducer.markDelivered(event.id.toString());
        }
      }

      // Test query performance with large dataset
      const startTime = Date.now();
      const pendingEvents = await outboxProducer.getPendingEvents(50);
      const queryTime = Date.now() - startTime;

      expect(pendingEvents.length).toBeGreaterThan(0);
      expect(queryTime).toBeLessThan(1000); // Should complete within 1 second

      console.log(`Queried pending events from ${batches * batchSize} total events in ${queryTime}ms`);
    });
  });

  // Helper functions
  async function createTestSchema(db: Knex): Promise<void> {
    // Outbox tables
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

    // Business tables for testing
    await db.schema.createTable("alert_events", (table) => {
      table.increments("id").primary();
      table.string("rule_id").notNullable();
      table.string("asset_code").notNullable();
      table.string("alert_type").notNullable();
      table.string("priority").notNullable();
      table.decimal("triggered_value", 30, 8).notNullable();
      table.decimal("threshold", 30, 8).notNullable();
      table.string("metric").notNullable();
      table.timestamp("time").notNullable().defaultTo(db.fn.now());
    });

    await db.schema.createTable("webhook_deliveries", (table) => {
      table.string("id").primary();
      table.string("webhook_endpoint_id").notNullable();
      table.string("event_type").notNullable();
      table.text("payload").notNullable();
      table.string("status").notNullable().defaultTo("pending");
      table.integer("attempts").notNullable().defaultTo(0);
      table.timestamp("created_at").notNullable().defaultTo(db.fn.now());
    });

    // Mock sequence function
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
  }

  async function simulateAlertEvaluation(alertId = "test-alert"): Promise<void> {
    await db.transaction(async (tx) => {
      // Insert alert event
      const [alertEvent] = await tx("alert_events").insert({
        rule_id: alertId,
        asset_code: "USDC",
        alert_type: "price_deviation",
        priority: "high",
        triggered_value: 1.05,
        threshold: 1.02,
        metric: "price",
      }).returning("*");

      // Publish outbox events
      await outboxProducer.publishTransactional(tx, {
        aggregateType: "Alert",
        aggregateId: alertId,
        eventType: "alert.triggered",
        payload: {
          ruleId: alertId,
          assetCode: "USDC",
          alertType: "price_deviation",
          priority: "high",
          triggeredValue: 1.05,
          threshold: 1.02,
        },
      });

      await outboxProducer.publishTransactional(tx, {
        aggregateType: "Webhook",
        aggregateId: `webhook-${alertId}`,
        eventType: "webhook.delivery",
        payload: {
          url: "https://example.com/webhook",
          eventType: "alert.triggered",
          payload: { alertId, message: "Price deviation detected" },
        },
      });
    });
  }

  async function processAllPendingEvents(): Promise<void> {
    const pendingEvents = await outboxProducer.getPendingEvents(100);
    
    for (const event of pendingEvents) {
      // Simulate successful processing
      await outboxProducer.markProcessing(event.id);
      await outboxProducer.markDelivered(event.id);
    }
  }

  async function createTestEvents(): Promise<void> {
    // Create mix of pending, delivered, and failed events
    const eventTypes = ["pending", "delivered", "failed"];
    
    for (let i = 0; i < 10; i++) {
      await outboxProducer.publish({
        aggregateType: "Test",
        aggregateId: `test-${i}`,
        eventType: "test.event" as any,
        payload: { index: i },
      });

      const [event] = await db("outbox_events")
        .select("*")
        .orderBy("id", "desc")
        .limit(1);

      const status = eventTypes[i % 3];
      if (status === "delivered") {
        await outboxProducer.markDelivered(event.id.toString());
      } else if (status === "failed") {
        await outboxProducer.markForRetry(event.id.toString(), "Test failure", 1);
      }
    }
  }
});