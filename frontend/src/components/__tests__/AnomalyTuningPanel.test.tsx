import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import AnomalyTuningPanel from "../AnomalyTuningPanel";
import * as api from "../../services/api";
import type { AnomalyTuningOverride, AnomalyTuningProfile } from "../../services/api";

vi.mock("../../services/api", () => ({
  getAnomalyTuning: vi.fn(),
  updateAnomalyTuning: vi.fn(),
  createAnomalyTuningOverride: vi.fn(),
  deleteAnomalyTuningOverride: vi.fn(),
}));

const API_KEY = "test-admin-key";

function profile(overrides: Partial<AnomalyTuningProfile> = {}): AnomalyTuningProfile {
  return {
    id: "profile-1",
    name: "default",
    deviation_multiplier: 2.5,
    sliding_window_size: 30,
    updated_by: "ops",
    updated_at: "2026-11-20T12:00:00Z",
    ...overrides,
  };
}

function override(overrides: Partial<AnomalyTuningOverride> = {}): AnomalyTuningOverride {
  return {
    id: "ovr-1",
    anomaly_type: "*",
    asset_code: "USDC",
    bridge_name: "*",
    reason: "Planned migration",
    starts_at: "2026-11-24T09:00:00Z",
    expires_at: "2026-11-24T11:00:00Z",
    ...overrides,
  };
}

const multiplier = () => screen.getByLabelText("Deviation multiplier") as HTMLInputElement;
const windowSize = () => screen.getByLabelText("Sliding window (observations)") as HTMLInputElement;
const status = () => screen.getByRole("status");

async function renderLoaded() {
  render(<AnomalyTuningPanel />);
  fireEvent.change(screen.getByLabelText("Admin API key"), { target: { value: API_KEY } });
  fireEvent.click(screen.getByRole("button", { name: "Load" }));
  await screen.findByText("Rolling baseline");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getAnomalyTuning).mockResolvedValue({ profile: profile(), overrides: [override()] });
  vi.mocked(api.updateAnomalyTuning).mockImplementation(async (_key, input) => ({
    profile: profile({
      deviation_multiplier: input.deviationMultiplier,
      sliding_window_size: input.slidingWindowSize,
    }),
  }));
  vi.mocked(api.deleteAnomalyTuningOverride).mockResolvedValue(undefined);
});

