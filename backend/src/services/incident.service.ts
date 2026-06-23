import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";

export interface Incident {
  id: string;
  time: Date;
  entity_type: string;
  entity_id: string;
  asset_symbol: string;
  severity: string;
  title: string;
  description: string;
  created_at: Date;
  updated_at: Date;
}

export interface HeatmapBucket {
  date: string;
  hour: number;
  count: number;
  bySeverity: Record<string, number>;
  incidents: Incident[];
}

export interface HeatmapData {
  buckets: HeatmapBucket[];
  totalIncidents: number;
  dateRange: { start: string; end: string };
  assets: string[];
}

export class IncidentService {
  private db = getDatabase();

  async getIncidents(params: {
    startDate?: string;
    endDate?: string;
    assetSymbol?: string;
    severity?: string;
    limit?: number;
  }): Promise<Incident[]> {
    const query = this.db("incidents").orderBy("time", "desc");

    if (params.startDate) {
      query.where("time", ">=", params.startDate);
    }
    if (params.endDate) {
      query.where("time", "<=", params.endDate);
    }
    if (params.assetSymbol) {
      query.where("asset_symbol", params.assetSymbol);
    }
    if (params.severity) {
      query.where("severity", params.severity);
    }
    if (params.limit) {
      query.limit(params.limit);
    }

    return query;
  }

  async getHeatmapData(params: {
    startDate?: string;
    endDate?: string;
    assetSymbol?: string;
  }): Promise<HeatmapData> {
    const now = new Date();
    const defaultStart = new Date(now);
    defaultStart.setDate(defaultStart.getDate() - 30);

    const startDate = params.startDate ?? defaultStart.toISOString();
    const endDate = params.endDate ?? now.toISOString();

    const incidents = await this.getIncidents({
      startDate,
      endDate,
      assetSymbol: params.assetSymbol,
    });

    const bucketMap = new Map<string, HeatmapBucket>();
    const assets = new Set<string>();

    for (const incident of incidents) {
      const date = new Date(incident.time);
      const dateKey = date.toISOString().split("T")[0]!;
      const hour = date.getHours();
      const key = `${dateKey}T${String(hour).padStart(2, "0")}`;

      assets.add(incident.asset_symbol);

      if (!bucketMap.has(key)) {
        bucketMap.set(key, {
          date: dateKey,
          hour,
          count: 0,
          bySeverity: {},
          incidents: [],
        });
      }

      const bucket = bucketMap.get(key)!;
      bucket.count++;
      bucket.bySeverity[incident.severity] =
        (bucket.bySeverity[incident.severity] ?? 0) + 1;
      bucket.incidents.push(incident);
    }

    const buckets = Array.from(bucketMap.values()).sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.hour - b.hour;
    });

    return {
      buckets,
      totalIncidents: incidents.length,
      dateRange: { start: startDate, end: endDate },
      assets: Array.from(assets).sort(),
    };
  }
}
