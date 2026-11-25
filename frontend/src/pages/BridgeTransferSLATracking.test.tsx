import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import BridgeTransferSLATracking from "./BridgeTransferSLATracking";

describe("BridgeTransferSLATracking", () => {
  it("renders bridge metrics and breach incidents", () => {
    render(<BridgeTransferSLATracking />);

    expect(screen.getByRole("heading", { name: "Bridge Transfer SLA Tracking" })).toBeInTheDocument();
    expect(screen.getByText("StellarX Bridge")).toBeInTheDocument();
    expect(screen.getAllByText("Pendulum Spacewalk")).toHaveLength(2);
    expect(screen.getAllByText("Allbridge Core")).toHaveLength(2);
    expect(screen.getByText("INVESTIGATING")).toBeInTheDocument();
    expect(screen.getByText("RESOLVED")).toBeInTheDocument();
  });

  it("updates SLA settings and announces success", () => {
    vi.useFakeTimers();
    render(<BridgeTransferSLATracking />);

    const target = screen.getByLabelText("Default Transfer SLA Target (seconds)");
    const threshold = screen.getByLabelText("Breach Alert Threshold (%)");
    fireEvent.change(target, { target: { value: "300" } });
    fireEvent.change(threshold, { target: { value: "7.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Update SLA Targets" }));

    expect(target).toHaveValue(300);
    expect(threshold).toHaveValue(7.5);
    expect(screen.getByText("SLA targets updated successfully!")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.queryByText("SLA targets updated successfully!")).not.toBeInTheDocument();
    vi.useRealTimers();
  });
});
