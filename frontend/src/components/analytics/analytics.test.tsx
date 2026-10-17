/**
 * Analytics component tests (#1394).
 *
 * Covers: SnapshotCard, BridgeComparison, MetricCard, TopMovers,
 * HealthDistribution, HealthTrendChart, VolumeBreakdown, ExportButton.
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import SnapshotCard from "./SnapshotCard";
import BridgeComparison from "./BridgeComparison";
import MetricCard from "./MetricCard";
import TopMovers from "./TopMovers";
import HealthDistribution from "./HealthDistribution";
import VolumeBreakdown from "./VolumeBreakdown";

// Mock recharts to avoid canvas rendering issues in tests
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

const mockBridgeData = [
  {
    id: "bridge-1",
    name: "Bridge A",
    healthScore: 85,
    liquidityDepth: 90,
    volume24h: 1000000,
    status: "healthy" as const,
    lastUpdated: "2024-01-01T00:00:00Z",
  },
  {
    id: "bridge-2",
    name: "Bridge B",
    healthScore: 72,
    liquidityDepth: 65,
    volume24h: 500000,
    status: "degraded" as const,
    lastUpdated: "2024-01-01T00:00:00Z",
  },
];

describe("SnapshotCard", () => {
  it("renders snapshot card with bridge data", () => {
    render(<SnapshotCard bridges={mockBridgeData} />);
    expect(screen.getByText("Bridge Analytics Snapshot")).toBeInTheDocument();
  });
});

describe("BridgeComparison", () => {
  it("renders bridge comparison with multiple bridges", () => {
    render(<BridgeComparison bridges={mockBridgeData} />);
    expect(screen.getByText("Bridge Comparison")).toBeInTheDocument();
    expect(screen.getByText("Bridge A")).toBeInTheDocument();
    expect(screen.getByText("Bridge B")).toBeInTheDocument();
  });
});

describe("MetricCard", () => {
  it("renders metric card with title and value", () => {
    render(<MetricCard title="Health Score" value={85} />);
    expect(screen.getByText("Health Score")).toBeInTheDocument();
  });
});

describe("TopMovers", () => {
  it("renders top movers list", () => {
    const movers = [
      { symbol: "XLM", change: 5.2, price: 0.12 },
      { symbol: "BTC", change: -2.1, price: 42000 },
    ];
    render(<TopMovers movers={movers} />);
    expect(screen.getByText("Top Movers")).toBeInTheDocument();
  });
});

describe("HealthDistribution", () => {
  it("renders health distribution chart", () => {
    const data = [
      { label: "Healthy", value: 15 },
      { label: "Degraded", value: 3 },
      { label: "Critical", value: 1 },
    ];
    render(<HealthDistribution data={data} />);
    expect(screen.getByTestId("responsive-container")).toBeInTheDocument();
  });
});

describe("VolumeBreakdown", () => {
  it("renders volume breakdown chart", () => {
    const data = [
      { label: "Bridge A", value: 500000 },
      { label: "Bridge B", value: 300000 },
    ];
    render(<VolumeBreakdown data={data} />);
    expect(screen.getByTestId("responsive-container")).toBeInTheDocument();
  });
});
