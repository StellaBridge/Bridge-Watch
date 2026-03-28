import { useEffect, useMemo, useRef, useState } from "react";
import type { Row, Table } from "@tanstack/react-table";
import { flexRender } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { DataTableRowAction } from "./types";

type TableBodyProps<TData> = {
  table: Table<TData>;
  isLoading?: boolean;
  rowActions?: DataTableRowAction<TData>;
  enableVirtualization?: boolean;
  estimatedRowHeight?: number;
};

function RowActionsMenu<TData>({
  row,
  rowActions,
}: {
  row: Row<TData>;
  rowActions: DataTableRowAction<TData>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        className="px-2 py-1 rounded border border-stellar-border text-white"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        ⋯
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 mt-2 min-w-40 bg-stellar-card border border-stellar-border rounded shadow-lg z-20"
        >
          {(rowActions.items ?? []).map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className="w-full text-left px-3 py-2 text-sm text-white hover:bg-stellar-dark disabled:opacity-40"
              disabled={item.disabled}
              onClick={() => {
                item.onSelect(row.original);
                setOpen(false);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function TableBody<TData>({
  table,
  isLoading = false,
  rowActions,
  enableVirtualization = true,
  estimatedRowHeight = 44,
}: TableBodyProps<TData>) {
  const parentRef = useRef<HTMLDivElement | null>(null);

  const rows = table.getRowModel().rows;
  const visibleColumnCount = table.getVisibleLeafColumns().length;
  const colSpan = visibleColumnCount + (rowActions ? 1 : 0);

  const rowVirtualizer = useVirtualizer({
    count: enableVirtualization ? rows.length : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimatedRowHeight,
    overscan: 10,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  const [focusedRowIndex, setFocusedRowIndex] = useState<number>(0);

  useEffect(() => {
    if (focusedRowIndex >= rows.length) setFocusedRowIndex(0);
  }, [focusedRowIndex, rows.length]);

  const visibleRows = useMemo(() => {
    if (!enableVirtualization) return rows.map((r, idx) => ({ row: r, idx }));

    return virtualItems
      .map((vi) => ({
        row: rows[vi.index],
        idx: vi.index,
        start: vi.start,
        size: vi.size,
      }))
      .filter(
        (
          x: {
            row: (typeof rows)[number] | undefined;
            idx: number;
            start: number;
            size: number;
          }
        ): x is {
          row: NonNullable<(typeof rows)[number]>;
          idx: number;
          start: number;
          size: number;
        } => !!x.row
      );
  }, [enableVirtualization, rows, virtualItems]);

  const empty = !isLoading && rows.length === 0;

  const paddingTop = enableVirtualization && virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom =
    enableVirtualization && virtualItems.length > 0
      ? totalSize - virtualItems[virtualItems.length - 1].end
      : 0;

  return (
    <div
      ref={parentRef}
      className="max-h-[520px] overflow-auto"
      onKeyDown={(e) => {
        if (rows.length === 0) return;

        if (e.key === "ArrowDown") {
          e.preventDefault();
          setFocusedRowIndex((i) => Math.min(i + 1, rows.length - 1));
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setFocusedRowIndex((i) => Math.max(i - 1, 0));
        }
        if (e.key === " " || e.key === "Enter") {
          const r = rows[focusedRowIndex];
          if (r) {
            e.preventDefault();
            r.toggleSelected();
          }
        }
      }}
      tabIndex={0}
      role="region"
      aria-label="Table content"
    >
      <table className="w-full text-sm">
        <tbody className="text-white">
          {isLoading ? (
            <tr>
              <td
                colSpan={colSpan}
                className="py-10 text-center text-stellar-text-secondary"
              >
                Loading…
              </td>
            </tr>
          ) : empty ? (
            <tr>
              <td
                colSpan={colSpan}
                className="py-10 text-center text-stellar-text-secondary"
              >
                No results
              </td>
            </tr>
          ) : enableVirtualization ? (
            <>
              {paddingTop > 0 ? (
                <tr>
                  <td style={{ height: paddingTop }} colSpan={colSpan} />
                </tr>
              ) : null}

              {visibleRows.map(({ row, idx }) => (
                <tr
                  key={row.id}
                  className={`border-b border-stellar-border ${
                    idx === focusedRowIndex ? "bg-stellar-dark/40" : ""
                  }`}
                  onMouseEnter={() => setFocusedRowIndex(idx)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="py-3 pr-4">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                  {rowActions ? (
                    <td className="py-3 pr-4 text-right">
                      <RowActionsMenu row={row} rowActions={rowActions} />
                    </td>
                  ) : null}
                </tr>
              ))}

              {paddingBottom > 0 ? (
                <tr>
                  <td style={{ height: paddingBottom }} colSpan={colSpan} />
                </tr>
              ) : null}
            </>
          ) : (
            rows.map((row, idx) => (
              <tr
                key={row.id}
                className={`border-b border-stellar-border ${
                  idx === focusedRowIndex ? "bg-stellar-dark/40" : ""
                }`}
                onMouseEnter={() => setFocusedRowIndex(idx)}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="py-3 pr-4">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
                {rowActions ? (
                  <td className="py-3 pr-4 text-right">
                    <RowActionsMenu row={row} rowActions={rowActions} />
                  </td>
                ) : null}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
