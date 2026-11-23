import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { render } from "../../test/utils";
import Reconciliation from "../Reconciliation";
import * as api from "../../services/api";
import type {
  ReconciliationDriftSummary,
  ReconciliationDashboardResponse,
  ReconciliationMismatchDetail,
  ReconciliationRun,
} from "../../types";

vi.mock("../../services/api", () => ({
  getReconciliationDriftSummaries: vi.fn(),
  getReconciliationMismatchDetail: vi.fn(),
  updateReconciliationTriage: vi.fn(),
}));

vi.mock("../../components/DataCorrections", () => ({
  DataCorrections: () => null,
}));

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Line: () => <div />,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
}));

function run(overrides: Partial<ReconciliationRun> = {}): ReconciliationRun {
  return {
    id: "run-1",
    assetCode: "USDC",
    bridgeName: "Stellar-Ethereum",
    sourceChain: "ethereum",
    status: "mismatch",
    triageStatus: "open",
    triageOwner: null,
    triageNote: null,
    triagedAt: null,
    stellarSupply: 1_000_000,
    reportedSupply: 998_750,
    mismatchPercentage: 0.125,
    discrepancy: -1250,
    discrepancyAbs: 1250,
    severity: "high",
    startedAt: "2026-11-23T08:00:00Z",
    finishedAt: "2026-11-23T09:00:00Z",
    attempt: 1,
    jobId: null,
    error: null,
    sourceData: [],
    ...overrides,
  };
}

function summary(id: string, runOverrides: Partial<ReconciliationRun>): ReconciliationDriftSummary {
  const latestRun = run({ id, ...runOverrides });
  return {
    id: `summary-${id}`,
    assetCode: latestRun.assetCode,
    bridgeName: latestRun.bridgeName,
    sourceChain: latestRun.sourceChain,
    latestRun,
    previousRunId: null,
    severity: latestRun.severity,
    trendDirection: "worsening",
    unresolved: latestRun.triageStatus === "open",
    mismatchDelta: 0.05,
    runCount: 2,
    mismatchRunCount: 1,
    firstSeenAt: "2026-11-01T00:00:00Z",
    lastSeenAt: latestRun.finishedAt ?? latestRun.startedAt,
    history: [{
      id: latestRun.id,
      startedAt: latestRun.startedAt,
      mismatchPercentage: latestRun.mismatchPercentage,
      status: latestRun.status,
      triageStatus: latestRun.triageStatus,
    }],
  };
}

const summaries = [
  summary("run-1", {}),
  summary("run-2", { id: "run-2", assetCode: "USDT", triageStatus: "investigating", discrepancyAbs: 500 }),
  summary("run-3", { id: "run-3", assetCode: "DAI", triageStatus: "resolved", discrepancyAbs: 80 }),
];

const dashboard = (): ReconciliationDashboardResponse => ({
  generatedAt: "2026-11-23T10:00:00Z",
  filters: { assetCode: null, bridge: null, range: "7d", startDate: null, endDate: null },
  totals: { summaries: summaries.length, unresolved: 1, critical: 0, mismatchRuns: 2 },
  availableFilters: { assets: ["USDC", "USDT", "DAI"], bridges: ["Stellar-Ethereum"], ranges: ["24h", "7d", "30d", "90d"] },
  summaries,
});

const detail = (): ReconciliationMismatchDetail => ({
  generatedAt: "2026-11-23T10:00:00Z",
  mismatch: run(),
  history: [run()],
  sourceData: [{
    id: "on-chain",
    label: "On-chain supply",
    source: "stellar",
    value: 1_000_000,
    unit: "USDC",
    observedAt: "2026-11-23T08:30:00Z",
    status: "ok",
    reference: "tx-source-123456789",
    details: {},
  }],
  reserveCommitment: {
    bridgeId: "bridge-1",
    sequence: 42,
    merkleRoot: "merkle-root",
    totalReserves: 1_000_000,
    status: "active",
    verificationStatus: "verified",
    txHash: "tx-reserve-987654321",
    committedAt: "2026-11-23T08:30:00Z",
    committedLedger: 12345,
    updatedAt: null,
  },
});

