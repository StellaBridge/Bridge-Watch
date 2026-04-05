import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CSSProperties } from "react";
import type { Header, Table } from "@tanstack/react-table";
import { flexRender } from "@tanstack/react-table";
import { ColumnFilter } from "./ColumnFilter";
import type { DataTableColumnDef } from "./types";

type TableHeaderProps<TData> = {
  table: Table<TData>;
  columns: Array<DataTableColumnDef<TData>>;
  enableColumnReorder?: boolean;
  hasRowActions?: boolean;
};

function SortableHeaderCell<TData>({
  header,
  columnDef,
}: {
  header: Header<TData, unknown>;
  columnDef?: DataTableColumnDef<TData>;
}) {
  const id = header.column.id;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : undefined,
  };

  const canSort = header.column.getCanSort();
  const sort = header.column.getIsSorted();
  const sortIndicator =
    sort === "asc" ? "▲" : sort === "desc" ? "▼" : "";

  const ariaSort: "ascending" | "descending" | "none" =
    sort === "asc" ? "ascending" : sort === "desc" ? "descending" : "none";

  return (
    <th
      ref={setNodeRef}
      style={style}
      scope="col"
      className="pb-3 pr-4 align-top"
      aria-sort={canSort ? ariaSort : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          className={`text-left w-full ${canSort ? "cursor-pointer" : "cursor-default"}`}
          onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
          onKeyDown={(e) => {
            if (!canSort) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              header.column.toggleSorting(undefined, e.shiftKey);
            }
          }}
          aria-label={canSort ? `Sort by ${id}` : undefined}
          aria-describedby={canSort ? `${header.id}-sort-hint` : undefined}
        >
          <div className="flex items-center gap-2 text-stellar-text-secondary">
            <span
              className="select-none"
              {...attributes}
              {...listeners}
              aria-label="Reorder column"
              role="button"
              tabIndex={-1}
            >
              ⠿
            </span>
            <span className="text-stellar-text-secondary">
              {flexRender(header.column.columnDef.header, header.getContext())}
            </span>
            <span className="text-xs text-stellar-text-secondary">{sortIndicator}</span>
            {canSort ? (
              <span id={`${header.id}-sort-hint`} className="sr-only">
                Press Enter or Space to sort. Hold Shift for multi-sort.
              </span>
            ) : null}
          </div>
        </button>
      </div>

      {header.column.getCanFilter() ? (
        <ColumnFilter
          column={header.column}
          filterType={columnDef?.filterType}
          filterOptions={columnDef?.filterOptions}
        />
      ) : null}
    </th>
  );
}

export function TableHeader<TData>({
  table,
  columns,
  enableColumnReorder = true,
  hasRowActions = false,
}: TableHeaderProps<TData>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const leafColumns = table.getAllLeafColumns();

  const columnsById = new Map<string, DataTableColumnDef<TData>>(
    columns
      .filter((c) => typeof c.id === "string")
      .map((c) => [c.id as string, c])
  );

  function onDragEnd(event: DragEndEvent) {
    if (!event.over) return;
    const activeId = String(event.active.id);
    const overId = String(event.over.id);
    if (activeId === overId) return;

    const currentOrder = table.getState().columnOrder;
    const oldIndex = currentOrder.indexOf(activeId);
    const newIndex = currentOrder.indexOf(overId);
    if (oldIndex === -1 || newIndex === -1) return;

    table.setColumnOrder(arrayMove(currentOrder, oldIndex, newIndex));
  }

  const headerGroups = table.getHeaderGroups();

  const headerContent = (
    <thead className="sticky top-0 bg-stellar-card z-10">
      {headerGroups.map((hg) => (
        <tr
          key={hg.id}
          className="text-left text-stellar-text-secondary border-b border-stellar-border"
        >
          {hg.headers.map((header) => {
            if (header.isPlaceholder) return null;
            const def = columnsById.get(header.column.id);

            return (
              <SortableHeaderCell
                key={header.id}
                header={header}
                columnDef={def}
              />
            );
          })}
          {hasRowActions ? (
            <th scope="col" className="pb-3 pr-4 align-top">
              <span className="sr-only">Actions</span>
            </th>
          ) : null}
        </tr>
      ))}
    </thead>
  );

  if (!enableColumnReorder) return headerContent;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <SortableContext
        items={leafColumns.map((c) => c.id)}
        strategy={horizontalListSortingStrategy}
      >
        {headerContent}
      </SortableContext>
    </DndContext>
  );
}
