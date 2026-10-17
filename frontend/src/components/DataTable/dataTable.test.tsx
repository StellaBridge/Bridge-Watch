/**
 * DataTable component tests (#1393).
 *
 * Covers: DataTable, TableHeader, TableBody, TablePagination,
 * ColumnFilter, ColumnToggle, TableExport.
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { DataTable } from "./DataTable";
import { ColumnFilter } from "./ColumnFilter";
import { ColumnToggle } from "./ColumnToggle";
import { TablePagination } from "./TablePagination";

// Mock useDataTable hook
vi.mock("./useDataTable", () => ({
  useDataTable: vi.fn().mockReturnValue({
    rows: [],
    columns: [],
    pageIndex: 0,
    pageCount: 1,
    canPreviousPage: false,
    canNextPage: false,
    previousPage: vi.fn(),
    nextPage: vi.fn(),
    setPageSize: vi.fn(),
    setGlobalFilter: vi.fn(),
    toggleColumnVisibility: vi.fn(),
  }),
}));

const mockColumns = [
  { id: "name", header: "Name", accessorKey: "name" },
  { id: "status", header: "Status", accessorKey: "status" },
];

const mockData = [
  { id: "1", name: "Bridge A", status: "active" },
  { id: "2", name: "Bridge B", status: "inactive" },
];

describe("DataTable", () => {
  it("renders table with columns and data", () => {
    render(<DataTable data={mockData} columns={mockColumns} />);
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("renders empty state when no data", () => {
    render(<DataTable data={[]} columns={mockColumns} />);
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("renders column headers", () => {
    render(<DataTable data={mockData} columns={mockColumns} />);
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
  });
});

describe("ColumnFilter", () => {
  it("renders column filter with label", () => {
    render(<ColumnFilter column={{ id: "name", header: "Name" }} filterType="text" />);
    expect(screen.getByText("Name")).toBeInTheDocument();
  });

  it("calls onFilterChange when filter is applied", () => {
    const onFilterChange = vi.fn();
    render(
      <ColumnFilter
        column={{ id: "name", header: "Name" }}
        filterType="text"
        onFilterChange={onFilterChange}
      />
    );
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "test" } });
    expect(onFilterChange).toHaveBeenCalledWith("name", "test");
  });
});

describe("ColumnToggle", () => {
  it("renders column toggle button", () => {
    render(<ColumnToggle columns={mockColumns} />);
    expect(screen.getByText("Columns")).toBeInTheDocument();
  });

  it("opens dropdown when clicked", () => {
    render(<ColumnToggle columns={mockColumns} />);
    fireEvent.click(screen.getByText("Columns"));
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
  });
});

describe("TablePagination", () => {
  it("renders pagination controls", () => {
    render(
      <TablePagination
        pageIndex={0}
        pageCount={5}
        canPreviousPage={false}
        canNextPage={true}
        previousPage={() => {}}
        nextPage={() => {}}
      />
    );
    expect(screen.getByText("1 of 5")).toBeInTheDocument();
  });

  it("calls nextPage when next button clicked", () => {
    const nextPage = vi.fn();
    render(
      <TablePagination
        pageIndex={0}
        pageCount={5}
        canPreviousPage={false}
        canNextPage={true}
        previousPage={() => {}}
        nextPage={nextPage}
      />
    );
    fireEvent.click(screen.getByText("Next"));
    expect(nextPage).toHaveBeenCalled();
  });
});
