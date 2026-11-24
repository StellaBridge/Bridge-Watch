import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import ChartControls, { type ChartControlsProps } from "../ChartControls";
import ChartLegendControls, { type LegendSeries } from "../ChartLegendControls";

function controlsProps(overrides: Partial<ChartControlsProps> = {}): ChartControlsProps {
  return {
    rangeId: "24h",
    onRangeIdChange: vi.fn(),
    customStartIso: "2026-11-01T00:00",
    customEndIso: "2026-11-23T00:00",
    onCustomStartIsoChange: vi.fn(),
    onCustomEndIsoChange: vi.fn(),
    deviationThresholdPct: 1.5,
    onDeviationThresholdPctChange: vi.fn(),
    showVwap: false,
    onShowVwapChange: vi.fn(),
    onExportPng: vi.fn(),
    ...overrides,
  };
}

describe("ChartControls", () => {
  it.each([
    ["1H", "1h"],
    ["24H", "24h"],
    ["7D", "7d"],
    ["30D", "30d"],
    ["Custom", "custom"],
  ])("calls onRangeIdChange with %s's id", (label, id) => {
    const props = controlsProps();
    render(<ChartControls {...props} />);
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(props.onRangeIdChange).toHaveBeenCalledTimes(1);
    expect(props.onRangeIdChange).toHaveBeenCalledWith(id);
  });

  it("marks only the active range as pressed", () => {
    render(<ChartControls {...controlsProps({ rangeId: "7d" })} />);
    expect(screen.getByRole("button", { name: "7D" })).toHaveAttribute("aria-pressed", "true");
    for (const label of ["1H", "24H", "30D", "Custom"]) {
      expect(screen.getByRole("button", { name: label })).toHaveAttribute("aria-pressed", "false");
    }
  });

  it("shows the custom date inputs only for the custom range", () => {
    const { rerender } = render(<ChartControls {...controlsProps({ rangeId: "24h" })} />);
    expect(screen.queryByText("From")).not.toBeInTheDocument();
    expect(screen.queryByText("To")).not.toBeInTheDocument();

    rerender(<ChartControls {...controlsProps({ rangeId: "custom" })} />);
    expect(screen.getByText("From")).toBeInTheDocument();
    expect(screen.getByText("To")).toBeInTheDocument();
  });

  it("reports edits to the custom start and end dates", () => {
    const props = controlsProps({ rangeId: "custom" });
    render(<ChartControls {...props} />);
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-11-05T08:00" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-11-20T18:30" } });
    expect(props.onCustomStartIsoChange).toHaveBeenCalledWith("2026-11-05T08:00");
    expect(props.onCustomEndIsoChange).toHaveBeenCalledWith("2026-11-20T18:30");
  });

  it("reports the deviation threshold as a number", () => {
    const props = controlsProps();
    render(<ChartControls {...props} />);
    const input = screen.getByLabelText(/Deviation/);
    expect(input).toHaveValue(1.5);
    fireEvent.change(input, { target: { value: "2.5" } });
    expect(props.onDeviationThresholdPctChange).toHaveBeenCalledWith(2.5);
  });

  it("reports checking the VWAP box", () => {
    const props = controlsProps({ showVwap: false });
    render(<ChartControls {...props} />);
    const box = screen.getByRole("checkbox", { name: "VWAP" });
    expect(box).not.toBeChecked();
    fireEvent.click(box);
    expect(props.onShowVwapChange).toHaveBeenCalledWith(true);
  });

  it("reflects showVwap and reports unchecking", () => {
    const props = controlsProps({ showVwap: true });
    render(<ChartControls {...props} />);
    const box = screen.getByRole("checkbox", { name: "VWAP" });
    expect(box).toBeChecked();
    fireEvent.click(box);
    expect(props.onShowVwapChange).toHaveBeenCalledWith(false);
  });

  it("exports the chart as PNG", () => {
    const props = controlsProps();
    render(<ChartControls {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Export PNG" }));
    expect(props.onExportPng).toHaveBeenCalledTimes(1);
  });

  it("makes every control button keyboard-focusable", () => {
    render(<ChartControls {...controlsProps()} />);
    for (const button of screen.getAllByRole("button")) {
      expect(button).toHaveAttribute("type", "button");
      expect(button).not.toBeDisabled();
      expect(button.tabIndex).toBeGreaterThanOrEqual(0);
      button.focus();
      expect(button).toHaveFocus();
    }
  });
});

const series: LegendSeries[] = [
  { id: "usdc", label: "USDC", color: "#2775ca", latestValue: 120 },
  { id: "eth", label: "ETH", color: "#627eea", latestValue: 300 },
  { id: "xlm", label: "XLM", color: "#000000" },
];

type LegendProps = Parameters<typeof ChartLegendControls>[0];

function renderLegend(overrides: Partial<LegendProps> = {}) {
  const props: LegendProps = {
    series,
    visibleSeries: ["usdc", "eth"],
    sortMode: "name",
    onToggleSeries: vi.fn(),
    onSortModeChange: vi.fn(),
    ...overrides,
  };
  render(<ChartLegendControls {...props} />);
  return props;
}

/** Series labels in the order the buttons appear. */
function labelOrder() {
  return screen
    .getAllByRole("button")
    .map((b) => (b.getAttribute("aria-label") ?? "").replace(/^(Show|Hide) /, "").replace(/ series$/, ""));
}

describe("ChartLegendControls", () => {
  it("shows Hide for visible series and Show for hidden ones", () => {
    renderLegend();
    expect(screen.getByRole("button", { name: "Hide USDC series" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Hide ETH series" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Show XLM series" })).toHaveAttribute("aria-pressed", "false");
  });

  it("toggles a series by id when its button is clicked", () => {
    const props = renderLegend();
    fireEvent.click(screen.getByRole("button", { name: "Show XLM series" }));
    expect(props.onToggleSeries).toHaveBeenCalledTimes(1);
    expect(props.onToggleSeries).toHaveBeenCalledWith("xlm");
  });

  it("sorts by name by default", () => {
    renderLegend();
    expect(labelOrder()).toEqual(["ETH", "USDC", "XLM"]);
  });

  it("sorts by latest value, highest first, with missing values last", () => {
    renderLegend({ sortMode: "value" });
    expect(labelOrder()).toEqual(["ETH", "USDC", "XLM"]);
  });

  it("reports sort mode changes", () => {
    const props = renderLegend();
    fireEvent.change(screen.getByLabelText("Sort chart legend"), { target: { value: "value" } });
    expect(props.onSortModeChange).toHaveBeenCalledWith("value");
  });

  it("formats values with valueFormatter", () => {
    renderLegend({ valueFormatter: (v) => `$${v}` });
    expect(screen.getByText("$120")).toBeInTheDocument();
    expect(screen.getByText("$300")).toBeInTheDocument();
  });

  it("hides values in compact mode", () => {
    renderLegend({ compact: true, valueFormatter: (v) => `$${v}` });
    expect(screen.queryByText("$120")).not.toBeInTheDocument();
  });

  it("makes every legend button and the sort select keyboard-focusable", () => {
    renderLegend();
    for (const button of screen.getAllByRole("button")) {
      button.focus();
      expect(button).toHaveFocus();
    }
    const select = screen.getByLabelText("Sort chart legend");
    select.focus();
    expect(select).toHaveFocus();
  });
});
