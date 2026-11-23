import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import AssetExposureConcentration from "./AssetExposureConcentration";

describe("AssetExposureConcentration", () => {
  it("renders the page heading", () => {
    render(<AssetExposureConcentration />);
    expect(
      screen.getByRole("heading", { name: /Asset Exposure Concentration Dashboard/i })
    ).toBeInTheDocument();
  });

  it("renders chain, bridge, and custodian exposure sections", () => {
    render(<AssetExposureConcentration />);
    expect(screen.getByText("Chain Exposure Concentration")).toBeInTheDocument();
    expect(screen.getByText("Bridge TVL Concentration")).toBeInTheDocument();
    expect(screen.getByText("Custodian Holding Exposure")).toBeInTheDocument();
    expect(screen.getByText("Stellar")).toBeInTheDocument();
    expect(screen.getByText("Fireblocks")).toBeInTheDocument();
  });

  it("shows the HHI concentration score and risk level", () => {
    render(<AssetExposureConcentration />);
    expect(screen.getByText("2150")).toBeInTheDocument();
    expect(screen.getByText("MEDIUM RISK")).toBeInTheDocument();
  });

  it("updates the chain threshold input on change", () => {
    render(<AssetExposureConcentration />);
    const input = screen.getByDisplayValue("40") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "55" } });
    expect(input.value).toBe("55");
  });

  it("shows a confirmation after saving alert thresholds", () => {
    render(<AssetExposureConcentration />);
    fireEvent.click(screen.getByText("Save Alert Thresholds"));
    expect(screen.getByText("Alert rules updated!")).toBeInTheDocument();
  });
});
