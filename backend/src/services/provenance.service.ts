import type { LatencyBreakdown, TemporalPoint } from "../temporal/types.js";

export type ProvenanceNodeKind = "source" | "transform" | "destination";
export type ProvenanceFreshness = "fresh" | "stale" | "unknown";

export interface ProvenanceNode {
  id: string;
  label: string;
  kind: ProvenanceNodeKind;
  timestamp: string;
  freshness: ProvenanceFreshness;
  entityType: string;
  entityId: string;
  description: string;
  metadata: Record<string, string | number | boolean>;
  /** Temporal point with clock provenance (if available) */
  temporal?: TemporalPoint;
}

export interface ProvenanceEdge {
  from: string;
  to: string;
  transformKind: string;
  latencyMs: number | null;
  /** Detailed latency breakdown distinguishing network delay from clock skew */
  latencyBreakdown?: LatencyBreakdown;
  /** Confidence in the latency measurement (0-1) */
  latencyConfidence?: number;
}

export interface ProvenanceGraph {
  metric: string;
  asset: string | null;
  bridge: string | null;
  generatedAt: string;
  nodes: ProvenanceNode[];
  edges: ProvenanceEdge[];
}

export interface ProvenanceListItem {
  metric: string;
  asset: string | null;
  bridge: string | null;
  lastUpdated: string;
  nodeCount: number;
}

function freshTimestamp(offsetMinutes: number): string {
  return new Date(Date.now() - offsetMinutes * 60_000).toISOString();
}

function freshness(offsetMinutes: number): ProvenanceFreshness {
  if (offsetMinutes < 5) return "fresh";
  if (offsetMinutes < 30) return "stale";
  return "unknown";
}

