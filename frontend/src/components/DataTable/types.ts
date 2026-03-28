import type {
  ColumnDef,
  ColumnFiltersState,
  PaginationState,
  RowSelectionState,
  SortingState,
  VisibilityState,
} from "@tanstack/react-table";

export type DataTableFilterType =
  | "text"
  | "numberRange"
  | "select"
  | "boolean"
  | "dateRange";

export type DataTableColumnDef<TData> = ColumnDef<TData, unknown> & {
  filterType?: DataTableFilterType;
  filterOptions?: Array<{ label: string; value: string }>; // for select
  defaultHidden?: boolean;
};

export type DataTableRowActionItem<TData> = {
  id: string;
  label: string;
  onSelect: (row: TData) => void;
  disabled?: boolean;
};

export type DataTableRowAction<TData> = {
  label?: string;
  items: Array<DataTableRowActionItem<TData>>;
};

export type DataTableState = {
  sorting: SortingState;
  columnFilters: ColumnFiltersState;
  globalFilter: string;
  pagination: PaginationState;
  columnVisibility: VisibilityState;
  rowSelection: RowSelectionState;
  columnOrder: string[];
};