function driftTable() {
  return screen.getAllByRole("table")[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getReconciliationDriftSummaries).mockResolvedValue(dashboard());
  vi.mocked(api.getReconciliationMismatchDetail).mockResolvedValue(detail());
  vi.mocked(api.updateReconciliationTriage).mockResolvedValue({ run: run() });
});

describe("Reconciliation (#1686)", () => {
  it("renders the discrepancy overview table with delta amounts and currencies", async () => {
    render(<Reconciliation />);
    expect(await screen.findByRole("columnheader", { name: "Delta" })).toBeInTheDocument();

    const headers = within(driftTable()).getAllByRole("columnheader").map((header) => header.textContent);
    expect(headers).toEqual(["Pair", "Severity", "Mismatch", "Delta", "Trend", "Triage", "Last seen"]);

    const rows = within(driftTable()).getAllByRole("row");
    expect(within(rows[1]).getByText("1,250 USDC")).toBeInTheDocument();
    expect(within(rows[1]).getByText("0.125%")).toBeInTheDocument();
    expect(within(rows[2]).getByText("500 USDT")).toBeInTheDocument();
  });

  it("filters discrepancies by status (Open, Under Investigation, Resolved)", async () => {
    render(<Reconciliation />);
    await screen.findByText("1,250 USDC");
    const statusFilter = screen.getAllByLabelText("Status")[0];

    fireEvent.change(statusFilter, { target: { value: "open" } });
    await waitFor(() => expect(within(driftTable()).queryByText("500 USDT")).toBeNull());
    expect(within(driftTable()).getByText("1,250 USDC")).toBeInTheDocument();

    fireEvent.change(statusFilter, { target: { value: "investigating" } });
    await waitFor(() => expect(within(driftTable()).getByText("500 USDT")).toBeInTheDocument());
    expect(within(driftTable()).queryByText("1,250 USDC")).toBeNull();
    expect(within(driftTable()).queryByText("80 DAI")).toBeNull();

    fireEvent.change(statusFilter, { target: { value: "resolved" } });
    await waitFor(() => expect(within(driftTable()).getByText("80 DAI")).toBeInTheDocument());
    expect(within(driftTable()).queryByText("500 USDT")).toBeNull();
  });

  it("opens the detail modal with transaction event links", async () => {
    render(<Reconciliation />);
    await screen.findByText("1,250 USDC");

    fireEvent.click(screen.getByRole("button", { name: "View details" }));

    const dialog = screen.getByRole("dialog", { name: "Reconciliation detail" });
    expect(within(dialog).getByRole("link", { name: /Reserve commitment transaction/ }))
      .toHaveAttribute("href", "https://stellar.expert/explorer/public/tx/tx-reserve-987654321");
    expect(within(dialog).getByRole("link", { name: /On-chain supply event/ }))
      .toHaveAttribute("href", "https://stellar.expert/explorer/public/tx/tx-source-123456789");

    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("requires an audit justification before marking a discrepancy as resolved", async () => {
    render(<Reconciliation />);
    await screen.findByText("1,250 USDC");
    const form = screen.getByRole("form", { name: "Reconciliation triage" });

    fireEvent.change(within(form).getByLabelText("Status"), { target: { value: "resolved" } });
    fireEvent.click(within(form).getByRole("button", { name: "Save triage" }));

    expect(within(form).getByRole("alert")).toHaveTextContent("An audit note is required");
    expect(api.updateReconciliationTriage).not.toHaveBeenCalled();

    fireEvent.change(within(form).getByLabelText("Note"), {
      target: { value: "Verified against reserve attestation" },
    });
    fireEvent.click(within(form).getByRole("button", { name: "Save triage" }));

    await waitFor(() => expect(api.updateReconciliationTriage).toHaveBeenCalledWith("run-1", {
      status: "resolved",
      owner: null,
      note: "Verified against reserve attestation",
    }));
  });
});
