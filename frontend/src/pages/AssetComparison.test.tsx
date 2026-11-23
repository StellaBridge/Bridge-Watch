import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import AssetComparison from "./AssetComparison";

const mockAssets = [
  { symbol: "USDC", name: "USD Coin", category: "stablecoin", health: { overallScore: 90, factors: {} as any, trend: "stable", lastUpdated: "2026-01-01T00:00:00.000Z" } },
  { symbol: "EURC", name: "Euro Coin", category: "stablecoin", health: { overallScore: 40, factors: {} as any, trend: "deteriorating", lastUpdated: "2026-01-01T00:00:00.000Z" } },
];

vi.mock("../hooks/useAssets", () => ({
  useAssetsWithHealth: vi.fn().mockReturnValue({
    data: mockAssets,
    isLoading: false,
    error: null,
  }),
}));

vi.mock("../hooks/useLocalStorageState", () => ({
  useLocalStorageState: (_key: string, defaultValue: unknown) => [defaultValue, vi.fn()],
}));

vi.mock("../services/api", () => ({
  getAssetMetadataBySymbol: vi.fn().mockResolvedValue({ category: "stablecoin" }),
  getAssetPrice: vi.fn().mockResolvedValue({ vwap: 1, lastUpdated: "2026-01-01T00:00:00.000Z", sources: [] }),
}));

describe("AssetComparison", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  const renderPage = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <AssetComparison />
      </QueryClientProvider>
    );

  it("renders the page heading", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: /Asset Comparison Matrix/i })).toBeInTheDocument();
  });

  it("renders the asset selector with both assets", () => {
    renderPage();
    expect(screen.getByText("USDC")).toBeInTheDocument();
    expect(screen.getByText("EURC")).toBeInTheDocument();
  });

  it("shows summary stats once an asset is selected", () => {
    renderPage();
    fireEvent.click(screen.getByText("USDC"));
    expect(screen.getByText("Assets Selected")).toBeInTheDocument();
    expect(screen.getByText("Average Health")).toBeInTheDocument();
  });

  it("does not show the clear-all control before anything is selected", () => {
    renderPage();
    expect(screen.queryByText("Clear all")).not.toBeInTheDocument();
  });

  it("clears the selection when Clear all is clicked", () => {
    renderPage();
    fireEvent.click(screen.getByText("USDC"));
    expect(screen.getByText("Clear all")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Clear all"));
    expect(screen.queryByText("Clear all")).not.toBeInTheDocument();
  });
});
