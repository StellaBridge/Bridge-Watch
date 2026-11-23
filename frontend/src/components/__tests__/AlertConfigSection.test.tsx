import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { render } from "../../test/utils";
import AlertConfigSection from "../AlertConfigSection";
import * as api from "../../services/api";
import type { Alert } from "../../types";

vi.mock("../../services/api", () => ({
  updateAlertThresholds: vi.fn(),
}));

const alerts: Alert[] = [
  {
    id: "alert-1",
    type: "supply_mismatch",
    severity: "warning",
    message: "Supply drift detected on USDC",
    createdAt: "2026-11-23T09:00:00Z",
  },
];

function configForm() {
  return screen.getByRole("form", { name: "Alert threshold configuration" });
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(api.updateAlertThresholds).mockResolvedValue({
    thresholds: { warningThreshold: 70, criticalThreshold: 90, cooldownMinutes: 15 },
  });
});

describe("AlertConfigSection (#1688)", () => {
  it("renders threshold input fields with their initial values", () => {
    render(<AlertConfigSection alerts={alerts} isLoading={false} />);
    const form = configForm();

    expect(within(form).getByLabelText("Warning threshold (%)")).toHaveValue(70);
    expect(within(form).getByLabelText("Critical threshold (%)")).toHaveValue(90);
    expect(within(form).getByLabelText("Cooldown (minutes)")).toHaveValue(15);
  });

  it("rejects negative numbers and zero thresholds", () => {
    render(<AlertConfigSection alerts={alerts} isLoading={false} />);
    const form = configForm();

    fireEvent.change(within(form).getByLabelText("Warning threshold (%)"), { target: { value: "-1" } });
    fireEvent.click(within(form).getByRole("button", { name: "Save configuration" }));
    expect(within(form).getByRole("alert")).toHaveTextContent("Threshold values must be positive numbers.");
    expect(api.updateAlertThresholds).not.toHaveBeenCalled();

    fireEvent.change(within(form).getByLabelText("Warning threshold (%)"), { target: { value: "0" } });
    fireEvent.click(within(form).getByRole("button", { name: "Save configuration" }));
    expect(within(form).getByRole("alert")).toHaveTextContent("Threshold values must be positive numbers.");
    expect(api.updateAlertThresholds).not.toHaveBeenCalled();
  });

  it("saves the configuration through the update mutation", async () => {
    render(<AlertConfigSection alerts={alerts} isLoading={false} />);
    const form = configForm();

    fireEvent.change(within(form).getByLabelText("Warning threshold (%)"), { target: { value: "65" } });
    fireEvent.change(within(form).getByLabelText("Critical threshold (%)"), { target: { value: "85" } });
    fireEvent.change(within(form).getByLabelText("Cooldown (minutes)"), { target: { value: "30" } });
    fireEvent.click(within(form).getByRole("button", { name: "Save configuration" }));

    await waitFor(() => expect(api.updateAlertThresholds).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.updateAlertThresholds).mock.calls[0][0]).toEqual({
      warningThreshold: 65,
      criticalThreshold: 85,
      cooldownMinutes: 30,
    });
    expect(await within(form).findByRole("status")).toHaveTextContent("Alert configuration saved.");
  });

  it("restores default thresholds when reset is pressed", () => {
    render(<AlertConfigSection alerts={alerts} isLoading={false} />);
    const form = configForm();

    fireEvent.change(within(form).getByLabelText("Warning threshold (%)"), { target: { value: "10" } });
    fireEvent.change(within(form).getByLabelText("Critical threshold (%)"), { target: { value: "55" } });
    fireEvent.change(within(form).getByLabelText("Cooldown (minutes)"), { target: { value: "5" } });
    fireEvent.click(within(form).getByRole("button", { name: "Reset to defaults" }));

    expect(within(form).getByLabelText("Warning threshold (%)")).toHaveValue(70);
    expect(within(form).getByLabelText("Critical threshold (%)")).toHaveValue(90);
    expect(within(form).getByLabelText("Cooldown (minutes)")).toHaveValue(15);
  });

  it("still renders the active alerts alongside the configuration form", () => {
    render(<AlertConfigSection alerts={alerts} isLoading={false} />);

    expect(screen.getByText("Supply drift detected on USDC")).toBeInTheDocument();
    expect(screen.getByText("warning")).toBeInTheDocument();
  });
});
