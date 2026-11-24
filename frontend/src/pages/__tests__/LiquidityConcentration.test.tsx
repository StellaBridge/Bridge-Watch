import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "../../test/utils";
import LiquidityConcentration from "../LiquidityConcentration";
import * as api from "../../services/api";
import type { LiquidityConcentrationData, TradingPair } from "../../types/liquidity";

vi.mock("../../services/api", () => ({
  getLiquidityConcentration: vi.fn(),
}));

// jsdom has no layout, so ResponsiveContainer would measure 0x0 and draw
// nothing. Give the chart a fixed size so its bars and axis are rendered.
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactNode }) => (
      <div data-testid="chart-container">
        {isValidElement(children)
          ? cloneElement(children as ReactElement<{ width: number; height: number }>, { width: 800, height: 360 })
          : children}
      </div>
    ),
  };
});

const STORAGE_KEY = "bridge-watch:liquidity-pair:v1";

function concentration(pair: TradingPair, overrides: Partial<LiquidityConcentrationData> = {}): LiquidityConcentrationData {
  return {
    pair,
    midPrice: 0.1234567,
    spreadPct: 0.0421,
    bidTotal: 150_000,
    askTotal: 90_500,
    timestamp: "2026-11-24T10:00:00Z",
    buckets: [
      { label: "mid-2%", lowerBound: 0.121, upperBound: 0.122, bidVolume: 50_000, askVolume: 0, levelsCount: 4 },
      { label: "mid-1%", lowerBound: 0.122, upperBound: 0.1234, bidVolume: 100_000, askVolume: 0, levelsCount: 6 },
      { label: "mid+1%", lowerBound: 0.1234, upperBound: 0.1247, bidVolume: 0, askVolume: 60_000, levelsCount: 5 },
      { label: "mid+2%", lowerBound: 0.1247, upperBound: 0.126, bidVolume: 0, askVolume: 30_500, levelsCount: 3 },
    ],
    gaps: [],
    ...overrides,
  };
}

function statValue(label: string) {
  return screen.getByText(label, { selector: "p" }).nextElementSibling?.textContent;
}

function chart(pair: string) {
  return screen.getByRole("region", { name: `${pair} liquidity concentration` });
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(api.getLiquidityConcentration).mockImplementation(async (pair) =>
    concentration(pair as TradingPair)
  );
});