const METRIC_GRAPHS: Record<string, () => ProvenanceGraph> = {
  "price:USDC": () => {
    const now = freshTimestamp(0);
    return {
      metric: "price",
      asset: "USDC",
      bridge: null,
      generatedAt: now,
      nodes: [
        {
          id: "coinbase-feed",
          label: "Coinbase Price Feed",
          kind: "source",
          timestamp: freshTimestamp(2),
          freshness: freshness(2),
          entityType: "oracle",
          entityId: "coinbase",
          description: "Raw spot price pulled from Coinbase REST API",
          metadata: { url: "https://api.coinbase.com/v2/prices/USDC-USD/spot", rateLimit: 300 },
        },
        {
          id: "binance-feed",
          label: "Binance Price Feed",
          kind: "source",
          timestamp: freshTimestamp(1),
          freshness: freshness(1),
          entityType: "oracle",
          entityId: "binance",
          description: "Raw spot price pulled from Binance REST API",
          metadata: { url: "https://api.binance.com/api/v3/ticker/price", rateLimit: 1200 },
        },
        {
          id: "price-aggregator",
          label: "Price Aggregator",
          kind: "transform",
          timestamp: freshTimestamp(1),
          freshness: freshness(1),
          entityType: "service",
          entityId: "externalPriceAggregator",
          description: "Median aggregation across oracle feeds with outlier rejection",
          metadata: { strategy: "median", minSources: 2 },
        },
        {
          id: "price-store",
          label: "USDC Price Store",
          kind: "destination",
          timestamp: freshTimestamp(1),
          freshness: freshness(1),
          entityType: "metric",
          entityId: "price:USDC",
          description: "Persisted price record served by /api/v1/assets/USDC/price",
          metadata: { table: "asset_prices", ttlSeconds: 60 },
        },
      ],
      edges: [
        { from: "coinbase-feed", to: "price-aggregator", transformKind: "fetch", latencyMs: 120 },
        { from: "binance-feed", to: "price-aggregator", transformKind: "fetch", latencyMs: 95 },
        { from: "price-aggregator", to: "price-store", transformKind: "aggregate", latencyMs: 8 },
      ],
    };
  },
  "health:USDC": () => ({
    metric: "health",
    asset: "USDC",
    bridge: null,
    generatedAt: freshTimestamp(0),
    nodes: [
      {
        id: "price-score",
        label: "Price Stability Score",
        kind: "source",
        timestamp: freshTimestamp(1),
        freshness: freshness(1),
        entityType: "metric",
        entityId: "price:USDC",
        description: "Derived deviation metric from aggregated price sources",
        metadata: { weight: 0.3 },
      },
      {
        id: "liquidity-score",
        label: "Liquidity Depth Score",
        kind: "source",
        timestamp: freshTimestamp(3),
        freshness: freshness(3),
        entityType: "metric",
        entityId: "liquidity:USDC",
        description: "On-chain pool depth across Stellar DEX venues",
        metadata: { weight: 0.25 },
      },
      {
        id: "bridge-uptime-score",
        label: "Bridge Uptime Score",
        kind: "source",
        timestamp: freshTimestamp(0),
        freshness: freshness(0),
        entityType: "metric",
        entityId: "uptime:Allbridge",
        description: "30-day rolling uptime sampled every minute",
        metadata: { weight: 0.25 },
      },
      {
        id: "reserve-score",
        label: "Reserve Backing Score",
        kind: "source",
        timestamp: freshTimestamp(5),
        freshness: freshness(5),
        entityType: "metric",
        entityId: "reserve:USDC",
        description: "Verified reserve ratio from on-chain attestations",
        metadata: { weight: 0.2 },
      },
      {
        id: "health-calculator",
        label: "Health Score Calculator",
        kind: "transform",
        timestamp: freshTimestamp(1),
        freshness: freshness(1),
        entityType: "service",
        entityId: "health.service",
        description: "Weighted score computation with trend smoothing",
        metadata: { smoothingWindow: "5m", version: 2 },
      },
      {
        id: "health-store",
        label: "USDC Health Record",
        kind: "destination",
        timestamp: freshTimestamp(1),
        freshness: freshness(1),
        entityType: "metric",
        entityId: "health:USDC",
        description: "Persisted health record served by /api/v1/assets/USDC/health",
        metadata: { table: "asset_health_scores", cacheTtl: 30 },
      },
    ],
    edges: [
      { from: "price-score", to: "health-calculator", transformKind: "normalize", latencyMs: 3 },
      { from: "liquidity-score", to: "health-calculator", transformKind: "normalize", latencyMs: 5 },
      { from: "bridge-uptime-score", to: "health-calculator", transformKind: "normalize", latencyMs: 2 },
      { from: "reserve-score", to: "health-calculator", transformKind: "normalize", latencyMs: 4 },
      { from: "health-calculator", to: "health-store", transformKind: "aggregate", latencyMs: 10 },
    ],
  }),
  "tvl:Allbridge": () => ({
    metric: "tvl",
    asset: null,
    bridge: "Allbridge",
    generatedAt: freshTimestamp(0),
    nodes: [
      {
        id: "ethereum-rpc-source",
        label: "Ethereum RPC",
        kind: "source",
        timestamp: freshTimestamp(2),
        freshness: freshness(2),
        entityType: "rpc",
        entityId: "ethereum",
        description: "On-chain balance queries to Allbridge escrow contracts",
        metadata: { chain: "ethereum", blockConfirmations: 12 },
      },
      {
        id: "stellar-rpc-source",
        label: "Stellar RPC",
        kind: "source",
        timestamp: freshTimestamp(1),
        freshness: freshness(1),
        entityType: "rpc",
        entityId: "stellar",
        description: "Trustline and claimable balance queries on Stellar",
        metadata: { chain: "stellar", horizon: "https://horizon.stellar.org" },
      },
      {
        id: "tvl-normalizer",
        label: "TVL Normalizer",
        kind: "transform",
        timestamp: freshTimestamp(2),
        freshness: freshness(2),
        entityType: "service",
        entityId: "balance.service",
        description: "Converts raw chain balances to USD-denominated TVL using latest prices",
        metadata: { priceFeed: "price:USDC" },
      },
      {
        id: "mismatch-detector",
        label: "Mismatch Detector",
        kind: "transform",
        timestamp: freshTimestamp(2),
        freshness: freshness(2),
        entityType: "service",
        entityId: "reconciliation.service",
        description: "Cross-chain supply reconciliation and deviation flagging",
        metadata: { threshold: 0.005 },
      },
      {
        id: "bridge-tvl-store",
        label: "Allbridge TVL Record",
        kind: "destination",
        timestamp: freshTimestamp(2),
        freshness: freshness(2),
        entityType: "metric",
        entityId: "tvl:Allbridge",
        description: "Persisted bridge TVL served by /api/v1/bridges",
        metadata: { table: "bridge_stats", refreshInterval: "60s" },
      },
    ],
    edges: [
      { from: "ethereum-rpc-source", to: "tvl-normalizer", transformKind: "fetch", latencyMs: 340 },
      { from: "stellar-rpc-source", to: "tvl-normalizer", transformKind: "fetch", latencyMs: 210 },
      { from: "tvl-normalizer", to: "mismatch-detector", transformKind: "normalize", latencyMs: 15 },
      { from: "mismatch-detector", to: "bridge-tvl-store", transformKind: "reconcile", latencyMs: 6 },
    ],
  }),
  "alerts:EURC": () => ({
    metric: "alerts",
    asset: "EURC",
    bridge: null,
    generatedAt: freshTimestamp(0),
    nodes: [
      {
        id: "health-trigger",
        label: "Health Score Trigger",
        kind: "source",
        timestamp: freshTimestamp(0),
        freshness: freshness(0),
        entityType: "metric",
        entityId: "health:EURC",
        description: "Threshold crossing in EURC health score",
        metadata: { threshold: 60, direction: "below" },
      },
      {
        id: "rule-evaluator",
        label: "Alert Rule Evaluator",
        kind: "transform",
        timestamp: freshTimestamp(0),
        freshness: freshness(0),
        entityType: "service",
        entityId: "ruleEvaluator.service",
        description: "Evaluates configured alert rules against incoming metric events",
        metadata: { rulesChecked: 14 },
      },
      {
        id: "dedup-service",
        label: "Deduplication Service",
        kind: "transform",
        timestamp: freshTimestamp(0),
        freshness: freshness(0),
        entityType: "service",
        entityId: "alertDeduplication.service",
        description: "Suppresses duplicate alerts within cooldown window",
        metadata: { cooldownSeconds: 300 },
      },
      {
        id: "alert-queue-node",
        label: "Alert Queue",
        kind: "transform",
        timestamp: freshTimestamp(0),
        freshness: freshness(0),
        entityType: "queue",
        entityId: "alert-queue",
        description: "Durable outbox queue for notification delivery",
        metadata: { backend: "pg-outbox" },
      },
      {
        id: "notification-dest",
        label: "Notification Service",
        kind: "destination",
        timestamp: freshTimestamp(0),
        freshness: freshness(0),
        entityType: "service",
        entityId: "notification-service",
        description: "Sends email, webhook, and in-app notifications to operators",
        metadata: { channels: "email,webhook,in_app" },
      },
    ],
    edges: [
      { from: "health-trigger", to: "rule-evaluator", transformKind: "evaluate", latencyMs: 12 },
      { from: "rule-evaluator", to: "dedup-service", transformKind: "filter", latencyMs: 4 },
      { from: "dedup-service", to: "alert-queue-node", transformKind: "enqueue", latencyMs: 2 },
      { from: "alert-queue-node", to: "notification-dest", transformKind: "dispatch", latencyMs: 180 },
    ],
  }),
};

