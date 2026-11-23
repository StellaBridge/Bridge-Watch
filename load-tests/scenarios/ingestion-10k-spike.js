import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate, Trend, Gauge } from "k6/metrics";

const baseUrl = __ENV.BASE_URL || "http://127.0.0.1:3001";
const apiKey = __ENV.API_KEY || "test-ingestion-key";

const ingestionSuccessRate = new Rate("ingestion_success_rate");
const ingestionErrorRate = new Rate("ingestion_error_rate");
const batchProcessingTime = new Trend("batch_processing_time_ms");
const queueBacklog = new Gauge("queue_backlog_estimate");
const redisMemoryUsage = new Gauge("redis_memory_mb");
const dbInsertionLatency = new Trend("db_insertion_latency_ms");
const failedBatches = new Counter("failed_batches");
const processedTransactions = new Counter("processed_transactions");

export const options = {
  scenarios: {
    ingestion_spike: {
      executor: "ramping-arrival-rate",
      startRate: 100,
      timeUnit: "1s",
      preAllocatedVUs: 100,
      maxVUs: 500,
      stages: [
        { duration: "30s", target: 500 },
        { duration: "1m", target: 10000 },
        { duration: "2m", target: 10000 },
        { duration: "30s", target: 500 },
        { duration: "30s", target: 100 },
      ],
      gracefulRampDown: "30s",
    },
  },
  thresholds: {
    "ingestion_success_rate": ["rate>0.999"],
    "ingestion_error_rate": ["rate<0.001"],
    "batch_processing_time_ms": ["p(95)<5000", "p(99)<10000"],
    "http_req_duration": ["p(95)<3000", "p(99)<8000"],
    "http_req_failed": ["rate<0.001"],
  },
  summaryTrendStats: ["avg", "min", "med", "max", "p(90)", "p(95)", "p(99)"],
};

function generateTransactionBatch(batchSize = 500) {
  const transactions = [];
  const bridgeIds = [
    "bridge-wormhole-usdc",
    "bridge-circle-usdc",
    "bridge-allbridge-usdt",
    "bridge-multichain-eth",
  ];
  
  const assetCodes = ["USDC", "USDT", "ETH", "BTC", "DAI"];
  
  for (let i = 0; i < batchSize; i++) {
    transactions.push({
      txHash: `0x${Math.random().toString(16).substring(2)}${Math.random().toString(16).substring(2)}`,
      bridgeId: bridgeIds[Math.floor(Math.random() * bridgeIds.length)],
      assetCode: assetCodes[Math.floor(Math.random() * assetCodes.length)],
      amount: (Math.random() * 10000).toFixed(2),
      direction: Math.random() > 0.5 ? "inflow" : "outflow",
      sourceChain: "ethereum",
      destinationChain: "stellar",
      timestamp: new Date().toISOString(),
      status: "confirmed",
      blockNumber: Math.floor(Math.random() * 1000000) + 15000000,
      sender: `0x${Math.random().toString(16).substring(2, 42)}`,
      recipient: `G${Math.random().toString(36).substring(2, 58).toUpperCase()}`,
    });
  }
  
  return transactions;
}

function checkSystemHealth() {
  const healthRes = http.get(`${baseUrl}/health`, {
    tags: { name: "health_check" },
    timeout: "5s",
  });
  
  if (healthRes.status === 200 && healthRes.body) {
    try {
      const health = JSON.parse(healthRes.body);
      
      if (health.redis && health.redis.memoryUsedMb) {
        redisMemoryUsage.add(health.redis.memoryUsedMb);
      }
      
      if (health.queue && health.queue.backlog) {
        queueBacklog.add(health.queue.backlog);
      }
      
      if (health.database && health.database.avgQueryTimeMs) {
        dbInsertionLatency.add(health.database.avgQueryTimeMs);
      }
    } catch (e) {
      // Health endpoint might not return all metrics
    }
  }
}

