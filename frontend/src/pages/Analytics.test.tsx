import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Analytics from "./Analytics";

vi.mock("../hooks/useAssets", () => ({
  useAssetsWithHealth: () => ({
    data: [
      {
        symbol: "USDC",
        name: "USD Coin",
        health: { overallScore: 88, trend: "stable" },
      },
      {
        symbol: "XLM",
        name: "Stellar",
        health: { overallScore: 73, trend: "improving" },
      },
    ],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock("../hooks/usePrices", () => ({
  usePricesForSymbols: (symbols: string[]) =>
    symbols.map((symbol) => ({
      data: {
        symbol,
        vwap: symbol === "USDC" ? 1.0 : 0.11,
        sources: [{ source: "sdex", price: 1, timestamp: "now" }],
        lastUpdated: "now",
      },
      isLoading: false,
      refetch: vi.fn(),
    })),
}));

describe("Analytics", () => {
  it("renders comparison cards for selected assets", () => {
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <Analytics />
      </QueryClientProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "USDC" }));
    fireEvent.click(screen.getByRole("button", { name: "XLM" }));

    expect(screen.getByRole("article", { name: "USDC comparison metrics" })).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "XLM comparison metrics" })).toBeInTheDocument();
    expect(screen.getByText("Select up to 3 assets for side-by-side comparison.")).toBeInTheDocument();
  });
});
