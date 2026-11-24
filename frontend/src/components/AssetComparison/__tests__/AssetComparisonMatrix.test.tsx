import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import AssetComparisonMatrix from "../AssetComparisonMatrix";
import type { AssetWithHealth } from "../../../types";

function asset(
  symbol: string,
  name: string,
  health: AssetWithHealth["health"]
): AssetWithHealth {
  return { symbol, name, category: null, health };
}

function health(
  overallScore: number,
  trend: "improving" | "stable" | "deteriorating",
  factors: [number, number, number, number, number]
): NonNullable<AssetWithHealth["health"]> {
  const [liquidityDepth, priceStability, bridgeUptime, reserveBacking, volumeTrend] = factors;
  return {
    overallScore,
    trend,
    lastUpdated: "2026-05-01T00:00:00.000Z",
    factors: { liquidityDepth, priceStability, bridgeUptime, reserveBacking, volumeTrend },
  };
}

// Columns: Health, Liquidity, Price Stab., Uptime, Reserves, Volume
const USDC = asset("USDC", "USD Coin", health(92, "improving", [95, 90, 99, 85, 70]));
const XLM = asset("XLM", "Stellar Lumens", health(61, "stable", [40, 65, 80, 50, 49]));
const EURC = asset("EURC", "Euro Coin", health(35, "deteriorating", [20, 79, 55, 30, 88]));
const WBTC = asset("WBTC", "Wrapped BTC", null);
const ASSETS = [XLM, WBTC, EURC, USDC];

function renderMatrix(assets: AssetWithHealth[] = ASSETS, filter = "") {
  return render(<AssetComparisonMatrix assets={assets} filter={filter} />);
}

/** Symbols in the order the rows are displayed. */
function rowSymbols(): Array<string | null | undefined> {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => row.querySelector("span.font-mono")?.textContent);
}

function rowFor(symbol: string): HTMLElement {
  const row = screen
    .getAllByRole("row")
    .find((r) => r.querySelector("span.font-mono")?.textContent === symbol);
  if (!row) throw new Error(`no row for ${symbol}`);
  return row;
}

/** Value cell of a row; index 0 is the asset, then Health, Liquidity, … Volume, Trend. */
function cell(symbol: string, index: number): HTMLElement {
  return within(rowFor(symbol)).getAllByRole("cell")[index];
}

function sortButton(label: RegExp | string): HTMLElement {
  return within(screen.getByRole("columnheader", { name: label })).getByRole("button");
}

