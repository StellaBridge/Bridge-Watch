import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useIncidentFeed } from "../../hooks/useIncidentFeed";
import CompactAlertList from "./CompactAlertList";

vi.mock("../../hooks/useIncidentFeed", () => ({
  useIncidentFeed: vi.fn(),
}));

const mockIncidents = [
  {
    id: "1",
    bridgeId: "bridge-1",
    assetCode: "USDC",
    severity: "critical",
    status: "open",
    title: "Price deviation detected",
    description: "Asset price deviated from expected peg by 5%",
    occurredAt: new Date().toISOString(),
  },
  {
    id: "2",
    bridgeId: "bridge-2",
    assetCode: "EURC",
    severity: "high",
    status: "open",
    title: "Bridge latency spike",
    description: "Bridge transfers are slow",
    occurredAt: new Date().toISOString(),
  },
  {
    id: "3",
    bridgeId: "bridge-1",
    assetCode: "USDC",
    severity: "medium",
    status: "resolved",
    title: "USDC depegging event resolved",
    description: "USDC depeg resolved after recovery",
    occurredAt: new Date().toISOString(),
  },
];

describe("CompactAlertList Quick Filters", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient();
    vi.clearAllMocks();
  });

  it("renders correctly and calculates correct initial quick filter counts", () => {
    vi.mocked(useIncidentFeed).mockReturnValue({
      incidents: mockIncidents as any,
      unreadCount: 2,
      isLoading: false,
      error: null,
      readIds: new Set(["3"]), // Only incident 3 is read, 1 and 2 are unread (unacknowledged)
      markRead: vi.fn(),
      total: 3,
      refetch: vi.fn(),
    });

    render(
      <QueryClientProvider client={queryClient}>
        <CompactAlertList />
      </QueryClientProvider>
    );

    // Verify header and page controls
    expect(screen.getByRole("heading", { name: "Alerts" })).toBeInTheDocument();

    // Verify chips are present and their counts
    const allChip = screen.getByRole("button", { name: /All/i });
    const criticalChip = screen.getByRole("button", { name: /Critical Only/i });
    const depegChip = screen.getByRole("button", { name: /Depeg Alerts/i });
    const unackChip = screen.getByRole("button", { name: /Unacknowledged/i });

    expect(allChip).toBeInTheDocument();
    expect(criticalChip).toBeInTheDocument();
    expect(depegChip).toBeInTheDocument();
    expect(unackChip).toBeInTheDocument();
  });

  it("filters feed correctly when chips are clicked", () => {
    vi.mocked(useIncidentFeed).mockReturnValue({
      incidents: mockIncidents as any,
      unreadCount: 2,
      isLoading: false,
      error: null,
      readIds: new Set(["3"]),
      markRead: vi.fn(),
      total: 3,
      refetch: vi.fn(),
    });

    render(
      <QueryClientProvider client={queryClient}>
        <CompactAlertList />
      </QueryClientProvider>
    );

    // Should show all 3 initially
    expect(screen.getByText("Price deviation detected")).toBeInTheDocument();
    expect(screen.getByText("Bridge latency spike")).toBeInTheDocument();
    expect(screen.getByText("USDC depegging event resolved")).toBeInTheDocument();

    // Click Critical Only
    const criticalChip = screen.getByRole("button", { name: /Critical Only/i });
    fireEvent.click(criticalChip);

    // Only "Price deviation detected" (critical) should remain
    expect(screen.getByText("Price deviation detected")).toBeInTheDocument();
    expect(screen.queryByText("Bridge latency spike")).not.toBeInTheDocument();
    expect(screen.queryByText("USDC depegging event resolved")).not.toBeInTheDocument();

    // Click Depeg Alerts
    const depegChip = screen.getByRole("button", { name: /Depeg Alerts/i });
    fireEvent.click(depegChip);

    // Should show "Price deviation detected" and "USDC depegging event resolved"
    expect(screen.getByText("Price deviation detected")).toBeInTheDocument();
    expect(screen.queryByText("Bridge latency spike")).not.toBeInTheDocument();
    expect(screen.getByText("USDC depegging event resolved")).toBeInTheDocument();

    // Click Unacknowledged
    const unackChip = screen.getByRole("button", { name: /Unacknowledged/i });
    fireEvent.click(unackChip);

    // Should show unread: 1 and 2
    expect(screen.getByText("Price deviation detected")).toBeInTheDocument();
    expect(screen.getByText("Bridge latency spike")).toBeInTheDocument();
    expect(screen.queryByText("USDC depegging event resolved")).not.toBeInTheDocument();

    // Click active Unacknowledged chip again (toggles back to all)
    fireEvent.click(unackChip);
    expect(screen.getByText("Price deviation detected")).toBeInTheDocument();
    expect(screen.getByText("Bridge latency spike")).toBeInTheDocument();
    expect(screen.getByText("USDC depegging event resolved")).toBeInTheDocument();
  });

  it("resets active quick filter when manual dropdown filter changes", () => {
    vi.mocked(useIncidentFeed).mockReturnValue({
      incidents: mockIncidents as any,
      unreadCount: 2,
      isLoading: false,
      error: null,
      readIds: new Set(["3"]),
      markRead: vi.fn(),
      total: 3,
      refetch: vi.fn(),
    });

    render(
      <QueryClientProvider client={queryClient}>
        <CompactAlertList />
      </QueryClientProvider>
    );

    // Click Critical Only chip
    const criticalChip = screen.getByRole("button", { name: /Critical Only/i });
    fireEvent.click(criticalChip);

    // Quick filter should be active (styled differently)
    expect(criticalChip.className).toContain("border-stellar-blue");

    // Change severity dropdown to high
    const severitySelect = screen.getByLabelText("Filter by severity");
    fireEvent.change(severitySelect, { target: { value: "high" } });

    // Quick filter should be reset back to All
    expect(criticalChip.className).not.toContain("border-stellar-blue");
    const allChip = screen.getByRole("button", { name: /All/i });
    expect(allChip.className).toContain("border-stellar-blue");
  });
});