export default function () {
  const batchSize = 500;
  const batch = generateTransactionBatch(batchSize);
  
  const startTime = Date.now();
  
  const res = http.post(
    `${baseUrl}/api/v1/ingestion/transactions/batch`,
    JSON.stringify({ transactions: batch }),
    {
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      tags: { name: "batch_ingestion" },
      timeout: "30s",
    }
  );
  
  const duration = Date.now() - startTime;
  batchProcessingTime.add(duration);
  
  const success = check(res, {
    "status is 200 or 202": (r) => r.status === 200 || r.status === 202,
    "response time < 10s": (r) => r.timings.duration < 10000,
    "has job id": (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.jobId !== undefined || body.accepted !== undefined;
      } catch {
        return false;
      }
    },
  });
  
  if (success) {
    ingestionSuccessRate.add(1);
    processedTransactions.add(batchSize);
  } else {
    ingestionErrorRate.add(1);
    failedBatches.add(1);
  }
  
  if (res.status >= 500) {
    ingestionErrorRate.add(1);
  }
  
  if (Math.random() < 0.1) {
    checkSystemHealth();
  }
  
  sleep(0.1);
}

export function handleSummary(data) {
  const summary = {
    testDuration: data.state.testRunDurationMs / 1000,
    totalTransactions: data.metrics.processed_transactions?.values?.count || 0,
    successRate: (data.metrics.ingestion_success_rate?.values?.rate || 0) * 100,
    errorRate: (data.metrics.ingestion_error_rate?.values?.rate || 0) * 100,
    failedBatches: data.metrics.failed_batches?.values?.count || 0,
    batchProcessing: {
      avg: data.metrics.batch_processing_time_ms?.values?.avg || 0,
      p95: data.metrics.batch_processing_time_ms?.values?.["p(95)"] || 0,
      p99: data.metrics.batch_processing_time_ms?.values?.["p(99)"] || 0,
      max: data.metrics.batch_processing_time_ms?.values?.max || 0,
    },
    httpReqDuration: {
      avg: data.metrics.http_req_duration?.values?.avg || 0,
      p95: data.metrics.http_req_duration?.values?.["p(95)"] || 0,
      p99: data.metrics.http_req_duration?.values?.["p(99)"] || 0,
    },
    redisMemoryPeak: data.metrics.redis_memory_mb?.values?.max || 0,
    queueBacklogPeak: data.metrics.queue_backlog_estimate?.values?.max || 0,
    dbInsertionLatency: {
      avg: data.metrics.db_insertion_latency_ms?.values?.avg || 0,
      p95: data.metrics.db_insertion_latency_ms?.values?.["p(95)"] || 0,
    },
  };
  
  console.log("\n=== Ingestion Spike Test Summary ===");
  console.log(`Test Duration: ${summary.testDuration.toFixed(2)}s`);
  console.log(`Total Transactions: ${summary.totalTransactions}`);
  console.log(`Success Rate: ${summary.successRate.toFixed(2)}%`);
  console.log(`Error Rate: ${summary.errorRate.toFixed(3)}%`);
  console.log(`Failed Batches: ${summary.failedBatches}`);
  console.log(`\nBatch Processing Time:`);
  console.log(`  avg: ${summary.batchProcessing.avg.toFixed(2)}ms`);
  console.log(`  p95: ${summary.batchProcessing.p95.toFixed(2)}ms`);
  console.log(`  p99: ${summary.batchProcessing.p99.toFixed(2)}ms`);
  console.log(`  max: ${summary.batchProcessing.max.toFixed(2)}ms`);
  console.log(`\nHTTP Request Duration:`);
  console.log(`  avg: ${summary.httpReqDuration.avg.toFixed(2)}ms`);
  console.log(`  p95: ${summary.httpReqDuration.p95.toFixed(2)}ms`);
  console.log(`  p99: ${summary.httpReqDuration.p99.toFixed(2)}ms`);
  
  if (summary.redisMemoryPeak > 0) {
    console.log(`\nRedis Memory Peak: ${summary.redisMemoryPeak.toFixed(2)}MB`);
  }
  
  if (summary.queueBacklogPeak > 0) {
    console.log(`Queue Backlog Peak: ${summary.queueBacklogPeak}`);
  }
  
  if (summary.dbInsertionLatency.avg > 0) {
    console.log(`\nDB Insertion Latency:`);
    console.log(`  avg: ${summary.dbInsertionLatency.avg.toFixed(2)}ms`);
    console.log(`  p95: ${summary.dbInsertionLatency.p95.toFixed(2)}ms`);
  }
  
  const passed = summary.errorRate < 0.1;
  console.log(`\n${passed ? "✓ TEST PASSED" : "✗ TEST FAILED"}`);
  
  return {
    "stdout": "",
    "load-tests/results/ingestion-spike-summary.json": JSON.stringify(summary, null, 2),
  };
}
