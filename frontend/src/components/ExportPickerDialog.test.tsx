import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ExportPickerDialog from "./ExportPickerDialog";
import * as api from "../services/api";

vi.mock("../services/api", () => ({
  requestExport: vi.fn(),
  getExportStatus: vi.fn(),
  generateExportDownloadLink: vi.fn(),
}));

describe("ExportPickerDialog", () => {
  const mockAssets = [
    {
      symbol: "USDC",
      name: "USD Coin",
      issuer: "GA5Z...",
      type: "credit_alphanum4",
      supply: 1000000,
      accountsCount: 500,
      paymentsCount: 1200,
    },
  ];

  const mockBridges = [
    {
      id: "stellar-eth-1",
      name: "Stellar-Ethereum Bridge",
      sourceChain: "Stellar",
      targetChain: "Ethereum",
      status: "healthy" as const,
      totalValueLocked: 15000000,
      mismatchPercentage: 0.05,
      lastChecked: new Date().toISOString(),
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("renders modal when open is true", () => {
    render(
      <ExportPickerDialog
        open={true}
        onClose={vi.fn()}
        availableAssets={mockAssets as any}
        availableBridges={mockBridges as any}
      />
    );

    expect(screen.getByRole("heading", { name: "Export data" })).toBeInTheDocument();
    expect(screen.getByText("File format")).toBeInTheDocument();
    expect(screen.getByText("Export scope")).toBeInTheDocument();
  });

  it("does not render when open is false", () => {
    render(
      <ExportPickerDialog
        open={false}
        onClose={vi.fn()}
        availableAssets={mockAssets as any}
        availableBridges={mockBridges as any}
      />
    );

    expect(screen.queryByRole("heading", { name: "Export data" })).not.toBeInTheDocument();
  });

  it("starts export and polls status", async () => {
    vi.mocked(api.requestExport).mockResolvedValueOnce({
      id: "export-123",
      format: "csv",
      data_type: "analytics",
      status: "completed",
      created_at: new Date().toISOString(),
      download_url: "https://example.com/export-123.csv",
    });
    vi.mocked(api.getExportStatus).mockResolvedValueOnce({
      id: "export-123",
      format: "csv",
      data_type: "analytics",
      status: "completed",
      created_at: new Date().toISOString(),
      download_url: "https://example.com/export-123.csv",
    });

    render(
      <ExportPickerDialog
        open={true}
        onClose={vi.fn()}
        availableAssets={mockAssets as any}
        availableBridges={mockBridges as any}
      />
    );

    const startBtn = screen.getByRole("button", { name: "Start export" });
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(api.requestExport).toHaveBeenCalled();
    });

    expect(await screen.findByRole("button", { name: "Stream download" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Direct download" })).toHaveAttribute(
      "href",
      "https://example.com/export-123.csv"
    );
  });
});
