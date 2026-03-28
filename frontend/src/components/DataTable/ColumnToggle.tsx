import type { Table } from "@tanstack/react-table";

type ColumnToggleProps<TData> = {
  table: Table<TData>;
};

export function ColumnToggle<TData>({ table }: ColumnToggleProps<TData>) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {table
        .getAllLeafColumns()
        .filter((c) => c.getCanHide())
        .map((column) => (
          <label
            key={column.id}
            className="inline-flex items-center gap-2 text-sm text-stellar-text-secondary"
          >
            <input
              type="checkbox"
              className="accent-stellar-blue"
              checked={column.getIsVisible()}
              onChange={column.getToggleVisibilityHandler()}
            />
            <span className="text-white/90">{column.id}</span>
          </label>
        ))}
    </div>
  );
}
