import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { render } from "../test/utils";
import DataQualityScoring from "./DataQualityScoring";

describe("DataQualityScoring", () => {
  it("renders every data source and dimension score", () => {
    render(<DataQualityScoring />);
    expect(screen.getByRole("heading", { name: /Configurable Data Quality Scoring/ })).toBeInTheDocument();
    expect(screen.getByText("Stellar Horizon API")).toBeInTheDocument();
    expect(screen.getByText("Ethereum Alchemy RPC")).toBeInTheDocument();
    expect(screen.getByText("CoinGecko Price Oracle")).toBeInTheDocument();
    expect(screen.getAllByText("Freshness").length).toBeGreaterThan(0);
  });

  it("updates a weighting and confirms the saved state", () => {
    render(<DataQualityScoring />);
    const sliders = screen.getAllByRole("slider");
    fireEvent.change(sliders[0], { target: { value: "40" } });
    expect(screen.getByText("Freshness (40%)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save Quality Weights" }));
    expect(screen.getByText("Quality dimension weights updated!")).toBeInTheDocument();
  });
});
