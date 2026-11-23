import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { render } from "../../../test/utils";
import PriceSourceCoverageMatrix from "../PriceSourceCoverageMatrix";
import { getAssetPrice } from "../../../services/api";

vi.mock("../../../services/api", () => ({ getAssetPrice: vi.fn() }));

type PriceResponse = Awaited<ReturnType<typeof getAssetPrice>>;

function price(symbol: string, sources: string[]): NonNullable<PriceResponse> {
  return {
    symbol,
    vwap: 1,
    deviation: 0,
    lastUpdated: "2026-05-01T00:00:00.000Z",
    sources: sources.map((source) => ({
      source,
      price: 1,
      timestamp: "2026-05-01T00:00:00.000Z",
    })),
  };
}

/** Resolves each symbol to the sources listed for it; unknown symbols get no data. */
function mockPrices(sourcesBySymbol: Record<string, string[] | null>) {
  vi.mocked(getAssetPrice).mockImplementation(async (symbol: string) => {
    const sources = sourcesBySymbol[symbol];
    return sources ? price(symbol, sources) : null;
  });
}

const SOURCE_LABELS = ["Stellar DEX", "Stellar AMM", "Circle", "Coinbase"];

function covered(symbol: string, source: string) {
  return screen.getByLabelText(`${symbol} covered by ${source}`);
}

function notCovered(symbol: string, source: string) {
  return screen.getByLabelText(`${symbol} not covered by ${source}`);
}

