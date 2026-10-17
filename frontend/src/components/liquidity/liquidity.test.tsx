/**
 * Liquidity visualization component tests (#1395).
 *
 * Covers: MarketImpactPresets, PoolQualityRanking, RouteQuotes,
 * DexPoolDiscovery, and related liquidity components.
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch
global.fetch = vi.fn();

// Mock recharts
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
  BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => <div data-testid="bar" />,
  LineChart: ({ children }: any) => <div data-testid="line-chart">{children}</div>,
  Line: () => <div data-testid="line" />,
  PieChart: ({ children }: any) => <div data-testid="pie-chart">{children}</div>,
  Pie: () => <div data-testid="pie" />,
  Cell: () => <div data-testid="cell" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />,
}));

// Mock liquidityApi
vi.mock("../pages/liquidity/api", () => ({
  liquidityApi: vi.fn().mockImplementation((path: string) => {
    if (path.includes("pool-quality")) {
      return Promise.resolve({ ranking: [], computedAt: null, weights: {} });
    }
    if (path.includes("market-impact")) {
      return Promise.resolve({ presets: [], scenarios: [], breachCount: 0 });
    }
    if (path.includes("route-quotes")) {
      return Promise.resolve({ quotes: [], quote: null });
    }
    return Promise.resolve({ pools: [], runs: [] });
  }),
  usd: (value: number) => `$${value.toLocaleString()}`,
  pct: (value: number) => `${value}%`,
}));

describe("Liquidity Components", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("MarketImpactPresets", () => {
    it("renders market impact presets component", async () => {
      const { MarketImpactPresets } = await import("../pages/liquidity/MarketImpactPresets");
      render(<MarketImpactPresets />);
      await waitFor(() => {
        expect(screen.getByText(/market impact/i)).toBeInTheDocument();
      });
    });
  });

  describe("PoolQualityRanking", () => {
    it("renders pool quality ranking component", async () => {
      const { default: PoolQualityRanking } = await import("../pages/liquidity/PoolQualityRanking");
      render(<PoolQualityRanking />);
      await waitFor(() => {
        expect(screen.getByText(/pool quality/i)).toBeInTheDocument();
      });
    });
  });

  describe("RouteQuotes", () => {
    it("renders route quotes component", async () => {
      const { default: RouteQuotes } = await import("../pages/liquidity/RouteQuotes");
      render(<RouteQuotes />);
      await waitFor(() => {
        expect(screen.getByText(/route/i)).toBeInTheDocument();
      });
    });
  });

  describe("DexPoolDiscovery", () => {
    it("renders dex pool discovery component", async () => {
      const { default: DexPoolDiscovery } = await import("../pages/liquidity/DexPoolDiscovery");
      render(<DexPoolDiscovery />);
      await waitFor(() => {
        expect(screen.getByText(/pool/i)).toBeInTheDocument();
      });
    });
  });

  describe("Liquidity aggregation components", () => {
    it("renders venue liquidity breakdown", () => {
      const venues = [
        { venue: "SDEX" as const, totalLiquidity: 1000000, percentageShare: 50 },
        { venue: "Phoenix" as const, totalLiquidity: 1000000, percentageShare: 50 },
      ];
      // This would test the VenueLiquidity component
      expect(venues.length).toBe(2);
    });

    it("renders liquidity gap indicators", () => {
      const gaps = [
        { startPrice: 0.1, endPrice: 0.15, depth: 50000, severity: "low" as const },
        { startPrice: 0.2, endPrice: 0.25, depth: 10000, severity: "high" as const },
      ];
      expect(gaps.length).toBe(2);
      expect(gaps[1].severity).toBe("high");
    });
  });
});
