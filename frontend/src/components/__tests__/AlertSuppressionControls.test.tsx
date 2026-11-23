import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { render } from "../../test/utils";
import AlertSuppressionControls from "../AlertSuppressionControls";
import * as api from "../../services/api";

vi.mock("../../services/api", () => ({
  getSuppressionRules: vi.fn(),
  toggleSuppressionRule: vi.fn(),
  createMaintenanceOverride: vi.fn(),
  previewSuppression: vi.fn(),
}));

function snoozeForm() {
  return screen.getByRole("form", { name: "Snooze alerts" });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getSuppressionRules).mockResolvedValue({ rules: [] });
  vi.mocked(api.createMaintenanceOverride).mockResolvedValue({ rule: {} as never });
});

describe("AlertSuppressionControls (#1689)", () => {
  it("renders the snooze duration buttons (15m, 1h, 4h, 24h, Custom)", async () => {
    render(<AlertSuppressionControls />);
    await waitFor(() => expect(api.getSuppressionRules).toHaveBeenCalled());

    const form = snoozeForm();
    for (const label of ["15m", "1h", "4h", "24h", "Custom"]) {
      expect(within(form).getByRole("button", { name: label })).toBeInTheDocument();
    }
    expect(within(form).getByRole("button", { name: "1h" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows a custom date-time picker when Custom is selected", async () => {
    render(<AlertSuppressionControls />);
    await waitFor(() => expect(api.getSuppressionRules).toHaveBeenCalled());
    const form = snoozeForm();

    expect(within(form).queryByLabelText("Custom snooze until")).toBeNull();
    fireEvent.click(within(form).getByRole("button", { name: "Custom" }));

    expect(within(form).getByLabelText("Custom snooze until")).toHaveAttribute("type", "datetime-local");
    expect(within(form).getByRole("button", { name: "Custom" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(form).getByRole("button", { name: "15m" }));
    expect(within(form).queryByLabelText("Custom snooze until")).toBeNull();
  });

  it("validates the suppression reason before submitting a snooze", async () => {
    render(<AlertSuppressionControls />);
    await waitFor(() => expect(api.getSuppressionRules).toHaveBeenCalled());
    const form = snoozeForm();

    fireEvent.click(within(form).getByRole("button", { name: "Snooze alerts" }));
    expect(within(form).getByRole("alert")).toHaveTextContent("Please provide a suppression reason.");
    expect(api.createMaintenanceOverride).not.toHaveBeenCalled();

    fireEvent.change(within(form).getByLabelText("Suppression reason"), { target: { value: "   " } });
    fireEvent.click(within(form).getByRole("button", { name: "Snooze alerts" }));
    expect(within(form).getByRole("alert")).toHaveTextContent("Please provide a suppression reason.");
    expect(api.createMaintenanceOverride).not.toHaveBeenCalled();
  });

  it("submits the snooze to the backend and updates the alert state", async () => {
    render(<AlertSuppressionControls />);
    await waitFor(() => expect(api.getSuppressionRules).toHaveBeenCalled());
    const form = snoozeForm();

    fireEvent.click(within(form).getByRole("button", { name: "4h" }));
    fireEvent.change(within(form).getByLabelText("Suppression reason"), {
      target: { value: "Planned bridge upgrade" },
    });
    fireEvent.click(within(form).getByRole("button", { name: "Snooze alerts" }));

    await waitFor(() => expect(api.createMaintenanceOverride).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(api.createMaintenanceOverride).mock.calls[0][0];
    expect(payload).toEqual(expect.objectContaining({
      actor: "dashboard",
      description: "Planned bridge upgrade",
    }));
    const durationMinutes = (new Date(payload.endAt).getTime() - new Date(payload.startAt).getTime()) / 60_000;
    expect(durationMinutes).toBeGreaterThanOrEqual(239);
    expect(durationMinutes).toBeLessThanOrEqual(241);
    expect(await within(form).findByRole("status")).toHaveTextContent("Alerts snoozed until");
    expect(api.getSuppressionRules).toHaveBeenCalledTimes(2);
  });

  it("uses the custom date-time picker value for a custom snooze", async () => {
    render(<AlertSuppressionControls />);
    await waitFor(() => expect(api.getSuppressionRules).toHaveBeenCalled());
    const form = snoozeForm();

    fireEvent.click(within(form).getByRole("button", { name: "Custom" }));
    fireEvent.change(within(form).getByLabelText("Custom snooze until"), {
      target: { value: "2026-11-24T10:00" },
    });
    fireEvent.change(within(form).getByLabelText("Suppression reason"), {
      target: { value: "Maintenance window" },
    });
    fireEvent.click(within(form).getByRole("button", { name: "Snooze alerts" }));

    await waitFor(() => expect(api.createMaintenanceOverride).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.createMaintenanceOverride).mock.calls[0][0].endAt)
      .toBe(new Date("2026-11-24T10:00").toISOString());
    expect(within(form).getByRole("status")).toHaveTextContent("Alerts snoozed until");
  });
});
