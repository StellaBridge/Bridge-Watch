import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { render } from "../../test/utils";
import AnomalyTrendCharts from "../AnomalyTrendCharts";
import { useAnomalyTrends, type AnomalyTrendData } from "../../hooks/useAnomalyTrends";
import { useAssetsWithHealth } from "../../hooks/useAssets";

// What the mocked recharts <Tooltip> hands to the component's custom tooltip.
// recharts only calls the tooltip on hover, which jsdom cannot do, so tests set
// this and the mock renders the tooltip content directly.
const tooltipState = vi.hoisted(() => ({
  active: false,
  label: "",
  payload: [] as Array<{ name: string; value: number; color: string }>,
}));

vi.mock("recharts", async () => {
  const React = await import("react");
  type WithChildren = { children?: React.ReactNode };
  return {
    ResponsiveContainer: ({
      children,
      width,
      height,
    }: WithChildren & { width?: string | number; height?: number }) => (
      <div data-testid="responsive-container" data-width={String(width)} data-height={String(height)}>
        {children}
      </div>
    ),
    AreaChart: ({ children, data }: WithChildren & { data?: unknown }) => (
      <div data-testid="area-chart" data-points={JSON.stringify(data)}>
        {children}
      </div>
    ),
    BarChart: ({ children, data }: WithChildren & { data?: unknown }) => (
      <div data-testid="bar-chart" data-points={JSON.stringify(data)}>
        {children}
      </div>
    ),
    Area: ({ dataKey, stackId }: { dataKey?: string; stackId?: string }) => (
      <div data-testid={`area-${dataKey}`} data-stack={stackId} />
    ),
    Bar: ({ dataKey, stackId }: { dataKey?: string; stackId?: string }) => (
      <div data-testid={`bar-${dataKey}`} data-stack={stackId} />
    ),
    XAxis: ({ tickFormatter }: { tickFormatter?: (value: string) => string }) => (
      <div data-testid="x-axis">{tickFormatter ? tickFormatter("2026-05-02") : null}</div>
    ),
    YAxis: () => null,
    CartesianGrid: () => null,
    Legend: () => null,
    Tooltip: ({ content }: { content?: React.ReactElement }) =>
      tooltipState.active && content ? (
        <div data-testid="tooltip-slot">
          {React.cloneElement(content as React.ReactElement<Record<string, unknown>>, {
            active: true,
            payload: tooltipState.payload,
            label: tooltipState.label,
          })}
        </div>
      ) : null,
  };
});

vi.mock("../../hooks/useAnomalyTrends", () => ({ useAnomalyTrends: vi.fn() }));
vi.mock("../../hooks/useAssets", () => ({ useAssetsWithHealth: vi.fn() }));

const trendData: AnomalyTrendData = {
  trendPoints: [
    { date: "2026-05-01", low: 1, medium: 2, high: 0, critical: 0, total: 3 },
    { date: "2026-05-02", low: 0, medium: 1, high: 4, critical: 2, total: 7 },
    { date: "2026-05-03", low: 2, medium: 0, high: 1, critical: 1, total: 4 },
  ],
  totalEvents: 14,
  bySeverity: { low: 11, medium: 7, high: 5, critical: 3 },
  byAsset: { USDC: 9, XLM: 3, EURC: 6, BTC: 1, ETH: 4, SOL: 2 },
};

const emptyTrendData: AnomalyTrendData = {
  trendPoints: [],
  totalEvents: 0,
  bySeverity: { low: 0, medium: 0, high: 0, critical: 0 },
  byAsset: {},
};

function mockTrends(result: { data?: AnomalyTrendData; isLoading?: boolean; error?: unknown }) {
  vi.mocked(useAnomalyTrends).mockReturnValue({
    data: result.data,
    isLoading: result.isLoading ?? false,
    error: result.error ?? null,
  } as never);
}

