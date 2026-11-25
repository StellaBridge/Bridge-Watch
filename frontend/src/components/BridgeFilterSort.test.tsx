import type { ComponentProps } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import BridgeFilterSort from "./BridgeFilterSort";

function renderControls(overrides: Partial<ComponentProps<typeof BridgeFilterSort>> = {}) {
  const props = {
    statusFilter: "all",
    onStatusFilterChange: vi.fn(),
    sortBy: "name",
    onSortByChange: vi.fn(),
    ...overrides,
  };
  render(<BridgeFilterSort {...props} />);
  return props;
}

describe("BridgeFilterSort", () => {
  it("does not render the search input unless a change handler is given", () => {
    renderControls();
    expect(screen.queryByLabelText("Search:")).not.toBeInTheDocument();
  });

  it("reports typed search text through onSearchQueryChange", () => {
    const onSearchQueryChange = vi.fn();
    renderControls({ searchQuery: "", onSearchQueryChange });

    fireEvent.change(screen.getByLabelText("Search:"), { target: { value: "usdc eth" } });

    expect(onSearchQueryChange).toHaveBeenCalledWith("usdc eth");
  });

  it("shows the current search text", () => {
    renderControls({ searchQuery: "harbor", onSearchQueryChange: vi.fn() });
    expect(screen.getByLabelText("Search:")).toHaveValue("harbor");
  });

  it("keeps the status and sort selects wired to their handlers", () => {
    const onStatusFilterChange = vi.fn();
    const onSortByChange = vi.fn();
    renderControls({ onStatusFilterChange, onSortByChange });

    fireEvent.change(screen.getByLabelText("Status:"), { target: { value: "down" } });
    fireEvent.change(screen.getByLabelText("Sort by:"), { target: { value: "tvl" } });

    expect(onStatusFilterChange).toHaveBeenCalledWith("down");
    expect(onSortByChange).toHaveBeenCalledWith("tvl");
  });
});
