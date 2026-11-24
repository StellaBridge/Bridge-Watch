import { render } from "@testing-library/react";
import HighlightedMatchText from "./HighlightedMatchText";

describe("HighlightedMatchText", () => {
  it("wraps each matched token in a mark element and keeps the full text", () => {
    const { container } = render(<HighlightedMatchText text="USDC / ETH" query="usdc eth" />);

    const marks = Array.from(container.querySelectorAll("mark")).map((mark) => mark.textContent);
    expect(marks).toEqual(["USDC", "ETH"]);
    expect(container.textContent).toBe("USDC / ETH");
  });

  it("renders plain text without marks when nothing matches", () => {
    const { container } = render(<HighlightedMatchText text="Harbor" query="zzz" />);

    expect(container.querySelector("mark")).toBeNull();
    expect(container.textContent).toBe("Harbor");
  });
});