function badgeValue(label: string): string | null {
  return screen.getByText(label).nextElementSibling?.textContent ?? null;
}

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  tooltipState.active = false;
  tooltipState.label = "";
  tooltipState.payload = [];
  mockTrends({ data: trendData });
  vi.mocked(useAssetsWithHealth).mockReturnValue({
    data: [
      { symbol: "USDC", name: "USD Coin", health: null },
      { symbol: "XLM", name: "Stellar Lumens", health: null },
    ],
  } as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AnomalyTrendCharts (#1690)", () => {
  describe("chart rendering with valid timeseries data", () => {
    it("renders the section heading and the chart inside a labelled region", () => {
      render(<AnomalyTrendCharts />);

      expect(screen.getByRole("region", { name: "Anomaly trend charts" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Anomaly Trends" })).toBeInTheDocument();
      expect(screen.getByText("Severity breakdown over time")).toBeInTheDocument();
    });

    it("passes every trend point to the area chart, the default view", () => {
      render(<AnomalyTrendCharts />);

      const chart = screen.getByTestId("area-chart");
      expect(JSON.parse(chart.getAttribute("data-points") ?? "null")).toEqual(trendData.trendPoints);
      expect(screen.queryByTestId("bar-chart")).not.toBeInTheDocument();
    });

    it("draws one stacked series per severity", () => {
      render(<AnomalyTrendCharts />);

      for (const severity of ["critical", "high", "medium", "low"]) {
        expect(screen.getByTestId(`area-${severity}`)).toHaveAttribute("data-stack", "1");
      }
    });

    it("shows the per-severity totals in the summary badges", () => {
      render(<AnomalyTrendCharts />);

      expect(badgeValue("Critical")).toBe("3");
      expect(badgeValue("High")).toBe("5");
      expect(badgeValue("Medium")).toBe("7");
      expect(badgeValue("Low")).toBe("11");
    });

    it("trims the x-axis dates to month-day", () => {
      render(<AnomalyTrendCharts />);

      expect(screen.getByTestId("x-axis")).toHaveTextContent("05-02");
    });

    it("switches between the area and bar views", () => {
      render(<AnomalyTrendCharts />);

      fireEvent.click(screen.getByRole("button", { name: "Bar" }));
      expect(screen.getByTestId("bar-chart")).toBeInTheDocument();
      expect(screen.queryByTestId("area-chart")).not.toBeInTheDocument();
      for (const severity of ["critical", "high", "medium", "low"]) {
        expect(screen.getByTestId(`bar-${severity}`)).toHaveAttribute("data-stack", "severity");
      }
      expect(
        JSON.parse(screen.getByTestId("bar-chart").getAttribute("data-points") ?? "null")
      ).toEqual(trendData.trendPoints);

      fireEvent.click(screen.getByRole("button", { name: "Area" }));
      expect(screen.getByTestId("area-chart")).toBeInTheDocument();
      expect(screen.queryByTestId("bar-chart")).not.toBeInTheDocument();
    });
  });

  describe("empty and failure states", () => {
    it("renders an empty chart and zeroed badges when there are no anomalies", () => {
      mockTrends({ data: emptyTrendData });
      render(<AnomalyTrendCharts />);

      expect(JSON.parse(screen.getByTestId("area-chart").getAttribute("data-points") ?? "null")).toEqual([]);
      expect(badgeValue("Critical")).toBe("0");
      expect(badgeValue("High")).toBe("0");
      expect(badgeValue("Medium")).toBe("0");
      expect(badgeValue("Low")).toBe("0");
      expect(screen.queryByText("Top assets by anomaly count")).not.toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("renders an empty chart without badges before any data has arrived", () => {
      mockTrends({ data: undefined });
      render(<AnomalyTrendCharts />);

      expect(JSON.parse(screen.getByTestId("area-chart").getAttribute("data-points") ?? "null")).toEqual([]);
      expect(screen.queryByText("Critical")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Export CSV" })).toBeDisabled();
    });

    it("shows a loading skeleton instead of the chart while loading", () => {
      mockTrends({ data: undefined, isLoading: true });
      const { container } = render(<AnomalyTrendCharts />);

      expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
      expect(screen.queryByTestId("responsive-container")).not.toBeInTheDocument();
    });

    it("announces a failure to load", () => {
      mockTrends({ data: undefined, error: new Error("network down") });
      render(<AnomalyTrendCharts />);

      expect(screen.getByRole("alert")).toHaveTextContent("Failed to load anomaly trend data.");
    });
  });

  describe("responsive resizing", () => {
    it("sizes the chart to fill its container so it follows the container width", () => {
      render(<AnomalyTrendCharts />);

      const container = screen.getByTestId("responsive-container");
      expect(container).toHaveAttribute("data-width", "100%");
      expect(container).toHaveAttribute("data-height", "280");
    });

    it("keeps the chart and its data when the window is resized", () => {
      render(<AnomalyTrendCharts />);

      window.dispatchEvent(new Event("resize"));

      const chart = screen.getByTestId("area-chart");
      expect(JSON.parse(chart.getAttribute("data-points") ?? "null")).toEqual(trendData.trendPoints);
      expect(screen.getByTestId("responsive-container")).toHaveAttribute("data-width", "100%");
    });

    it("keeps the same responsive sizing after switching chart type", () => {
      render(<AnomalyTrendCharts />);

      fireEvent.click(screen.getByRole("button", { name: "Bar" }));

      expect(screen.getByTestId("responsive-container")).toHaveAttribute("data-width", "100%");
    });
  });

  describe("tooltip", () => {
    it("lists the anomaly count for each severity, largest first, under the date", () => {
      tooltipState.active = true;
      tooltipState.label = "05-02";
      tooltipState.payload = [
        { name: "critical", value: 2, color: "#ef4444" },
        { name: "high", value: 4, color: "#f97316" },
        { name: "medium", value: 1, color: "#eab308" },
      ];
      render(<AnomalyTrendCharts />);

      const tooltip = within(screen.getByTestId("tooltip-slot"));
      expect(tooltip.getByText("05-02")).toBeInTheDocument();

      const rows = screen
        .getByTestId("tooltip-slot")
        .querySelectorAll("p.flex");
      expect(Array.from(rows).map((row) => row.textContent)).toEqual(["High4", "Critical2", "Medium1"]);
    });

    it("colors each severity row with its series color", () => {
      tooltipState.active = true;
      tooltipState.label = "05-02";
      tooltipState.payload = [{ name: "critical", value: 2, color: "#ef4444" }];
      render(<AnomalyTrendCharts />);

      const row = screen.getByTestId("tooltip-slot").querySelector("p.flex") as HTMLElement;
      expect(row).toHaveStyle({ color: "#ef4444" });
    });

    it("leaves out severities with no anomalies", () => {
      tooltipState.active = true;
      tooltipState.label = "05-01";
      tooltipState.payload = [
        { name: "low", value: 0, color: "#22c55e" },
        { name: "medium", value: 2, color: "#eab308" },
      ];
      render(<AnomalyTrendCharts />);

      const tooltip = within(screen.getByTestId("tooltip-slot"));
      expect(tooltip.getByText("Medium")).toBeInTheDocument();
      expect(tooltip.queryByText("Low")).not.toBeInTheDocument();
    });

    it("falls back to the raw series name for an unknown severity", () => {
      tooltipState.active = true;
      tooltipState.label = "05-01";
      tooltipState.payload = [{ name: "unclassified", value: 3, color: "#999999" }];
      render(<AnomalyTrendCharts />);

      expect(within(screen.getByTestId("tooltip-slot")).getByText("unclassified")).toBeInTheDocument();
    });

    it("renders nothing when there is no payload", () => {
      tooltipState.active = true;
      tooltipState.label = "05-01";
      tooltipState.payload = [];
      render(<AnomalyTrendCharts />);

      expect(screen.getByTestId("tooltip-slot")).toBeEmptyDOMElement();
    });
  });

  describe("top assets", () => {
    function topAssetRows(): HTMLElement[] {
      const heading = screen.getByText("Top assets by anomaly count");
      return Array.from(heading.parentElement?.querySelectorAll(".space-y-3 > div") ?? []) as HTMLElement[];
    }

    it("lists at most five assets, most anomalies first", () => {
      render(<AnomalyTrendCharts />);

      const rows = topAssetRows();
      expect(rows.map((row) => row.querySelector("span")?.textContent)).toEqual([
        "USDC",
        "EURC",
        "ETH",
        "XLM",
        "SOL",
      ]);
      expect(rows.map((row) => row.lastElementChild?.textContent)).toEqual(["9", "6", "4", "3", "2"]);
      expect(screen.queryByText("BTC")).not.toBeInTheDocument();
    });

    it("scales each bar against the largest count", () => {
      render(<AnomalyTrendCharts />);

      const widths = topAssetRows().map((row) =>
        parseFloat((row.querySelector("div.bg-stellar-blue") as HTMLElement).style.width)
      );
      expect(widths[0]).toBe(100);
      expect(widths[1]).toBeCloseTo((6 / 9) * 100, 5);
      expect(widths[4]).toBeCloseTo((2 / 9) * 100, 5);
    });
  });

  describe("filters", () => {
    it("starts on all assets over the last 30 days", () => {
      render(<AnomalyTrendCharts />);

      expect(vi.mocked(useAnomalyTrends)).toHaveBeenLastCalledWith({ assetCode: undefined, days: 30 });
      expect(screen.getByLabelText("Time range")).toHaveValue("30");
    });

    it("offers every known asset in the asset filter", () => {
      render(<AnomalyTrendCharts />);

      const options = within(screen.getByLabelText("Filter by asset")).getAllByRole("option");
      expect(options.map((option) => option.textContent)).toEqual(["All assets", "USDC", "XLM"]);
    });

    it("requests the selected asset, and all assets again when cleared", () => {
      render(<AnomalyTrendCharts />);
      const select = screen.getByLabelText("Filter by asset");

      fireEvent.change(select, { target: { value: "XLM" } });
      expect(vi.mocked(useAnomalyTrends)).toHaveBeenLastCalledWith({ assetCode: "XLM", days: 30 });

      fireEvent.change(select, { target: { value: "" } });
      expect(vi.mocked(useAnomalyTrends)).toHaveBeenLastCalledWith({ assetCode: undefined, days: 30 });
    });

    it("requests the selected time range as a number of days", () => {
      render(<AnomalyTrendCharts />);

      fireEvent.change(screen.getByLabelText("Time range"), { target: { value: "90" } });

      expect(vi.mocked(useAnomalyTrends)).toHaveBeenLastCalledWith({ assetCode: undefined, days: 90 });
    });

    it("copes with the asset list not having loaded yet", () => {
      vi.mocked(useAssetsWithHealth).mockReturnValue({ data: undefined } as never);
      render(<AnomalyTrendCharts />);

      const options = within(screen.getByLabelText("Filter by asset")).getAllByRole("option");
      expect(options.map((option) => option.textContent)).toEqual(["All assets"]);
    });
  });

  describe("CSV export", () => {
    it("downloads the trend points as a dated CSV", async () => {
      const blobs: Blob[] = [];
      const revoked: string[] = [];
      const downloads: string[] = [];
      URL.createObjectURL = vi.fn((blob: Blob | MediaSource) => {
        blobs.push(blob as Blob);
        return "blob:anomaly-trends";
      });
      URL.revokeObjectURL = vi.fn((url: string) => {
        revoked.push(url);
      });
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
        this: HTMLAnchorElement
      ) {
        downloads.push(this.download);
      });

      render(<AnomalyTrendCharts />);
      fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));

      expect(downloads).toHaveLength(1);
      expect(downloads[0]).toMatch(/^anomaly-trends-\d{4}-\d{2}-\d{2}\.csv$/);
      expect(revoked).toEqual(["blob:anomaly-trends"]);
      expect(blobs[0].type).toBe("text/csv");
      expect(await readBlob(blobs[0])).toBe(
        [
          "Date,Low,Medium,High,Critical,Total",
          "2026-05-01,1,2,0,0,3",
          "2026-05-02,0,1,4,2,7",
          "2026-05-03,2,0,1,1,4",
        ].join("\n")
      );
    });

    it("is disabled until there is data to export", () => {
      mockTrends({ data: undefined, isLoading: true });
      render(<AnomalyTrendCharts />);

      expect(screen.getByRole("button", { name: "Export CSV" })).toBeDisabled();
    });
  });
});
