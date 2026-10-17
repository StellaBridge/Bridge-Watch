import { useMemo } from "react";
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type { FilterFn, Row, RowData } from "@tanstack/react-table";
import { ColumnChooser } from "./ColumnToggle";
import { TableBody } from "./TableBody";
import { TableExport } from "./TableExport";
import { TableHeader } from "./TableHeader";
import { TablePagination } from "./TablePagination";
import { useDataTable } from "./useDataTable";
import type { DataTableColumnDef, DataTableRowAction } from "./types";

function withFilterFns<TData extends RowData>(
  cols: Array<DataTableColumnDef<TData>>
): Array<DataTableColumnDef<TData>> {
  return cols.map((c) => {
    if (!c.filterType) return c;
    if ("filterFn" in c && c.filterFn) return c;

    if (c.filterType === "numberRange") return { ...c, filterFn: "numberRange" };
    if (c.filterType === "dateRange") return { ...c, filterFn: "dateRange" };

    // For these filter UIs we can safely use built-in filter fns.
    if (c.filterType === "boolean") return { ...c, filterFn: "equals" };
    if (c.filterType === "select") return { ...c, filterFn: "equals" };

    return c;
  });
}

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
  storageKey?: string;
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
  storageKey,
  getRowId,
}: DataTableProps<TData>) {
  const {
    state,
    setSorting,
    clearSorting,
    hasSorting,
    setColumnFilters,
    setGlobalFilter,
    setPagination,
    setColumnVisibility,
    setRowSelection,
    setColumnOrder,
    resetColumnPreferences,
  } = useDataTable<TData>({
    columns,
    defaultPageSize: pageSizeOptions?.[0] ?? 10,
    storageKey,
  });

  const columnsWithSelection = useMemo(() => {
    const mappedColumns = withFilterFns(columns);
    if (!enableRowSelection) return mappedColumns;

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

    return [selectionCol, ...mappedColumns];
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
  const activeSortLabels = useMemo(
    () =>
      state.sorting.map((sort, index) => {
        const column = table.getColumn(sort.id);
        const label =
          typeof column?.columnDef.header === "string"
            ? column.columnDef.header
            : sort.id;

        return {
          id: sort.id,
          label,
          direction: sort.desc ? "desc" : "asc",
          position: index + 1,
        };
      }),
    [state.sorting, table]
  );

  return (
    <div className="bg-stellar-card border border-stellar-border rounded-lg p-6">
      {(title || description) ? (
        <div className="mb-4">
          {title ? (
            <h2 className="text-xl font-semibold text-stellar-text-primary">{title}</h2>
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
              className="w-full sm:w-80 min-h-[44px] bg-stellar-card border border-stellar-border rounded px-3 py-2 text-sm text-stellar-text-primary focus:outline-none focus:ring-1 focus:ring-stellar-blue"
              placeholder="Search…"
              value={table.getState().globalFilter ?? ""}
              onChange={(e) => table.setGlobalFilter(e.target.value)}
            />
            {selectedCount > 0 ? (
              <div className="text-sm text-stellar-text-secondary">
                <span className="text-stellar-text-primary">{selectedCount}</span> selected
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

        <div className="flex flex-col gap-2 rounded-lg border border-stellar-border bg-stellar-dark/30 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-[0.2em] text-stellar-text-secondary">
              Sort
            </span>
            {hasSorting ? (
              activeSortLabels.map((sort) => (
                <span
                  key={sort.id}
                  className="inline-flex items-center gap-2 rounded-full border border-stellar-border bg-stellar-card px-3 py-1 text-xs text-stellar-text-primary"
                >
                  <span>
                    {sort.position}. {sort.label}
                  </span>
                  <span className="text-stellar-text-secondary">
                    {sort.direction === "asc" ? "Asc" : "Desc"}
                  </span>
                </span>
              ))
            ) : (
              <span className="text-xs text-stellar-text-secondary">
                Click a header to sort. Hold Shift to add a secondary sort.
              </span>
            )}
          </div>
          {hasSorting ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={clearSorting}
                className="min-h-[44px] inline-flex items-center rounded-md border border-stellar-border px-3 py-1.5 text-xs font-medium text-stellar-text-primary transition-colors hover:border-stellar-blue hover:text-stellar-blue"
              >
                Clear sort
              </button>
            </div>
          ) : null}
        </div>

        <div className="w-full overflow-x-auto -mx-2 sm:mx-0 px-2 sm:px-0">
          <table className="min-w-[640px] w-full text-sm">
            <TableHeader
              table={table}
              columns={columnsWithSelection}
              enableColumnReorder={enableColumnReorder}
              hasRowActions={!!rowActions}
            />
          </table>
        </div>

        <div className="w-full overflow-x-auto -mx-2 sm:mx-0 px-2 sm:px-0">
          <TableBody
            table={table}
            isLoading={isLoading}
            rowActions={rowActions}
            enableVirtualization={enableVirtualization}
          />
        </div>

        <div className="flex flex-col gap-3">
          <ColumnChooser table={table} onReset={resetColumnPreferences} />
          <TablePagination table={table} pageSizeOptions={pageSizeOptions} />
        </div>
      </div>
    </div>
  );
}
