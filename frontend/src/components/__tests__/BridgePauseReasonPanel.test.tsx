import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen } from "@testing-library/react";
import { render } from "../../test/utils";
import BridgePauseReasonPanel from "../BridgePauseReasonPanel";
import { getCircuitState, type CircuitStateResponse } from "../../services/api";

vi.mock("../../services/api", () => ({ getCircuitState: vi.fn() }));

const SINCE = 1_700_000_000;
const DEADLINE = 1_700_086_400;

function circuitState(overrides: Partial<CircuitStateResponse> = {}): CircuitStateResponse {
  return {
    scope: "bridge",
    identifier: "Allbridge",
    level: "full",
    isPaused: true,
    triggeredBy: "guardian-1",
    triggerReason: "Reserve mismatch",
    timestamp: SINCE,
    recoveryDeadline: DEADLINE,
    guardianApprovals: 1,
    guardianThreshold: 3,
    status: "paused",
    ...overrides,
  };
}

/** Lets the query resolve and React Query publish the result. */
async function settle() {
  for (let i = 0; i < 3; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function renderPanel(state: CircuitStateResponse | null, bridgeName = "Allbridge") {
  vi.mocked(getCircuitState).mockResolvedValue(state);
  const view = render(<BridgePauseReasonPanel bridgeName={bridgeName} />);
  await settle();
  return view;
}

const formatted = (unixSeconds: number) => new Date(unixSeconds * 1000).toLocaleString();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("BridgePauseReasonPanel (#1696)", () => {
  describe("when the bridge is paused", () => {
    it("renders a labelled region with the pause heading", async () => {
      await renderPanel(circuitState());

      const region = screen.getByRole("region", { name: "Bridge Paused" });
      expect(region).toBeInTheDocument();
      expect(screen.getByRole("heading", { level: 2, name: "Bridge Paused" })).toBeInTheDocument();
    });

    it("shows the circuit-breaker level and the trigger reason", async () => {
      await renderPanel(circuitState({ level: "full", triggerReason: "Reserve mismatch" }));

      expect(screen.getByRole("region", { name: "Bridge Paused" })).toHaveTextContent(
        "Full: Reserve mismatch"
      );
    });

    it.each([
      ["none", "None"],
      ["warning", "Warning"],
      ["partial", "Partial"],
      ["full", "Full"],
    ])("labels the %s level as %s", async (level, label) => {
      await renderPanel(circuitState({ level }));

      expect(screen.getByText(label)).toBeInTheDocument();
    });

    it("shows an unrecognised level exactly as the API sent it", async () => {
      await renderPanel(circuitState({ level: "oracle_delay" }));

      expect(screen.getByText("oracle_delay")).toBeInTheDocument();
    });

    it.each([
      ["Oracle delay exceeded 15 minutes"],
      ["Reserve mismatch above threshold"],
    ])("renders the trigger reason %s", async (reason) => {
      await renderPanel(circuitState({ triggerReason: reason }));

      expect(screen.getByRole("region", { name: "Bridge Paused" })).toHaveTextContent(`: ${reason}`);
    });

    it("says no reason was recorded when the trigger reason is missing", async () => {
      await renderPanel(circuitState({ level: "warning", triggerReason: null }));

      expect(screen.getByRole("region", { name: "Bridge Paused" })).toHaveTextContent(
        "Warning — no reason recorded"
      );
    });

    it("says no reason was recorded when the trigger reason is empty", async () => {
      await renderPanel(circuitState({ triggerReason: "" }));

      expect(screen.getByText(/no reason recorded/)).toBeInTheDocument();
    });

    it("shows who triggered the pause", async () => {
      await renderPanel(circuitState({ triggeredBy: "guardian-7" }));

      expect(screen.getByText("Triggered by guardian-7")).toBeInTheDocument();
    });

    it("shows when the pause began and the recovery deadline, as local date-times", async () => {
      await renderPanel(circuitState());

      expect(screen.getByText(`Since ${formatted(SINCE)}`)).toBeInTheDocument();
      expect(screen.getByText(`Recovery deadline ${formatted(DEADLINE)}`)).toBeInTheDocument();
    });

    it("leaves out the details that were not reported", async () => {
      await renderPanel(
        circuitState({ triggeredBy: null, timestamp: null, recoveryDeadline: null })
      );

      expect(screen.queryByText(/Triggered by/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Since/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Recovery deadline/)).not.toBeInTheDocument();
      // The reason itself is still shown.
      expect(screen.getByRole("region", { name: "Bridge Paused" })).toHaveTextContent("Reserve mismatch");
    });

    it("still shows a timestamp of zero rather than treating it as missing", async () => {
      await renderPanel(circuitState({ timestamp: 0, recoveryDeadline: 0 }));

      expect(screen.getByText(`Since ${formatted(0)}`)).toBeInTheDocument();
      expect(screen.getByText(`Recovery deadline ${formatted(0)}`)).toBeInTheDocument();
    });
  });

  describe("when the bridge is operational", () => {
    it("renders nothing", async () => {
      await renderPanel(circuitState({ isPaused: false, level: "none", triggerReason: null }));

      expect(vi.mocked(getCircuitState)).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("region")).not.toBeInTheDocument();
      expect(screen.queryByText("Bridge Paused")).not.toBeInTheDocument();
    });

    it("renders nothing when the API has no circuit state for the bridge", async () => {
      await renderPanel(null);

      expect(vi.mocked(getCircuitState)).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("region")).not.toBeInTheDocument();
    });

    it("renders nothing when the request fails", async () => {
      vi.mocked(getCircuitState).mockRejectedValue(new Error("503"));
      render(<BridgePauseReasonPanel bridgeName="Allbridge" />);
      await settle();

      expect(vi.mocked(getCircuitState)).toHaveBeenCalled();
      expect(screen.queryByRole("region")).not.toBeInTheDocument();
    });

    it("renders nothing while the state is still loading", async () => {
      vi.mocked(getCircuitState).mockReturnValue(new Promise<never>(() => {}));
      render(<BridgePauseReasonPanel bridgeName="Allbridge" />);
      await settle();

      expect(vi.mocked(getCircuitState)).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("region")).not.toBeInTheDocument();
    });
  });

  describe("data fetching", () => {
    it("asks for the circuit state of the named bridge", async () => {
      await renderPanel(circuitState({ identifier: "Wormhole" }), "Wormhole");

      expect(vi.mocked(getCircuitState)).toHaveBeenCalledWith("bridge", "Wormhole");
    });

    it("does not fetch, and renders nothing, without a bridge name", async () => {
      await renderPanel(circuitState(), "");

      expect(vi.mocked(getCircuitState)).not.toHaveBeenCalled();
      expect(screen.queryByRole("region")).not.toBeInTheDocument();
    });
  });
});