function columnToggle(label: string): HTMLElement {
  const group = screen.getByText("Columns:").parentElement as HTMLElement;
  return within(group).getByRole("button", { name: label });
}

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AssetComparisonMatrix (#1692)", () => {
  describe("rendering", () => {
    it("shows a prompt instead of a table when no assets are selected", () => {
      renderMatrix([]);

      expect(screen.getByText("Select assets above to see the comparison matrix.")).toBeInTheDocument();
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
    });

    it("renders one row per selected asset with its code and name", () => {
      renderMatrix();

      expect(screen.getByRole("table", { name: "Asset comparison matrix" })).toBeInTheDocument();
      expect(screen.getAllByRole("row")).toHaveLength(1 + ASSETS.length);
      const usdc = within(rowFor("USDC"));
      expect(usdc.getByText("USDC")).toBeInTheDocument();
      expect(usdc.getByText("USD Coin")).toBeInTheDocument();
    });

    it("renders a header for every metric column", () => {
      renderMatrix();

      const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
      expect(headers.map((h) => h?.replace(/[↑↓]/g, ""))).toEqual([
        "Asset",
        "Health",
        "Liquidity",
        "Price Stab.",
        "Uptime",
        "Reserves",
        "Volume",
        "Trend",
      ]);
    });

    it("shows each metric score for the asset", () => {
      renderMatrix();

      expect(
        within(rowFor("USDC"))
          .getAllByRole("cell")
          .slice(1, 6)
          .map((c) => c.textContent)
      ).toEqual(["92", "95", "90", "99", "85"]);
      expect(cell("USDC", 6)).toHaveTextContent("70");
    });

    it("shows scores as plain 0–100 numbers, not as percentages or currency", () => {
      renderMatrix();

      expect(cell("USDC", 1).textContent).toBe("92");
      expect(screen.getByText(/scores 0–100/)).toBeInTheDocument();
      expect(screen.queryByText(/%|\$/)).not.toBeInTheDocument();
    });

    it("shows a dash for every metric of an asset without health data", () => {
      renderMatrix();

      const cells = within(rowFor("WBTC")).getAllByRole("cell");
      expect(cells.slice(1, 7).map((c) => c.textContent)).toEqual(["—", "—", "—", "—", "—", "—"]);
      expect(cells[7]).toHaveTextContent("— —");
    });

    it("shows an arrow and the word for each trend direction", () => {
      renderMatrix();

      expect(cell("USDC", 7)).toHaveTextContent("↑ improving");
      expect(cell("XLM", 7)).toHaveTextContent("→ stable");
      expect(cell("EURC", 7)).toHaveTextContent("↓ deteriorating");
    });

    it("colors the trend by direction", () => {
      renderMatrix();

      expect(cell("USDC", 7).querySelector("span")).toHaveClass("text-green-400");
      expect(cell("XLM", 7).querySelector("span")).toHaveClass("text-yellow-400");
      expect(cell("EURC", 7).querySelector("span")).toHaveClass("text-red-400");
    });
  });

  describe("score highlighting", () => {
    const scoreSpan = (symbol: string, index: number) =>
      cell(symbol, index).querySelector("span") as HTMLElement;

    it("colors a score green from 80, yellow from 50, red below 50", () => {
      renderMatrix();

      expect(scoreSpan("USDC", 1)).toHaveClass("text-green-400"); // 92
      expect(scoreSpan("XLM", 1)).toHaveClass("text-yellow-400"); // 61
      expect(scoreSpan("EURC", 1)).toHaveClass("text-red-400"); // 35
    });

    it("puts the 80 and 50 boundaries in the higher band", () => {
      renderMatrix();

      expect(scoreSpan("XLM", 4)).toHaveClass("text-green-400"); // uptime 80
      expect(scoreSpan("EURC", 2)).toHaveClass("text-red-400"); // liquidity 20
      expect(scoreSpan("XLM", 5)).toHaveClass("text-yellow-400"); // reserves 50
    });

    it("puts 79 and 49 in the lower band", () => {
      renderMatrix();

      expect(scoreSpan("EURC", 3)).toHaveClass("text-yellow-400"); // stability 79
      expect(scoreSpan("XLM", 6)).toHaveClass("text-red-400"); // volume 49
    });

    it("greys out a missing score", () => {
      renderMatrix();

      expect(scoreSpan("WBTC", 1)).toHaveClass("text-stellar-text-secondary");
    });
  });

  describe("sorting", () => {
    it("starts sorted by health, highest first, with assets lacking health last", () => {
      renderMatrix();

      expect(rowSymbols()).toEqual(["USDC", "XLM", "EURC", "WBTC"]);
      expect(sortButton(/^Health/)).toHaveAttribute("aria-sort", "descending");
      expect(sortButton(/^Health/)).toHaveTextContent("↓");
    });

    it("reverses the order when the sorted column is clicked again", () => {
      renderMatrix();

      fireEvent.click(sortButton(/^Health/));
      expect(rowSymbols()).toEqual(["EURC", "XLM", "USDC", "WBTC"]);
      expect(sortButton(/^Health/)).toHaveAttribute("aria-sort", "ascending");
      expect(sortButton(/^Health/)).toHaveTextContent("↑");

      fireEvent.click(sortButton(/^Health/));
      expect(rowSymbols()).toEqual(["USDC", "XLM", "EURC", "WBTC"]);
      expect(sortButton(/^Health/)).toHaveAttribute("aria-sort", "descending");
    });

    it("sorts a newly chosen column highest first, then lowest first", () => {
      renderMatrix();

      fireEvent.click(sortButton(/^Liquidity/));
      expect(rowSymbols()).toEqual(["USDC", "XLM", "EURC", "WBTC"]);
      expect(sortButton(/^Liquidity/)).toHaveAttribute("aria-sort", "descending");

      fireEvent.click(sortButton(/^Liquidity/));
      expect(rowSymbols()).toEqual(["EURC", "XLM", "USDC", "WBTC"]);
      expect(sortButton(/^Liquidity/)).toHaveAttribute("aria-sort", "ascending");
    });

    it("marks only the sorted column", () => {
      renderMatrix();

      fireEvent.click(sortButton(/^Volume/));

      expect(sortButton(/^Volume/)).toHaveAttribute("aria-sort", "descending");
      expect(sortButton(/^Health/)).toHaveAttribute("aria-sort", "none");
      expect(sortButton(/^Liquidity/)).toHaveAttribute("aria-sort", "none");
    });

    it("sorts each numeric metric by its own values", () => {
      renderMatrix();

      fireEvent.click(sortButton(/^Volume/)); // EURC 88, USDC 70, XLM 49
      expect(rowSymbols()).toEqual(["EURC", "USDC", "XLM", "WBTC"]);

      fireEvent.click(sortButton(/^Price Stab\./)); // USDC 90, EURC 79, XLM 65
      expect(rowSymbols()).toEqual(["USDC", "EURC", "XLM", "WBTC"]);
    });

    it("sorts by asset code alphabetically", () => {
      renderMatrix();

      fireEvent.click(sortButton(/^Asset/));
      expect(rowSymbols()).toEqual(["XLM", "WBTC", "USDC", "EURC"]);

      fireEvent.click(sortButton(/^Asset/));
      expect(rowSymbols()).toEqual(["EURC", "USDC", "WBTC", "XLM"]);
    });

    it("sorts by trend name", () => {
      renderMatrix();

      fireEvent.click(sortButton(/^Trend/)); // first click: descending
      expect(rowSymbols()).toEqual(["XLM", "USDC", "EURC", "WBTC"]);

      fireEvent.click(sortButton(/^Trend/));
      expect(rowSymbols()).toEqual(["EURC", "USDC", "XLM", "WBTC"]);
    });

    it("keeps assets without health data last in both directions", () => {
      renderMatrix();

      fireEvent.click(sortButton(/^Uptime/));
      expect(rowSymbols()[ASSETS.length - 1]).toBe("WBTC");

      fireEvent.click(sortButton(/^Uptime/));
      expect(rowSymbols()[ASSETS.length - 1]).toBe("WBTC");
    });

    it("does not change the order of the assets it was given", () => {
      const input = [...ASSETS];
      renderMatrix(input);

      fireEvent.click(sortButton(/^Asset/));

      expect(input.map((a) => a.symbol)).toEqual(["XLM", "WBTC", "EURC", "USDC"]);
    });
  });

  describe("filtering", () => {
    it("keeps only assets whose code matches, ignoring case", () => {
      renderMatrix(ASSETS, "xl");

      expect(rowSymbols()).toEqual(["XLM"]);
    });

    it("also matches on the asset name", () => {
      renderMatrix(ASSETS, "coin");

      expect(rowSymbols()).toEqual(["USDC", "EURC"]);
    });

    it("explains when nothing matches, across the whole table width", () => {
      renderMatrix(ASSETS, "doge");

      const message = screen.getByText("No assets match your filter.");
      expect(message).toHaveAttribute("colspan", "8");
      expect(rowSymbols()).toEqual([undefined]);
    });

    it("counts the visible assets, singular and plural", () => {
      const { unmount } = renderMatrix(ASSETS, "xl");
      expect(screen.getByText(/^1 asset · scores 0–100$/)).toBeInTheDocument();
      unmount();

      renderMatrix(ASSETS);
      expect(screen.getByText(/^4 assets · scores 0–100$/)).toBeInTheDocument();
    });
  });

  describe("column visibility", () => {
    it("offers a pressed toggle for every column except the asset", () => {
      renderMatrix();

      for (const label of ["Health", "Liquidity", "Price Stab.", "Uptime", "Reserves", "Volume", "Trend"]) {
        expect(columnToggle(label)).toHaveAttribute("aria-pressed", "true");
      }
      expect(
        within(screen.getByText("Columns:").parentElement as HTMLElement).queryByRole("button", {
          name: "Asset",
        })
      ).not.toBeInTheDocument();
    });

    it("hides and restores a column", () => {
      renderMatrix();

      fireEvent.click(columnToggle("Volume"));
      expect(columnToggle("Volume")).toHaveAttribute("aria-pressed", "false");
      expect(screen.queryByRole("columnheader", { name: /^Volume/ })).not.toBeInTheDocument();
      expect(within(rowFor("USDC")).getAllByRole("cell")).toHaveLength(7);

      fireEvent.click(columnToggle("Volume"));
      expect(columnToggle("Volume")).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByRole("columnheader", { name: /^Volume/ })).toBeInTheDocument();
    });

    it("shrinks the empty-result row to the visible columns", () => {
      renderMatrix(ASSETS, "doge");

      fireEvent.click(columnToggle("Volume"));

      expect(screen.getByText("No assets match your filter.")).toHaveAttribute("colspan", "7");
    });

    it("always keeps at least two columns visible", () => {
      renderMatrix();

      for (const label of ["Health", "Liquidity", "Price Stab.", "Uptime", "Reserves", "Volume"]) {
        fireEvent.click(columnToggle(label));
      }
      expect(screen.getAllByRole("columnheader")).toHaveLength(2);

      // The last optional column cannot be hidden.
      fireEvent.click(columnToggle("Trend"));
      expect(columnToggle("Trend")).toHaveAttribute("aria-pressed", "true");
      expect(screen.getAllByRole("columnheader")).toHaveLength(2);
    });
  });

  describe("CSV export", () => {
    let blobs: Blob[];
    let revoked: string[];
    let downloads: string[];

    beforeEach(() => {
      blobs = [];
      revoked = [];
      downloads = [];
      URL.createObjectURL = vi.fn((blob: Blob | MediaSource) => {
        blobs.push(blob as Blob);
        return "blob:asset-comparison";
      });
      URL.revokeObjectURL = vi.fn((url: string) => {
        revoked.push(url);
      });
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
        this: HTMLAnchorElement
      ) {
        downloads.push(this.download);
      });
    });

    it("downloads every column for the assets in their current order", async () => {
      renderMatrix();

      fireEvent.click(screen.getByRole("button", { name: /Export CSV/ }));

      expect(downloads).toEqual(["asset-comparison.csv"]);
      expect(revoked).toEqual(["blob:asset-comparison"]);
      expect(blobs[0].type).toBe("text/csv");
      expect(await readBlob(blobs[0])).toBe(
        [
          "Asset,Health,Liquidity,Price Stab.,Uptime,Reserves,Volume,Trend",
          "USDC,92,95,90,99,85,70,improving",
          "XLM,61,40,65,80,50,49,stable",
          "EURC,35,20,79,55,30,88,deteriorating",
          "WBTC,,,,,,,",
        ].join("\n")
      );
    });

    it("exports the filtered and re-sorted rows, and columns hidden on screen too", async () => {
      renderMatrix();
      fireEvent.click(columnToggle("Volume"));
      fireEvent.click(sortButton(/^Asset/));

      fireEvent.click(screen.getByRole("button", { name: /Export CSV/ }));

      const csv = await readBlob(blobs[0]);
      expect(csv.split("\n")).toEqual([
        "Asset,Health,Liquidity,Price Stab.,Uptime,Reserves,Volume,Trend",
        "XLM,61,40,65,80,50,49,stable",
        "WBTC,,,,,,,",
        "USDC,92,95,90,99,85,70,improving",
        "EURC,35,20,79,55,30,88,deteriorating",
      ]);
    });

    it("exports only the rows that match the filter", async () => {
      renderMatrix(ASSETS, "usd");

      fireEvent.click(screen.getByRole("button", { name: /Export CSV/ }));

      expect((await readBlob(blobs[0])).split("\n")).toEqual([
        "Asset,Health,Liquidity,Price Stab.,Uptime,Reserves,Volume,Trend",
        "USDC,92,95,90,99,85,70,improving",
      ]);
    });
  });
});
