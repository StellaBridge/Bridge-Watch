import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import BridgeHealthTimeline from "./BridgeHealthTimeline";

const mockPoints = [
  { timestamp: "2026-01-01T00:00:00.000Z", score: 92 },
  { timestamp: "2026-01-02T00:00:00.000Z", score: 88 },
  { timestamp: "2026-01-03T00:00:00.000Z", score: 95 },
];

vi.mock("../hooks/useBridgeHealthTimeline", () => ({
  useBridges: () => ({
    data: { bridges: [{ name: "StellarX Bridge" }, { name: "Allbridge Core" }] },
    isLoading: false,
  }),
  useBridgeHealthTimeline: () => ({
    points: mockPoints,
    isLoading: false,
    isMockData: false,
  }),
}));

vi.mock("../components/BridgeHealthTimeline", () => ({
  HealthTimelineChart: () => <div data-testid="health-timeline-chart" />,
  AnnotationList: () => <div data-testid="annotation-list" />,
}));

describe("BridgeHealthTimeline", () => {
  it("renders the page heading", () => {
    render(<BridgeHealthTimeline />);
    expect(screen.getByRole("heading", { name: /Bridge Health Timeline/i })).toBeInTheDocument();
  });

  it("lists available bridges in the selector", () => {
    render(<BridgeHealthTimeline />);
    expect(screen.getByRole("option", { name: "StellarX Bridge" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Allbridge Core" })).toBeInTheDocument();
  });

  it("shows summary stats derived from the timeline points", () => {
    render(<BridgeHealthTimeline />);
    expect(screen.getByText("Current Score")).toBeInTheDocument();
    expect(screen.getByText("Average Score")).toBeInTheDocument();
    expect(screen.getByText("Lowest")).toBeInTheDocument();
    expect(screen.getByText("Highest")).toBeInTheDocument();
  });

  it("switches the active period when a period button is clicked", () => {
    render(<BridgeHealthTimeline />);
    const monthButton = screen.getByRole("button", { name: "30 Days" });
    fireEvent.click(monthButton);
    expect(monthButton).toHaveAttribute("aria-pressed", "true");
  });

  it("renders the chart and annotation list once loaded", () => {
    render(<BridgeHealthTimeline />);
    expect(screen.getByTestId("health-timeline-chart")).toBeInTheDocument();
    expect(screen.getByTestId("annotation-list")).toBeInTheDocument();
  });
});
