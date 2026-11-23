import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import AssetLifecycleTimeline from "./AssetLifecycleTimeline";

const mockRecords = [
  {
    id: "record-1-aaaaaaaa",
    assetId: "USDC:GA5Z...",
    assetSymbol: "USDC",
    state: "ACTIVE" as const,
    previousState: "PROVISIONED" as const,
    reason: "Passed compliance audit.",
    triggeredBy: "operator-admin",
    metadata: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

const mockStats = {
  totalTransitions: 1,
  byState: { INITIALIZED: 0, PROVISIONED: 0, ACTIVE: 1, PAUSED: 0, DEPRECATED: 0, RETIRED: 0 },
  activeAssets: 1,
};

vi.mock("../services/api", () => ({
  getAssetLifecycleTimeline: vi.fn().mockResolvedValue({ records: mockRecords }),
  getAssetLifecycleStats: vi.fn().mockResolvedValue({ stats: mockStats }),
  recordAssetLifecycleTransition: vi.fn().mockResolvedValue({}),
}));

describe("AssetLifecycleTimeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the page heading", async () => {
    render(<AssetLifecycleTimeline />);
    expect(
      screen.getByRole("heading", { name: /Asset Lifecycle State Timeline/i })
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("USDC")).toBeInTheDocument());
  });

  it("renders fetched timeline records with their previous state and reason", async () => {
    render(<AssetLifecycleTimeline />);
    await waitFor(() => expect(screen.getByText("USDC")).toBeInTheDocument());
    expect(screen.getByText("(from PROVISIONED)")).toBeInTheDocument();
    expect(screen.getByText("Passed compliance audit.")).toBeInTheDocument();
  });

  it("renders the aggregate stats returned by the stats endpoint", async () => {
    render(<AssetLifecycleTimeline />);
    await waitFor(() => expect(screen.getByText("Total Transitions")).toBeInTheDocument());
    expect(screen.getByText("Active Assets")).toBeInTheDocument();
  });

  it("shows an empty state message when there are no records", async () => {
    const api = await import("../services/api");
    (api.getAssetLifecycleTimeline as any).mockResolvedValueOnce({ records: [] });

    render(<AssetLifecycleTimeline />);
    await waitFor(() =>
      expect(screen.getByText("No timeline records match current filters.")).toBeInTheDocument()
    );
  });

  it("shows an error message when loading the timeline fails", async () => {
    const api = await import("../services/api");
    (api.getAssetLifecycleTimeline as any).mockRejectedValueOnce(new Error("network down"));

    render(<AssetLifecycleTimeline />);
    await waitFor(() => expect(screen.getByText("network down")).toBeInTheDocument());
  });
});
