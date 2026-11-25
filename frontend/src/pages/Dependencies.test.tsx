import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { render } from "../test/utils";
import Dependencies from "./Dependencies";

const mocks = vi.hoisted(() => ({
  getDependencyGraph: vi.fn().mockResolvedValue({
    summary: { totalNodes: 2, degradedServices: 1, downServices: 0 },
    nodes: [
      { id: "bridge", label: "Stellar Bridge", description: "Bridge service", type: "bridge", status: "healthy", impactHint: "Transfers continue" },
      { id: "rpc", label: "Stellar RPC", description: "RPC service", type: "rpc", status: "degraded", impactHint: "Higher latency" },
    ],
    edges: [{ from: "bridge", to: "rpc", kind: "depends_on" }],
  }),
}));
vi.mock("../services/api", () => mocks);

describe("Dependencies", () => {
  it("loads the dependency graph and supports list filtering", async () => {
    render(<Dependencies />);
    expect(await screen.findByRole("heading", { name: "Service Dependency Graph" })).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "List" }));
    expect(screen.getByText("Stellar Bridge")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Service status"), { target: { value: "degraded" } });
    await waitFor(() => expect(mocks.getDependencyGraph).toHaveBeenCalledWith({ type: undefined, status: "degraded", search: undefined }));
  });

  it("shows an API error", async () => {
    mocks.getDependencyGraph.mockRejectedValueOnce(new Error("backend unavailable"));
    render(<Dependencies />);
    expect(await screen.findByText("backend unavailable")).toBeInTheDocument();
  });
});