describe("AnomalyTuningPanel (#1691)", () => {
  describe("loading", () => {
    it("keeps Load disabled until an admin API key is entered, and hides the forms", () => {
      render(<AnomalyTuningPanel />);

      expect(screen.getByRole("button", { name: "Load" })).toBeDisabled();
      expect(screen.queryByLabelText("Deviation multiplier")).not.toBeInTheDocument();
      expect(screen.getByLabelText("Admin API key")).toHaveAttribute("type", "password");
    });

    it("loads the current profile into the inputs using the API key", async () => {
      await renderLoaded();

      expect(api.getAnomalyTuning).toHaveBeenCalledWith(API_KEY);
      expect(multiplier()).toHaveValue(2.5);
      expect(windowSize()).toHaveValue(30);
      expect(screen.getByText("USDC")).toBeInTheDocument();
    });

    it("shows the API error and no forms when loading fails", async () => {
      vi.mocked(api.getAnomalyTuning).mockRejectedValue(new Error("403 Forbidden: admin scope required"));
      render(<AnomalyTuningPanel />);
      fireEvent.change(screen.getByLabelText("Admin API key"), { target: { value: "wrong" } });
      fireEvent.click(screen.getByRole("button", { name: "Load" }));

      expect(await screen.findByRole("status")).toHaveTextContent("403 Forbidden: admin scope required");
      expect(screen.queryByLabelText("Deviation multiplier")).not.toBeInTheDocument();
    });
  });

  describe("sensitivity inputs", () => {
    it("updates the deviation multiplier and sliding window as they are adjusted", async () => {
      await renderLoaded();

      fireEvent.change(multiplier(), { target: { value: "4.2" } });
      fireEvent.change(windowSize(), { target: { value: "120" } });

      expect(multiplier()).toHaveValue(4.2);
      expect(windowSize()).toHaveValue(120);
    });

    it("declares the allowed range and step for each parameter", async () => {
      await renderLoaded();

      expect(multiplier()).toHaveAttribute("min", "0.1");
      expect(multiplier()).toHaveAttribute("max", "20");
      expect(multiplier()).toHaveAttribute("step", "0.1");
      expect(windowSize()).toHaveAttribute("min", "3");
      expect(windowSize()).toHaveAttribute("max", "1000");
      // No step attribute: the default step of 1 allows whole observations only.
      expect(windowSize()).not.toHaveAttribute("step");
    });

    it.each([
      ["multiplier below the minimum", multiplier, "0.05", "rangeUnderflow"],
      ["multiplier above the maximum", multiplier, "25", "rangeOverflow"],
      ["multiplier off the 0.1 step", multiplier, "2.55", "stepMismatch"],
      ["window below the minimum", windowSize, "2", "rangeUnderflow"],
      ["window above the maximum", windowSize, "1001", "rangeOverflow"],
      ["fractional window", windowSize, "20.5", "stepMismatch"],
    ] as const)("does not save a %s", async (_case, input, value, flag) => {
      await renderLoaded();

      fireEvent.change(input(), { target: { value } });
      expect(input().validity[flag]).toBe(true);
      fireEvent.click(screen.getByRole("button", { name: "Save tuning" }));

      expect(api.updateAnomalyTuning).not.toHaveBeenCalled();
    });

    it.each([
      ["0.1", "3"],
      ["20", "1000"],
    ])("saves values on the boundary (multiplier %s, window %s)", async (m, w) => {
      await renderLoaded();

      fireEvent.change(multiplier(), { target: { value: m } });
      fireEvent.change(windowSize(), { target: { value: w } });
      fireEvent.click(screen.getByRole("button", { name: "Save tuning" }));

      await waitFor(() =>
        expect(api.updateAnomalyTuning).toHaveBeenCalledWith(API_KEY, {
          deviationMultiplier: Number(m),
          slidingWindowSize: Number(w),
        })
      );
    });
  });

  describe("saving", () => {
    it("sends the adjusted profile and confirms the update", async () => {
      await renderLoaded();

      fireEvent.change(multiplier(), { target: { value: "3.7" } });
      fireEvent.change(windowSize(), { target: { value: "45" } });
      fireEvent.click(screen.getByRole("button", { name: "Save tuning" }));

      expect(await screen.findByText("Tuning profile updated.")).toBeInTheDocument();
      expect(api.updateAnomalyTuning).toHaveBeenCalledTimes(1);
      expect(api.updateAnomalyTuning).toHaveBeenCalledWith(API_KEY, {
        deviationMultiplier: 3.7,
        slidingWindowSize: 45,
      });
    });

    it("disables every action while a save is in flight, so it cannot be sent twice", async () => {
      let finish!: () => void;
      vi.mocked(api.updateAnomalyTuning).mockImplementation(
        () => new Promise((resolve) => (finish = () => resolve({ profile: profile() })))
      );
      await renderLoaded();

      fireEvent.click(screen.getByRole("button", { name: "Save tuning" }));

      expect(screen.getByRole("button", { name: "Save tuning" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Silence anomalies" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Remove" })).toBeDisabled();
      fireEvent.click(screen.getByRole("button", { name: "Save tuning" }));
      expect(api.updateAnomalyTuning).toHaveBeenCalledTimes(1);

      finish();
      await waitFor(() => expect(screen.getByRole("button", { name: "Save tuning" })).toBeEnabled());
    });

    it("keeps the edited values and shows the error when the save is rejected", async () => {
      vi.mocked(api.updateAnomalyTuning).mockRejectedValue(new Error("deviationMultiplier must be <= 20"));
      await renderLoaded();

      fireEvent.change(multiplier(), { target: { value: "6" } });
      fireEvent.click(screen.getByRole("button", { name: "Save tuning" }));

      expect(await screen.findByText("deviationMultiplier must be <= 20")).toBeInTheDocument();
      expect(multiplier()).toHaveValue(6);
    });
  });

  describe("temporary silences", () => {
    it("creates a silence for the upper-cased asset code and lists it", async () => {
      vi.mocked(api.createAnomalyTuningOverride).mockImplementation(async (_key, input) => ({
        override: override({ id: "ovr-2", asset_code: input.assetCode!, reason: input.reason }),
      }));
      await renderLoaded();

      const form = screen.getByText("Temporary silence").closest("form")!;
      fireEvent.change(within(form).getByLabelText("Asset code (* for all)"), { target: { value: "eurc" } });
      fireEvent.change(within(form).getByLabelText("Expires at"), { target: { value: "2026-11-24T18:30" } });
      fireEvent.change(within(form).getByLabelText("Reason"), { target: { value: "Issuer rotation" } });
      fireEvent.click(within(form).getByRole("button", { name: "Silence anomalies" }));

      expect(await screen.findByText("Temporary silence created.")).toBeInTheDocument();
      expect(api.createAnomalyTuningOverride).toHaveBeenCalledWith(API_KEY, {
        assetCode: "EURC",
        reason: "Issuer rotation",
        expiresAt: new Date("2026-11-24T18:30").toISOString(),
      });
      const items = within(screen.getByRole("list")).getAllByRole("listitem");
      expect(items).toHaveLength(2);
      expect(within(items[1]).getByText("EURC")).toBeInTheDocument();
      expect(within(form).getByLabelText("Reason")).toHaveValue("");
    });

    it("requires a reason (3-500 characters) and an expiry before a silence can be created", async () => {
      await renderLoaded();

      const form = screen.getByText("Temporary silence").closest("form")!;
      const reason = within(form).getByLabelText("Reason") as HTMLInputElement;
      // jsdom does not enforce minlength, so check what the browser enforces.
      expect(reason).toBeRequired();
      expect(reason.minLength).toBe(3);
      expect(reason.maxLength).toBe(500);
      expect(within(form).getByLabelText("Expires at")).toBeRequired();

      fireEvent.click(within(form).getByRole("button", { name: "Silence anomalies" }));
      expect(reason.validity.valueMissing).toBe(true);
      expect(api.createAnomalyTuningOverride).not.toHaveBeenCalled();
    });

    it("removes a silence", async () => {
      await renderLoaded();

      fireEvent.click(screen.getByRole("button", { name: "Remove" }));

      await waitFor(() => expect(screen.queryByText("Active silences")).not.toBeInTheDocument());
      expect(api.deleteAnomalyTuningOverride).toHaveBeenCalledWith(API_KEY, "ovr-1");
    });

    it("keeps the silence listed when removal fails", async () => {
      vi.mocked(api.deleteAnomalyTuningOverride).mockRejectedValue(new Error("Override not found"));
      await renderLoaded();

      fireEvent.click(screen.getByRole("button", { name: "Remove" }));

      expect(await screen.findByText("Override not found")).toBeInTheDocument();
      expect(status()).toHaveTextContent("Override not found");
      expect(screen.getByText("USDC")).toBeInTheDocument();
    });
  });
});
