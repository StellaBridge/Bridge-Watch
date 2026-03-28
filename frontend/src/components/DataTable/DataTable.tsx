import { useMemo } from "react";
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type { FilterFn, Row, RowData } from "@tanstack/react-table";
import { ColumnToggle } from "./ColumnToggle";
import { TableBody } from "./TableBody";
import { TableExport } from "./TableExport";
import { TableHeader } from "./TableHeader";
import { TablePagination } from "./TablePagination";
import { useDataTable } from "./useDataTable";
import type { DataTableColumnDef, DataTableRowAction } from "./types";

declare module "@tanstack/react-table" {
  interface FilterFns {
    numberRange: FilterFn<unknown>;
    dateRange: FilterFn<unknown>;
  }
}

const numberRangeFilter: FilterFn<unknown> = (row, columnId, value) => {
  const cell = row.getValue(columnId);
  if (!Array.isArray(value)) return true;
  const [min, max] = value as [number | undefined, number | undefined];
  const n = typeof cell === "number" ? cell : Number(cell);
  if (!Number.isFinite(n)) return false;
  if (typeof min === "number" && n < min) return false;
  if (typeof max === "number" && n > max) return false;
  return true;
};

const dateRangeFilter: FilterFn<unknown> = (row, columnId, value) => {
  const cell = row.getValue(columnId);
  if (!Array.isArray(value)) return true;
  const [from, to] = value as [string | undefined, string | undefined];

  const cellDate =
    cell instanceof Date
      ? cell
      : typeof cell === "string"
        ? new Date(cell)
        : null;

  if (!cellDate || Number.isNaN(cellDate.getTime())) return false;

  if (from) {
    const fromDate = new Date(from);
    if (!Number.isNaN(fromDate.getTime()) && cellDate < fromDate) return false;
  }
  if (to) {
    const toDate = new Date(to);
    if (!Number.isNaN(toDate.getTime()) && cellDate > toDate) return false;
  }

  return true;
};

type DataTableProps<TData extends RowData> = {
  data: TData[];
  columns: Array<DataTableColumnDef<TData>>;
  isLoading?: boolean;
  title?: string;
  description?: string;
  pageSizeOptions?: number[];
  enableMultiSort?: boolean;
  enableColumnReorder?: boolean;
  enableRowSelection?: boolean;
  rowActions?: DataTableRowAction<TData>;
  enableVirtualization?: boolean;
  filenameBase?: string;
  getRowId?: (row: TData, index: number, parent?: Row<TData>) => string;
};

export function DataTable<TData extends RowData>({
  data,
  columns,
  isLoading = false,
  title,
  description,
  pageSizeOptions,
  enableMultiSort = true,
  enableColumnReorder = true,
  enableRowSelection = true,
  rowActions,
  enableVirtualization = true,
  filenameBase = "data",
  getRowId,
}: DataTableProps<TData>) {
  const {
    state,
    setSorting,
    setColumnFilters,
    setGlobalFilter,
    setPagination,
    setColumnVisibility,
    setRowSelection,
    setColumnOrder,
  } = useDataTable<TData>({ columns, defaultPageSize: pageSizeOptions?.[0] ?? 10 });

  const columnsWithSelection = useMemo(() => {
    if (!enableRowSelection) return columns;

    const selectionCol: DataTableColumnDef<TData> = {
      id: "select",
      header: ({ table }) => (
        <input
          type="checkbox"
          className="accent-stellar-blue"
          checked={table.getIsAllPageRowsSelected()}
          onChange={table.getToggleAllPageRowsSelectedHandler()}
          aria-label="Select all rows"
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          className="accent-stellar-blue"
          checked={row.getIsSelected()}
          disabled={!row.getCanSelect()}
          onChange={row.getToggleSelectedHandler()}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableHiding: false,
      enableColumnFilter: false,
      size: 40,
    };

    return [selectionCol, ...columns];
  }, [columns, enableRowSelection]);

  const table = useReactTable({
    data,
    columns: columnsWithSelection,
    state,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onColumnOrderChange: setColumnOrder,
    getRowId,
    enableMultiSort,
    filterFns: {
      numberRange: numberRangeFilter,
      dateRange: dateRangeFilter,
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const selectedCount = table.getSelectedRowModel().rows.length;

  return (
    <div className="bg-stellar-card border border-stellar-border rounded-lg p-6">
      {(title || description) ? (
        <div className="mb-4">
          {title ? (
            <h2 className="text-xl font-semibold text-white">{title}</h2>
          ) : null}
          {description ? (
            <p className="mt-1 text-stellar-text-secondary">{description}</p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex items-center gap-2">
            <input
              className="w-full sm:w-80 bg-stellar-dark border border-stellar-border rounded px-3 py-2 text-sm text-white"
              placeholder="Search…"
              value={table.getState().globalFilter ?? ""}
              onChange={(e) => table.setGlobalFilter(e.target.value)}
            />
            {selectedCount > 0 ? (
              <div className="text-sm text-stellar-text-secondary">
                <span className="text-white">{selectedCount}</span> selected
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2 justify-end">
            <TableExport
              table={table}
              filenameBase={filenameBase}
              onlySelected={false}
            />
            <TableExport
              table={table}
              filenameBase={filenameBase}
              onlySelected={true}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <TableHeader
              table={table}
              columns={columnsWithSelection}
              enableColumnReorder={enableColumnReorder}
              hasRowActions={!!rowActions}
            />
          </table>
        </div>

        <div className="overflow-x-auto">
          <TableBody
            table={table}
            isLoading={isLoading}
            rowActions={rowActions}
            enableVirtualization={enableVirtualization}
          />
        </div>

        <div className="flex flex-col gap-3">
          <ColumnToggle table={table} />
          <TablePagination table={table} pageSizeOptions={pageSizeOptions} />
        </div>
      </div>
    </div>
  );
}
