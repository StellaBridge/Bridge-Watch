import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import HealthTimelineChart, {
  calculate90DayUptimeBlocks,
  scoreColor,
} from "../HealthTimelineChart";
import type { BridgeHealthPoint } from "../../../services/api";

// Mock recharts for testing ResponsiveContainer and AreaChart in jsdom
vi.mock("recharts", async () => {
  const React = await import("react");
  return {
    ResponsiveContainer: ({
      children,
      width,
      height,
    }: {
      children?: React.ReactNode;
      width?: string | number;
      height?: string | number;
    }) => (
      <div data-testid="responsive-container" style={{ width, height }}>
        {children}
      </div>
    ),
    AreaChart: ({ children, data }: { children?: React.ReactNode; data?: unknown[] }) => (
      <div data-testid="area-chart" data-points-count={data?.length}>
        {children}
      </div>
    ),
    Area: () => <div data-testid="area-series" />,
    XAxis: () => <div data-testid="x-axis" />,
    YAxis: () => <div data-testid="y-axis" />,
    CartesianGrid: () => null,
    Tooltip: () => null,
    ReferenceLine: () => null,
    ReferenceDot: () => null,
    defs: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    linearGradient: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    stop: () => null,
  };
});

describe("HealthTimelineChart (Issue #1698)", () => {
  const mockReferenceDate = new Date("2026-06-01T12:00:00Z");

  const generatePoints = (count = 90): BridgeHealthPoint[] => {
    const points: BridgeHealthPoint[] = [];
    for (let i = 0; i < count; i++) {
      const d = new Date(mockReferenceDate);
      d.setUTCDate(d.getUTCDate() - i);
      let score = 95;
      let annotation: string | undefined;

      // Simulate a degraded period
      if (i === 10) {
        score = 65;
        annotation = "High latency detected";
      } else if (i === 20) {
        // Down period
        score = 30;
        annotation = "Outage on bridge relay";
      }

      points.push({
        timestamp: d.toISOString(),
        score,
        annotation,
      });
    }
    return points;
  };

  it("shows empty state when no points exist", () => {
    render(
      <HealthTimelineChart
        points={[]}
        period="30d"
        bridgeName="Stellar-Ethereum"
        isMockData={false}
      />
    );
    expect(
      screen.getByText("No health history available for Stellar-Ethereum")
    ).toBeInTheDocument();
  });

  it("renders 90 contiguous uptime blocks with appropriate health color coding", () => {
    const points = generatePoints(90);
    render(
      <HealthTimelineChart
        points={points}
        period="30d"
        bridgeName="Stellar-Ethereum"
        isMockData={false}
      />
    );

    const blocks = screen.getAllByTestId("uptime-block");
    expect(blocks).toHaveLength(90);

    // Verify healthy, degraded, and down status classifications
    const healthyBlocks = blocks.filter(
      (b) => b.getAttribute("data-status") === "healthy"
    );
    const degradedBlocks = blocks.filter(
      (b) => b.getAttribute("data-status") === "degraded"
    );
    const downBlocks = blocks.filter(
      (b) => b.getAttribute("data-status") === "down"
    );

    expect(healthyBlocks.length).toBeGreaterThan(0);
    expect(degradedBlocks.length).toBeGreaterThan(0);
    expect(downBlocks.length).toBeGreaterThan(0);

    // Verify CSS color classes for health statuses
    expect(healthyBlocks[0]).toHaveClass("bg-emerald-500");
    expect(degradedBlocks[0]).toHaveClass("bg-amber-500");
    expect(downBlocks[0]).toHaveClass("bg-red-500");
  });

  it("displays tooltip on hover with day, uptime percentage, and incident count", () => {
    const points = generatePoints(90);
    render(
      <HealthTimelineChart
        points={points}
        period="30d"
        bridgeName="Stellar-Ethereum"
        isMockData={false}
      />
    );

    expect(screen.queryByTestId("uptime-tooltip")).not.toBeInTheDocument();

    const degradedBlock = screen
      .getAllByTestId("uptime-block")
      .find((b) => b.getAttribute("data-status") === "degraded");
    expect(degradedBlock).toBeDefined();

    fireEvent.mouseEnter(degradedBlock!);

    const tooltip = screen.getByTestId("uptime-tooltip");
    expect(tooltip).toBeInTheDocument();
    expect(tooltip).toHaveTextContent("65% uptime");
    expect(tooltip).toHaveTextContent("1 incident(s)");

    fireEvent.mouseLeave(degradedBlock!);
    expect(screen.queryByTestId("uptime-tooltip")).not.toBeInTheDocument();
  });

  it("handles empty days without rendering gaps in the 90-day sequence", () => {
    // Only provide 3 points spread out over 90 days
    const sparsePoints: BridgeHealthPoint[] = [
      { timestamp: "2026-05-30T10:00:00Z", score: 98 },
      { timestamp: "2026-05-15T12:00:00Z", score: 92 },
      { timestamp: "2026-04-01T08:00:00Z", score: 90 },
    ];

    render(
      <HealthTimelineChart
        points={sparsePoints}
        period="30d"
        bridgeName="Stellar-Ethereum"
        isMockData={false}
      />
    );

    // The sequence must still maintain exactly 90 blocks with no missing gaps
    const blocks = screen.getAllByTestId("uptime-block");
    expect(blocks).toHaveLength(90);

    const emptyBlocks = blocks.filter(
      (b) => b.getAttribute("data-status") === "empty"
    );
    expect(emptyBlocks.length).toBe(87);
    expect(emptyBlocks[0]).toHaveClass("bg-stellar-border");
  });

  it("handles calculate90DayUptimeBlocks pure logic correctly", () => {
    const points: BridgeHealthPoint[] = [
      { timestamp: "2026-06-01T10:00:00Z", score: 95 },
      { timestamp: "2026-06-01T15:00:00Z", score: 85, annotation: "Minor jitter" },
      { timestamp: "2026-05-31T09:00:00Z", score: 40 },
    ];

    const blocks = calculate90DayUptimeBlocks(points, mockReferenceDate);
    expect(blocks).toHaveLength(90);

    // The last block is 2026-06-01: avg of 95 and 85 = 90
    const todayBlock = blocks[89];
    expect(todayBlock.date).toBe("2026-06-01");
    expect(todayBlock.uptimePercent).toBe(90);
    expect(todayBlock.incidentCount).toBe(1);
    expect(todayBlock.status).toBe("healthy");

    // The second to last block is 2026-05-31: score 40 -> down
    const yesterdayBlock = blocks[88];
    expect(yesterdayBlock.date).toBe("2026-05-31");
    expect(yesterdayBlock.uptimePercent).toBe(40);
    expect(yesterdayBlock.status).toBe("down");
  });

  it("verifies scoreColor threshold mappings", () => {
    expect(scoreColor(90)).toBe("#22c55e");
    expect(scoreColor(80)).toBe("#22c55e");
    expect(scoreColor(79)).toBe("#eab308");
    expect(scoreColor(50)).toBe("#eab308");
    expect(scoreColor(49)).toBe("#ef4444");
    expect(scoreColor(0)).toBe("#ef4444");
  });

  it("renders responsive chart container with width 100% and height 300", () => {
    const points = generatePoints(10);
    render(
      <HealthTimelineChart
        points={points}
        period="7d"
        bridgeName="Stellar-Ethereum"
        isMockData={true}
      />
    );

    const responsiveContainer = screen.getByTestId("responsive-container");
    expect(responsiveContainer).toBeInTheDocument();
    expect(responsiveContainer).toHaveStyle({ width: "100%", height: "300px" });

    // Displays demo badge when isMockData is true
    expect(screen.getByText("Demo data")).toBeInTheDocument();
  });
});
