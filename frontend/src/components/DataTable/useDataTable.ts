import { useMemo, useState } from "react";
import type {
  ColumnDef,
  ColumnFiltersState,
  PaginationState,
  RowSelectionState,
  SortingState,
  VisibilityState,
} from "@tanstack/react-table";
import type { DataTableColumnDef, DataTableState } from "./types";

type UseDataTableOptions<TData> = {
  columns: Array<DataTableColumnDef<TData>>;
  defaultPageSize?: number;
  defaultPageIndex?: number;
};

export function useDataTable<TData>({
  columns,
  defaultPageIndex = 0,
  defaultPageSize = 10,
}: UseDataTableOptions<TData>) {
  const defaultVisibility = useMemo(() => {
    const v: VisibilityState = {};
    for (const col of columns) {
      const id = col.id;
      if (id && col.defaultHidden) v[id] = false;
    }
    return v;
  }, [columns]);

  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState<string>("");
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: defaultPageIndex,
    pageSize: defaultPageSize,
  });
  const [columnVisibility, setColumnVisibility] =
    useState<VisibilityState>(defaultVisibility);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const defaultColumnOrder = useMemo(() => {
    const ids: string[] = [];
    for (const col of columns) {
      if (typeof col.id === "string") ids.push(col.id);
    }
    return ids;
  }, [columns]);

  const [columnOrder, setColumnOrder] = useState<string[]>(defaultColumnOrder);

  const state: DataTableState = {
    sorting,
    columnFilters,
    globalFilter,
    pagination,
    columnVisibility,
    rowSelection,
    columnOrder,
  };

  return {
    state,
    setSorting,
    setColumnFilters,
    setGlobalFilter,
    setPagination,
    setColumnVisibility,
    setRowSelection,
    setColumnOrder,
  };
}

export type { UseDataTableOptions };
export type { ColumnDef };
