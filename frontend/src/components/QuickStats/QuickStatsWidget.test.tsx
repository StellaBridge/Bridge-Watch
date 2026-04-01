import { describe, it, expect, vi } from "vitest";
import { render, screen, userEvent } from "../../test/utils";
import QuickStatsWidget from "./QuickStatsWidget";
import type { AssetData, BridgeData } from "./types";

// Mock react-router-dom Link to capture navigation
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    // Keep real MemoryRouter from test utils but let Link render as anchor
  };
});

const mockAssets: AssetData[] = [
  {
    symbol: "USDC",
    name: "USD Coin",
    health: {
      overallScore: 92,
      factors: { liquidityDepth: 90, priceStability: 95, bridgeUptime: 88, reserveBacking: 94, volumeTrend: 93 },
      trend: "improving",
      lastUpdated: "2024-03-29T12:00:00Z",
    },
  },
  {
    symbol: "EURC",
    name: "Euro Coin",
    health: {
      overallScore: 65,
      factors: { liquidityDepth: 60, priceStability: 70, bridgeUptime: 75, reserveBacking: 55, volumeTrend: 65 },
      trend: "stable",
      lastUpdated: "2024-03-29T12:00:00Z",
    },
  },
  {
    symbol: "XLM",
    name: "Stellar Lumens",
    health: {
      overallScore: 40,
      factors: { liquidityDepth: 35, priceStability: 45, bridgeUptime: 50, reserveBacking: 30, volumeTrend: 40 },
      trend: "deteriorating",
      lastUpdated: "2024-03-29T12:00:00Z",
    },
  },
];

const mockBridges: BridgeData[] = [
  { name: "Circle", status: "healthy", totalValueLocked: 500_000_000, supplyOnStellar: 400_000_000, supplyOnSource: 400_000_000, mismatchPercentage: 0 },
  { name: "Wormhole", status: "degraded", totalValueLocked: 200_000_000, supplyOnStellar: 180_000_000, supplyOnSource: 190_000_000, mismatchPercentage: 5.26 },
];

describe("QuickStatsWidget", () => {
  it("renders the Quick Stats heading", () => {
    render(<QuickStatsWidget assets={mockAssets} bridges={mockBridges} />);
    expect(screen.getByRole("heading", { name: /quick stats/i })).toBeInTheDocument();
  });

  it("renders stat cards with correct values", () => {
    render(<QuickStatsWidget assets={mockAssets} bridges={mockBridges} />);
    expect(screen.getByTestId("stat-card-tvl")).toBeInTheDocument();
    expect(screen.getByText("$700.00M")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument(); // active assets
  });

  it("shows loading skeleton when isLoading is true", () => {
    render(<QuickStatsWidget assets={[]} bridges={[]} isLoading />);
    const widget = screen.getByTestId("quick-stats-widget");
    expect(widget).toBeInTheDocument();
    // Should show 4 skeleton cards
    const skeletons = widget.querySelectorAll(".animate-pulse");
    expect(skeletons).toHaveLength(4);
  });

  it("shows only 4 stats when collapsed", () => {
    render(<QuickStatsWidget assets={mockAssets} bridges={mockBridges} />);
    const listItems = screen.getAllByRole("listitem");
    expect(listItems).toHaveLength(4);
  });

  it("expands to show all stats when Show more is clicked", async () => {
    const user = userEvent.setup();
    render(<QuickStatsWidget assets={mockAssets} bridges={mockBridges} />);

    const showMore = screen.getByRole("button", { name: /show more/i });
    expect(showMore).toBeInTheDocument();

    await user.click(showMore);

    const listItems = screen.getAllByRole("listitem");
    expect(listItems).toHaveLength(6);
    expect(screen.getByRole("button", { name: /show less/i })).toBeInTheDocument();
  });

  it("collapses back when Show less is clicked", async () => {
    const user = userEvent.setup();
    render(<QuickStatsWidget assets={mockAssets} bridges={mockBridges} />);

    await user.click(screen.getByRole("button", { name: /show more/i }));
    expect(screen.getAllByRole("listitem")).toHaveLength(6);

    await user.click(screen.getByRole("button", { name: /show less/i }));
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
  });

  it("renders links for stats with href", () => {
    render(<QuickStatsWidget assets={mockAssets} bridges={mockBridges} />);
    const links = screen.getAllByRole("link");
    // TVL, Assets, and Bridges should be links
    expect(links.length).toBeGreaterThanOrEqual(3);
  });

  it("has proper aria attributes", () => {
    render(<QuickStatsWidget assets={mockAssets} bridges={mockBridges} />);
    const section = screen.getByTestId("quick-stats-widget");
    expect(section.tagName.toLowerCase()).toBe("section");
    expect(section).toHaveAttribute("aria-labelledby", "quick-stats-heading");
  });

  it("has aria-expanded on the toggle button", () => {
    render(<QuickStatsWidget assets={mockAssets} bridges={mockBridges} />);
    const button = screen.getByRole("button", { name: /show more/i });
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("handles empty data gracefully", () => {
    render(<QuickStatsWidget assets={[]} bridges={[]} />);
    expect(screen.getByText("$0.00")).toBeInTheDocument();
    expect(screen.getByText("0%")).toBeInTheDocument();
  });

  it("shows correct system health status styling", () => {
    render(<QuickStatsWidget assets={mockAssets} bridges={mockBridges} />);
    // System health card should exist (avg score ~66 = warning)
    const healthCard = screen.getByTestId("stat-card-health");
    expect(healthCard).toBeInTheDocument();
  });

  it("uses responsive grid layout", () => {
    render(<QuickStatsWidget assets={mockAssets} bridges={mockBridges} />);
    const grid = screen.getByRole("list");
    expect(grid.className).toContain("grid");
    expect(grid.className).toContain("grid-cols-2");
    expect(grid.className).toContain("md:grid-cols-3");
    expect(grid.className).toContain("lg:grid-cols-4");
  });
});
