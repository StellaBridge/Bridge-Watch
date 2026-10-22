import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useBridges } from "./useBridges";
import { getBridgeHealthHistory } from "../services/api";
import type { BridgeHealthPoint } from "../services/api";

export type HealthPeriod = "24h" | "7d" | "30d";

function seedRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function generateMockHistory(
  bridgeName: string,
  period: HealthPeriod
): BridgeHealthPoint[] {
  const hash = bridgeName
    .split("")
    .reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const rand = seedRandom(hash);

  const baseScore = 55 + Math.floor(rand() * 40);
  const now = Date.now();

  const configs: Record<HealthPeriod, { steps: number; stepMs: number }> = {
    "24h": { steps: 24, stepMs: 60 * 60 * 1000 },
    "7d": { steps: 42, stepMs: 4 * 60 * 60 * 1000 },
    "30d": { steps: 30, stepMs: 24 * 60 * 60 * 1000 },
  };

  const { steps, stepMs } = configs[period];
  const points: BridgeHealthPoint[] = [];
  let score = baseScore;

  for (let i = steps; i >= 0; i--) {
    const delta = (rand() - 0.48) * 8;
    score = Math.max(0, Math.min(100, score + delta));
    const timestamp = new Date(now - i * stepMs).toISOString();

    let annotation: string | undefined;
    if (i > 0 && i < steps) {
      const prev = points[points.length - 1]?.score ?? score;
      if (Math.abs(score - prev) >= 10) {
        annotation =
          score > prev
            ? "Health improved"
            : "Health degraded";
      }
    }

    points.push({ timestamp, score: Math.round(score), annotation });
  }

  return points;
}

export function useBridgeHealthTimeline(
  bridgeName: string,
  period: HealthPeriod = "7d"
) {
  const query = useQuery({
    queryKey: ["bridge-health-history", bridgeName, period],
    queryFn: () => getBridgeHealthHistory(bridgeName, period),
    enabled: !!bridgeName,
    retry: false,
  });

  const points = useMemo<BridgeHealthPoint[]>(() => {
    if (query.data) return query.data.points ?? [];
    if (bridgeName) return generateMockHistory(bridgeName, period);
    return [];
  }, [query.data, bridgeName, period]);

  return {
    ...query,
    points,
    isMockData: !query.data && bridgeName.length > 0,
  };
}

export { useBridges };