/** Wait until the table has stopped showing loading placeholders. */
async function loaded() {
  await waitFor(() => expect(screen.queryAllByText("…")).toHaveLength(0));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PriceSourceCoverageMatrix (#1699)", () => {
  describe("without assets", () => {
    it("shows a prompt and does not query any price", () => {
      render(<PriceSourceCoverageMatrix symbols={[]} />);

      expect(screen.getByText("Select assets above to see their price source coverage.")).toBeInTheDocument();
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
      expect(vi.mocked(getAssetPrice)).not.toHaveBeenCalled();
    });
  });

  describe("coverage grid", () => {
    it("renders a captioned table with a column per asset and a row per price source", async () => {
      mockPrices({ USDC: ["SDEX"], XLM: ["Coinbase"] });
      render(<PriceSourceCoverageMatrix symbols={["USDC", "XLM"]} />);
      await loaded();

      expect(screen.getByRole("table", { name: "Price source coverage by asset" })).toBeInTheDocument();
      expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
        "Source",
        "USDC",
        "XLM",
      ]);
      const rows = screen.getAllByRole("row").slice(1);
      expect(rows.map((row) => within(row).getAllByRole("cell")[0].textContent)).toEqual(SOURCE_LABELS);
    });

    it("marks which sources report for each asset", async () => {
      mockPrices({
        USDC: ["Stellar DEX", "Circle"],
        XLM: ["Stellar AMM", "Coinbase"],
      });
      render(<PriceSourceCoverageMatrix symbols={["USDC", "XLM"]} />);
      await loaded();

      expect(covered("USDC", "Stellar DEX")).toHaveTextContent("✓");
      expect(covered("USDC", "Circle")).toHaveTextContent("✓");
      expect(notCovered("USDC", "Stellar AMM")).toHaveTextContent("—");
      expect(notCovered("USDC", "Coinbase")).toHaveTextContent("—");

      expect(covered("XLM", "Stellar AMM")).toHaveTextContent("✓");
      expect(covered("XLM", "Coinbase")).toHaveTextContent("✓");
      expect(notCovered("XLM", "Stellar DEX")).toHaveTextContent("—");
      expect(notCovered("XLM", "Circle")).toHaveTextContent("—");
    });

    it("colors covered sources green and gaps grey", async () => {
      mockPrices({ USDC: ["Circle"] });
      render(<PriceSourceCoverageMatrix symbols={["USDC"]} />);
      await loaded();

      expect(covered("USDC", "Circle")).toHaveClass("text-green-400");
      expect(notCovered("USDC", "Coinbase")).toHaveClass("text-stellar-text-secondary");
    });

    it("reports every source as covered for a fully covered asset", async () => {
      mockPrices({ USDC: ["sdex", "amm", "circle", "coinbase"] });
      render(<PriceSourceCoverageMatrix symbols={["USDC"]} />);
      await loaded();

      for (const label of SOURCE_LABELS) {
        expect(covered("USDC", label)).toBeInTheDocument();
      }
      expect(screen.queryByLabelText(/not covered/)).not.toBeInTheDocument();
    });

    it("counts a source once however many quotes it reported", async () => {
      mockPrices({ USDC: ["Circle", "circle", "Circle API"] });
      render(<PriceSourceCoverageMatrix symbols={["USDC"]} />);
      await loaded();

      expect(screen.getAllByLabelText("USDC covered by Circle")).toHaveLength(1);
    });
  });

  describe("recognising source names", () => {
    it.each([
      ["sdex", "Stellar DEX"],
      ["SDEX", "Stellar DEX"],
      ["Stellar DEX", "Stellar DEX"],
      ["stellar_dex", "Stellar DEX"],
      ["amm", "Stellar AMM"],
      ["Stellar AMM", "Stellar AMM"],
      ["stellar_amm", "Stellar AMM"],
      ["Circle", "Circle"],
      ["circle-oracle", "Circle"],
      ["coinbase", "Coinbase"],
      ["Coinbase Pro", "Coinbase"],
      ["  coinbase  ", "Coinbase"],
    ])("treats %s as %s", async (reported, label) => {
      mockPrices({ USDC: [reported] });
      render(<PriceSourceCoverageMatrix symbols={["USDC"]} />);
      await loaded();

      expect(covered("USDC", label)).toBeInTheDocument();
      expect(screen.getAllByLabelText(/^USDC covered by/)).toHaveLength(1);
    });

    it.each([["Binance"], ["CoinGecko"], ["some-new-feed"], [""]])(
      "ignores the unsupported source %j",
      async (reported) => {
        mockPrices({ USDC: [reported] });
        render(<PriceSourceCoverageMatrix symbols={["USDC"]} />);
        await loaded();

        expect(screen.queryByLabelText(/^USDC covered by/)).not.toBeInTheDocument();
        expect(screen.getAllByLabelText(/^USDC not covered by/)).toHaveLength(SOURCE_LABELS.length);
      }
    );

    it("still shows the supported sources when unsupported ones are reported alongside", async () => {
      mockPrices({ USDC: ["Binance", "Circle", "CoinGecko"] });
      render(<PriceSourceCoverageMatrix symbols={["USDC"]} />);
      await loaded();

      expect(covered("USDC", "Circle")).toBeInTheDocument();
      expect(screen.getAllByLabelText(/^USDC covered by/)).toHaveLength(1);
      expect(screen.getAllByRole("row")).toHaveLength(1 + SOURCE_LABELS.length);
    });
  });

  describe("offline or unconfigured price sources", () => {
    it("shows every source as not covered when the asset reports no sources", async () => {
      mockPrices({ USDC: [] });
      render(<PriceSourceCoverageMatrix symbols={["USDC"]} />);
      await loaded();

      expect(screen.getAllByLabelText(/^USDC not covered by/)).toHaveLength(SOURCE_LABELS.length);
      expect(screen.queryByLabelText(/^USDC covered by/)).not.toBeInTheDocument();
    });

    it("shows every source as not covered when the API has no price for the asset", async () => {
      mockPrices({ USDC: null });
      render(<PriceSourceCoverageMatrix symbols={["USDC"]} />);
      await loaded();

      expect(screen.getAllByLabelText(/^USDC not covered by/)).toHaveLength(SOURCE_LABELS.length);
    });

    it("shows every source as not covered when the price request fails", async () => {
      vi.mocked(getAssetPrice).mockRejectedValue(new Error("502"));
      render(<PriceSourceCoverageMatrix symbols={["USDC"]} />);
      await loaded();

      expect(screen.getAllByLabelText(/^USDC not covered by/)).toHaveLength(SOURCE_LABELS.length);
    });

    it("keeps working assets intact when another asset's request fails", async () => {
      vi.mocked(getAssetPrice).mockImplementation(async (symbol: string) => {
        if (symbol === "XLM") throw new Error("502");
        return price(symbol, ["Circle"]);
      });
      render(<PriceSourceCoverageMatrix symbols={["USDC", "XLM"]} />);
      await loaded();

      expect(covered("USDC", "Circle")).toBeInTheDocument();
      expect(notCovered("XLM", "Circle")).toBeInTheDocument();
    });
  });

  describe("loading", () => {
    it("shows a placeholder in every cell until the prices arrive", () => {
      vi.mocked(getAssetPrice).mockReturnValue(new Promise<never>(() => {}));
      render(<PriceSourceCoverageMatrix symbols={["USDC", "XLM"]} />);

      expect(screen.getAllByText("…")).toHaveLength(SOURCE_LABELS.length * 2);
      expect(screen.queryByLabelText(/covered by/)).not.toBeInTheDocument();
    });

    it("keeps showing placeholders for every asset until all prices have arrived", async () => {
      vi.mocked(getAssetPrice).mockImplementation((symbol: string) =>
        symbol === "USDC" ? Promise.resolve(price("USDC", ["Circle"])) : new Promise<never>(() => {})
      );
      render(<PriceSourceCoverageMatrix symbols={["USDC", "XLM"]} />);

      await waitFor(() => expect(vi.mocked(getAssetPrice)).toHaveBeenCalledTimes(2));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(screen.getAllByText("…")).toHaveLength(SOURCE_LABELS.length * 2);
      expect(screen.queryByLabelText("USDC covered by Circle")).not.toBeInTheDocument();
    });
  });

  describe("data fetching", () => {
    it("requests the price of each selected asset", async () => {
      mockPrices({ USDC: ["Circle"], XLM: ["Coinbase"], EURC: [] });
      render(<PriceSourceCoverageMatrix symbols={["USDC", "XLM", "EURC"]} />);
      await loaded();

      expect(vi.mocked(getAssetPrice).mock.calls.map(([symbol]) => symbol).sort()).toEqual([
        "EURC",
        "USDC",
        "XLM",
      ]);
    });

    it("does not request a price for an empty symbol", async () => {
      mockPrices({ USDC: ["Circle"] });
      render(<PriceSourceCoverageMatrix symbols={["USDC", ""]} />);
      await waitFor(() => expect(vi.mocked(getAssetPrice)).toHaveBeenCalled());

      expect(vi.mocked(getAssetPrice).mock.calls.map(([symbol]) => symbol)).toEqual(["USDC"]);
    });
  });
});