describe("LiquidityConcentration page (#1683)", () => {
  it("renders the depth-by-price-bracket chart with a bid and an ask bar per bucket", async () => {
    const { container } = render(<LiquidityConcentration />);

    expect(screen.getByRole("heading", { name: "Liquidity Concentration" })).toBeInTheDocument();
    // Skeleton while the first request is in flight.
    expect(screen.getByRole("status", { name: "USDC/XLM concentration chart loading" })).toBeInTheDocument();

    await waitFor(() => expect(container.querySelectorAll(".recharts-bar")).toHaveLength(2));
    const region = chart("USDC/XLM");
    for (const label of ["mid-2%", "mid-1%", "mid+1%", "mid+2%"]) {
      expect(within(region).getByText(label)).toBeInTheDocument();
    }
    // Legend names both series.
    expect(within(region).getByText("Bids")).toBeInTheDocument();
    expect(within(region).getByText("Asks")).toBeInTheDocument();
    // 4 buckets x 2 series; zero-volume bars are still laid out.
    expect(container.querySelectorAll(".recharts-bar-rectangle")).toHaveLength(8);
    expect(api.getLiquidityConcentration).toHaveBeenCalledWith("USDC/XLM");
  });

  it("draws bid depth below the mid price and ask depth above it", async () => {
    const { container } = render(<LiquidityConcentration />);
    await waitFor(() => expect(container.querySelectorAll(".recharts-bar")).toHaveLength(2));

    // A bucket with zero volume lays out an empty slot with no shape, so the
    // drawn slots show which side of the book each series comes from.
    const drawn = (series: Element) =>
      Array.from(series.querySelectorAll(".recharts-bar-rectangle")).map((r) => r.querySelector("path") !== null);
    const [bids, asks] = Array.from(container.querySelectorAll(".recharts-bar"));
    // Bars grow in with an animation (about 1.5 s) before their shapes exist.
    await waitFor(() => expect(drawn(bids)).toEqual([true, true, false, false]), { timeout: 4_000 });
    expect(drawn(asks)).toEqual([false, false, true, true]);
  });

  it("shows the current mid price, spread and depth totals alongside the curve", async () => {
    render(<LiquidityConcentration />);
    await screen.findByText("Mid Price");

    expect(statValue("Mid Price")).toBe("0.1234567");
    expect(statValue("Spread")).toBe("0.0421%");
    expect(statValue("Bid Total")).toBe("$150,000");
    expect(statValue("Ask Total")).toBe("$90,500");
    expect(screen.getByText(/^Updated /)).toBeInTheDocument();
  });

  it("orders brackets from below the mid price to above it on the x axis", async () => {
    const { container } = render(<LiquidityConcentration />);
    await waitFor(() => expect(container.querySelector(".recharts-xAxis")).not.toBeNull());

    const labels = Array.from(
      container.querySelectorAll(".recharts-xAxis .recharts-cartesian-axis-tick-value")
    ).map((t) => t.textContent);
    expect(labels).toEqual(["mid-2%", "mid-1%", "mid+1%", "mid+2%"]);
  });

  it("flags low-liquidity zones near the price and lists them with severity", async () => {
    vi.mocked(api.getLiquidityConcentration).mockResolvedValue(
      concentration("USDC/XLM", {
        gaps: [
          { startPrice: 0.1236, endPrice: 0.1238, depth: 0.5, severity: 0.85 },
          { startPrice: 0.125, endPrice: 0.1252, depth: 12, severity: 0.4 },
          // Below the 0.001 threshold: not a real gap.
          { startPrice: 0.126, endPrice: 0.1261, depth: 900, severity: 0.0005 },
        ],
      })
    );
    render(<LiquidityConcentration />);

    expect(await screen.findByText("2 low-liquidity zones detected")).toBeInTheDocument();
    const rows = within(screen.getByRole("table", { name: "Detected liquidity gaps" })).getAllByRole("row");
    expect(rows).toHaveLength(3); // header + 2 gaps
    expect(within(rows[1]).getByText("0.1236000 – 0.1238000")).toBeInTheDocument();
    expect(within(rows[1]).getByText("85%")).toHaveClass("text-red-400");
    expect(within(rows[2]).getByText("40%")).toHaveClass("text-amber-400");
  });

  it("reloads the chart for the pair chosen in the dropdown and remembers the choice", async () => {
    vi.mocked(api.getLiquidityConcentration).mockImplementation(async (pair) =>
      pair === "EURC/XLM"
        ? concentration("EURC/XLM", {
            midPrice: 2.5,
            bidTotal: 1_234,
            buckets: [
              { label: "eurc-low", lowerBound: 2.4, upperBound: 2.5, bidVolume: 1_234, askVolume: 0, levelsCount: 1 },
            ],
          })
        : concentration(pair as TradingPair)
    );
    const { container } = render(<LiquidityConcentration />);
    await waitFor(() => expect(statValue("Mid Price")).toBe("0.1234567"));

    const select = screen.getByLabelText("Trading Pair");
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "USDC/XLM",
      "EURC/XLM",
      "PYUSD/XLM",
      "FOBXX/USDC",
    ]);

    fireEvent.change(select, { target: { value: "EURC/XLM" } });

    await waitFor(() => expect(statValue("Mid Price")).toBe("2.5000000"));
    expect(api.getLiquidityConcentration).toHaveBeenLastCalledWith("EURC/XLM");
    const region = chart("EURC/XLM");
    expect(within(region).getByText("eurc-low")).toBeInTheDocument();
    expect(within(region).queryByText("mid-2%")).not.toBeInTheDocument();
    expect(container.querySelectorAll(".recharts-bar-rectangle")).toHaveLength(2);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toBe("EURC/XLM");
  });

  it("starts on the pair saved from a previous visit", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify("FOBXX/USDC"));
    render(<LiquidityConcentration />);

    expect(screen.getByLabelText("Trading Pair")).toHaveValue("FOBXX/USDC");
    await waitFor(() => expect(api.getLiquidityConcentration).toHaveBeenCalledWith("FOBXX/USDC"));
  });

  it("shows an empty state instead of a chart for a pool with no liquidity buckets", async () => {
    vi.mocked(api.getLiquidityConcentration).mockResolvedValue(
      concentration("USDC/XLM", { buckets: [], bidTotal: 0, askTotal: 0, spreadPct: 0 })
    );
    const { container } = render(<LiquidityConcentration />);

    expect(await screen.findByText("No concentration data available for USDC/XLM")).toBeInTheDocument();
    expect(container.querySelector(".recharts-wrapper")).toBeNull();
    expect(statValue("Bid Total")).toBe("$0");
    expect(statValue("Ask Total")).toBe("$0");
  });

  it("shows the empty state and no stats when the API has no data for the pair", async () => {
    vi.mocked(api.getLiquidityConcentration).mockResolvedValue(null);
    render(<LiquidityConcentration />);

    expect(await screen.findByText("No concentration data available for USDC/XLM")).toBeInTheDocument();
    expect(screen.queryByText("Mid Price")).not.toBeInTheDocument();
  });

  it("does not break the scale on zero-volume buckets", async () => {
    vi.mocked(api.getLiquidityConcentration).mockResolvedValue(
      concentration("USDC/XLM", {
        buckets: [
          { label: "mid-1%", lowerBound: 0.12, upperBound: 0.123, bidVolume: 0, askVolume: 0, levelsCount: 0 },
          { label: "mid+1%", lowerBound: 0.123, upperBound: 0.126, bidVolume: 0, askVolume: 0, levelsCount: 0 },
        ],
      })
    );
    const { container } = render(<LiquidityConcentration />);

    await waitFor(() => expect(container.querySelector(".recharts-wrapper")).not.toBeNull());
    expect(within(chart("USDC/XLM")).getByText("mid-1%")).toBeInTheDocument();
    const ticks = Array.from(container.querySelectorAll(".recharts-yAxis .recharts-cartesian-axis-tick-value")).map(
      (t) => t.textContent
    );
    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks.some((t) => /NaN|Infinity/.test(t ?? ""))).toBe(false);
  });

  it("formats large depth values on the y axis in thousands", async () => {
    const { container } = render(<LiquidityConcentration />);
    await waitFor(() => expect(container.querySelector(".recharts-yAxis")).not.toBeNull());

    const ticks = Array.from(container.querySelectorAll(".recharts-yAxis .recharts-cartesian-axis-tick-value")).map(
      (t) => t.textContent
    );
    expect(ticks).toContain("0");
    expect(ticks.filter((t) => t !== "0").every((t) => /^\d+(\.\d)?k$/.test(t ?? ""))).toBe(true);
  });

  it("shows the API error", async () => {
    vi.mocked(api.getLiquidityConcentration).mockRejectedValue(new Error("Horizon unavailable"));
    render(<LiquidityConcentration />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Horizon unavailable");
  });
});