const METRIC_LIST: ProvenanceListItem[] = [
  { metric: "price", asset: "USDC", bridge: null, lastUpdated: freshTimestamp(1), nodeCount: 4 },
  { metric: "health", asset: "USDC", bridge: null, lastUpdated: freshTimestamp(1), nodeCount: 6 },
  { metric: "tvl", asset: null, bridge: "Allbridge", lastUpdated: freshTimestamp(2), nodeCount: 5 },
  { metric: "alerts", asset: "EURC", bridge: null, lastUpdated: freshTimestamp(0), nodeCount: 5 },
];

export class ProvenanceService {
  listMetrics(filters?: {
    asset?: string;
    bridge?: string;
    metric?: string;
  }): ProvenanceListItem[] {
    return METRIC_LIST.filter((item) => {
      if (filters?.asset && item.asset !== filters.asset) return false;
      if (filters?.bridge && item.bridge !== filters.bridge) return false;
      if (filters?.metric && item.metric !== filters.metric) return false;
      return true;
    });
  }

  getLineage(metric: string, asset?: string, bridge?: string): ProvenanceGraph | null {
    const key = asset ? `${metric}:${asset}` : bridge ? `${metric}:${bridge}` : metric;
    const factory = METRIC_GRAPHS[key];
    if (!factory) return null;
    return factory();
  }
}

export const provenanceService = new ProvenanceService();
