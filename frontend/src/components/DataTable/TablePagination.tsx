import type { Table } from "@tanstack/react-table";

type TablePaginationProps<TData> = {
  table: Table<TData>;
  pageSizeOptions?: number[];
};

export function TablePagination<TData>({
  table,
  pageSizeOptions = [10, 20, 50, 100],
}: TablePaginationProps<TData>) {
  const state = table.getState();
  const { pageIndex, pageSize } = state.pagination;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-3">
      <div className="text-sm text-stellar-text-secondary">
        {table.getFilteredRowModel().rows.length} rows
      </div>

      <div className="flex items-center gap-2">
        <label className="text-sm text-stellar-text-secondary" htmlFor="page-size">
          Rows per page
        </label>
        <select
          id="page-size"
          className="bg-stellar-dark border border-stellar-border rounded px-2 py-1 text-sm text-white"
          value={pageSize}
          onChange={(e) => table.setPageSize(Number(e.target.value))}
        >
          {pageSizeOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="px-3 py-1.5 rounded border border-stellar-border text-stellar-text-primary disabled:opacity-40"
          onClick={() => table.setPageIndex(0)}
          disabled={!table.getCanPreviousPage()}
        >
          First
        </button>
        <button
          type="button"
          className="px-3 py-1.5 rounded border border-stellar-border text-stellar-text-primary disabled:opacity-40"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          Prev
        </button>
        <div className="text-sm text-stellar-text-secondary">
          Page <span className="text-stellar-text-primary">{pageIndex + 1}</span> of{" "}
          <span className="text-stellar-text-primary">{table.getPageCount()}</span>
        </div>
        <button
          type="button"
          className="px-3 py-1.5 rounded border border-stellar-border text-stellar-text-primary disabled:opacity-40"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          Next
        </button>
        <button
          type="button"
          className="px-3 py-1.5 rounded border border-stellar-border text-stellar-text-primary disabled:opacity-40"
          onClick={() => table.setPageIndex(table.getPageCount() - 1)}
          disabled={!table.getCanNextPage()}
        >
          Last
        </button>
      </div>
    </div>
  );
}
