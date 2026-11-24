import {
  filterByFuzzyQuery,
  highlightSegments,
  levenshteinDistance,
  scoreFuzzyMatch,
  tokenize,
  type FuzzySearchable,
} from "./fuzzySearch";

const BRIDGES: FuzzySearchable[] = [
  { name: "Harbor Bridge", assets: ["USDC"], destinationChains: ["Ethereum"] },
  { name: "Lantern Bridge", assets: ["USDC", "USDT"], destinationChains: ["Solana"] },
  { name: "Quay Bridge", assets: ["ETH", "WETH"], destinationChains: ["Base", "Ethereum"] },
  { name: "Beacon Bridge", assets: ["BTC"], destinationChains: ["Stellar"] },
];

const names = (items: FuzzySearchable[]) => items.map((item) => item.name);

describe("levenshteinDistance", () => {
  it("returns 0 for identical strings and the other length for an empty side", () => {
    expect(levenshteinDistance("usdc", "usdc")).toBe(0);
    expect(levenshteinDistance("", "abc")).toBe(3);
    expect(levenshteinDistance("abc", "")).toBe(3);
  });

  it("counts single-character edits", () => {
    expect(levenshteinDistance("kitten", "sitting")).toBe(3);
    expect(levenshteinDistance("usdc", "usdx")).toBe(1);
  });
});

describe("tokenize", () => {
  it("lowercases and splits on non-alphanumeric characters", () => {
    expect(tokenize("USDC/ETH  (v2)")).toEqual(["usdc", "eth", "v2"]);
  });

  it("returns no tokens for blank input", () => {
    expect(tokenize("   ")).toEqual([]);
  });
});

describe("scoreFuzzyMatch", () => {
  it("scores an exact token match highest", () => {
    expect(scoreFuzzyMatch("usdc", ["USDC"])).toBe(3);
  });

  it("accepts a typo within the budget for the token length", () => {
    expect(scoreFuzzyMatch("usdx", ["USDC"])).toBe(1);
  });

  it("rejects a typo when the token is too short to allow one", () => {
    expect(scoreFuzzyMatch("eth", ["ETX"])).toBe(0);
  });

  it("maps symbol aliases to their canonical symbol", () => {
    expect(scoreFuzzyMatch("ether", ["ETH"])).toBe(3);
    expect(scoreFuzzyMatch("wbtc", ["BTC"])).toBe(3);
  });

  it("requires every query token to match", () => {
    expect(scoreFuzzyMatch("usdc stellar", ["USDC", "Ethereum"])).toBe(0);
  });
});

describe("filterByFuzzyQuery", () => {
  it("returns every item, in order, for an empty query", () => {
    const result = filterByFuzzyQuery(BRIDGES, "   ");
    expect(names(result)).toEqual(names(BRIDGES));
    expect(result).not.toBe(BRIDGES);
  });

  it("tolerates a typo in a token symbol", () => {
    expect(names(filterByFuzzyQuery(BRIDGES, "usdx"))).toEqual([
      "Harbor Bridge",
      "Lantern Bridge",
    ]);
  });

  it("tolerates a typo in a bridge name", () => {
    expect(names(filterByFuzzyQuery(BRIDGES, "harbr"))).toEqual(["Harbor Bridge"]);
  });

  it("matches symbol aliases such as ether for ETH", () => {
    // ETH on Quay ranks first. Ethereum as a destination is a prefix match.
    expect(names(filterByFuzzyQuery(BRIDGES, "ether"))).toEqual([
      "Quay Bridge",
      "Harbor Bridge",
    ]);
  });

  it("matches a corridor query across asset and destination chain", () => {
    expect(names(filterByFuzzyQuery(BRIDGES, "usdc eth"))).toEqual(["Harbor Bridge"]);
  });

  it("matches bridge names and keeps original order for equal scores", () => {
    expect(names(filterByFuzzyQuery(BRIDGES, "bridge"))).toEqual(names(BRIDGES));
  });

  it("returns nothing when no field matches", () => {
    expect(filterByFuzzyQuery(BRIDGES, "zzzz")).toEqual([]);
  });

  it("filters a list of 150 bridges without losing matches", () => {
    const many: FuzzySearchable[] = Array.from({ length: 150 }, (_, i) => ({
      name: `Relay ${i}`,
      assets: [i % 2 === 0 ? "USDC" : "EURC"],
      destinationChains: ["Stellar"],
    }));
    const result = filterByFuzzyQuery(many, "eurc relay 7");
    expect(names(result)).toEqual(["Relay 7"]);
  });
});

describe("highlightSegments", () => {
  it("marks each exact token occurrence case-insensitively", () => {
    expect(highlightSegments("USDC / ETH", "usdc eth")).toEqual([
      { text: "USDC", matched: true },
      { text: " / ", matched: false },
      { text: "ETH", matched: true },
    ]);
  });

  it("returns one unmatched segment when nothing matches", () => {
    expect(highlightSegments("Harbor", "zzz")).toEqual([{ text: "Harbor", matched: false }]);
  });

  it("returns no segments for empty text", () => {
    expect(highlightSegments("", "usdc")).toEqual([]);
  });

  it("merges overlapping token occurrences into one segment", () => {
    expect(highlightSegments("usdc", "usd usdc")).toEqual([{ text: "usdc", matched: true }]);
  });
});
