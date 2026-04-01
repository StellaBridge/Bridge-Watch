import { logger } from './logger.js';

export interface MetricValue {
  name: string;
  value: number;
  unit: string;
  labels?: Record<string, string>;
  timestamp: number;
  help?: string;
  type?: 'counter' | 'gauge' | 'histogram' | 'summary';
}

export interface HistogramMetric extends MetricValue {
  type: 'histogram';
  buckets: {
    le: number;
    count: number;
  }[];
  sum: number;
  count: number;
}

class MetricsCollector {
  private static instance: MetricsCollector;
  private metrics: Map<string, MetricValue[]> = new Map();
  private customMetrics: Map<string, MetricValue> = new Map();
  private latencySamples: Map<string, number[]> = new Map();

  private constructor() {}

  static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }

  recordHttpRequest(
    method: string,
    path: string,
    statusCode: number,
    duration: number,
    _requestSize?: number,
    _responseSize?: number
  ): void {
    try {
      const key = `http_request_${method}_${path}`;
      const samples = this.latencySamples.get(key) || [];
      samples.push(duration);
      if (samples.length > 1000) samples.shift(); // Keep last 1000 samples
      this.latencySamples.set(key, samples);

      const metric: MetricValue = {
        name: 'http_request_duration_seconds',
        value: duration / 1000,
        unit: 'seconds',
        labels: { method, path, status: statusCode.toString() },
        timestamp: Date.now(),
        type: 'histogram',
      };

      const metrics = this.metrics.get('http_request_duration_seconds') || [];
      metrics.push(metric);
      this.metrics.set('http_request_duration_seconds', metrics);

      // Track request count
      const countKey = `http_requests_total_${method}_${path}`;
      const countMetric = this.customMetrics.get(countKey) || {
        name: 'http_requests_total',
        value: 0,
        unit: 'count',
        labels: { method, path },
        timestamp: Date.now(),
        type: 'counter',
      };
      countMetric.value++;
      this.customMetrics.set(countKey, countMetric);

      // Track error rate
      if (statusCode >= 400) {
        const errorKey = `http_errors_total_${statusCode}`;
        const errorMetric = this.customMetrics.get(errorKey) || {
          name: 'http_errors_total',
          value: 0,
          unit: 'count',
          labels: { status: statusCode.toString() },
          timestamp: Date.now(),
          type: 'counter',
        };
        errorMetric.value++;
        this.customMetrics.set(errorKey, errorMetric);
      }
    } catch (error) {
      logger.debug({ error }, 'Failed to record HTTP metric');
    }
  }

  recordDbQuery(
    operation: string,
    duration: number,
    success: boolean,
    _query?: string
  ): void {
    try {
      const key = `db_query_${operation}`;
      const samples = this.latencySamples.get(key) || [];
      samples.push(duration);
      if (samples.length > 1000) samples.shift();
      this.latencySamples.set(key, samples);

      const metric: MetricValue = {
        name: 'db_query_duration_seconds',
        value: duration / 1000,
        unit: 'seconds',
        labels: { operation, success: success.toString() },
        timestamp: Date.now(),
        type: 'histogram',
      };

      const metrics = this.metrics.get('db_query_duration_seconds') || [];
      metrics.push(metric);
      this.metrics.set('db_query_duration_seconds', metrics);

      // Track query count
      const countKey = `db_queries_total_${operation}`;
      const countMetric = this.customMetrics.get(countKey) || {
        name: 'db_queries_total',
        value: 0,
        unit: 'count',
        labels: { operation },
        timestamp: Date.now(),
        type: 'counter',
      };
      countMetric.value++;
      this.customMetrics.set(countKey, countMetric);
    } catch (error) {
      logger.debug({ error }, 'Failed to record database metric');
    }
  }

  recordQueueJob(
    jobName: string,
    duration: number,
    status: 'success' | 'failure' | 'retry'
  ): void {
    try {
      const key = `queue_job_${jobName}`;
      const samples = this.latencySamples.get(key) || [];
      samples.push(duration);
      if (samples.length > 1000) samples.shift();
      this.latencySamples.set(key, samples);

      const metric: MetricValue = {
        name: 'queue_job_duration_seconds',
        value: duration / 1000,
        unit: 'seconds',
        labels: { job: jobName, status },
        timestamp: Date.now(),
        type: 'histogram',
      };

      const metrics = this.metrics.get('queue_job_duration_seconds') || [];
      metrics.push(metric);
      this.metrics.set('queue_job_duration_seconds', metrics);

      // Track job count
      const countKey = `queue_jobs_total_${jobName}_${status}`;
      const countMetric = this.customMetrics.get(countKey) || {
        name: 'queue_jobs_total',
        value: 0,
        unit: 'count',
        labels: { job: jobName, status },
        timestamp: Date.now(),
        type: 'counter',
      };
      countMetric.value++;
      this.customMetrics.set(countKey, countMetric);
    } catch (error) {
      logger.debug({ error }, 'Failed to record queue metric');
    }
  }

  recordCustomMetric(
    name: string,
    value: number,
    unit: string,
    labels?: Record<string, string>
  ): void {
    try {
      const key = `${name}_${JSON.stringify(labels || {})}`;
      const metric: MetricValue = {
        name,
        value,
        unit,
        labels,
        timestamp: Date.now(),
        type: 'gauge',
      };
      this.customMetrics.set(key, metric);
    } catch (error) {
      logger.debug({ error }, 'Failed to record custom metric');
    }
  }

  recordBridgeVerification(
    symbol: string,
    status: 'success' | 'failure',
    duration: number
  ): void {
    this.recordCustomMetric(
      'bridge_verification_duration_seconds',
      duration / 1000,
      'seconds',
      { symbol, status }
    );
  }

  recordAlertTriggered(alertType: string, severity: string): void {
    const key = `alerts_triggered_total_${alertType}_${severity}`;
    const metric = this.customMetrics.get(key) || {
      name: 'alerts_triggered_total',
      value: 0,
      unit: 'count',
      labels: { type: alertType, severity },
      timestamp: Date.now(),
      type: 'counter',
    };
    metric.value++;
    this.customMetrics.set(key, metric);
  }

  recordApiKeyUsage(apiKeyId: string, tier: string): void {
    const key = `api_key_requests_total_${apiKeyId}`;
    const metric = this.customMetrics.get(key) || {
      name: 'api_key_requests_total',
      value: 0,
      unit: 'count',
      labels: { apiKeyId, tier },
      timestamp: Date.now(),
      type: 'counter',
    };
    metric.value++;
    this.customMetrics.set(key, metric);
  }

  recordRateLimitHit(apiKeyId: string, tier: string): void {
    const key = `rate_limit_hits_total_${apiKeyId}`;
    const metric = this.customMetrics.get(key) || {
      name: 'rate_limit_hits_total',
      value: 0,
      unit: 'count',
      labels: { apiKeyId, tier },
      timestamp: Date.now(),
      type: 'counter',
    };
    metric.value++;
    this.customMetrics.set(key, metric);
  }

  getPercentileLatency(endpoint: string, percentile: 50 | 95 | 99): number {
    const samples = this.latencySamples.get(endpoint) || [];
    if (samples.length === 0) return 0;

    const sorted = [...samples].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)] || 0;
  }

  getErrorRate(_timeWindow?: number): number {
    let errorCount = 0;
    let totalCount = 0;

    this.customMetrics.forEach((metric) => {
      if (metric.name === 'http_errors_total') {
        errorCount += metric.value;
      }
      if (metric.name === 'http_requests_total') {
        totalCount += metric.value;
      }
    });

    return totalCount === 0 ? 0 : (errorCount / totalCount) * 100;
  }

  getThroughput(_timeWindow?: number): number {
    let totalCount = 0;
    this.customMetrics.forEach((metric) => {
      if (metric.name === 'http_requests_total') {
        totalCount += metric.value;
      }
    });
    return totalCount;
  }

  async getMetrics(): Promise<string> {
    const allMetrics: Record<string, MetricValue[]> = {};

    this.metrics.forEach((values, _key) => {
      allMetrics[_key] = values;
    });

    this.customMetrics.forEach((metric, _key) => {
      if (!allMetrics[metric.name]) {
        allMetrics[metric.name] = [];
      }
      allMetrics[metric.name].push(metric);
    });

    return JSON.stringify(allMetrics, null, 2);
  }

  async getMetricsJSON(): Promise<Record<string, any>> {
    const allMetrics: Record<string, MetricValue[]> = {};

    this.metrics.forEach((values, _key) => {
      allMetrics[_key] = values;
    });

    this.customMetrics.forEach((metric, _key) => {
      if (!allMetrics[metric.name]) {
        allMetrics[metric.name] = [];
      }
      allMetrics[metric.name].push(metric);
    });

    return allMetrics;
  }

  reset(): void {
    this.metrics.clear();
    this.customMetrics.clear();
    this.latencySamples.clear();
  }
}

export function getMetricsService(): MetricsCollector {
  return MetricsCollector.getInstance();
}
