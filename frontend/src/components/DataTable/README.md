# DataTable

## Usage

```tsx
import type { DataTableColumnDef } from "./components/DataTable";
import { DataTable } from "./components/DataTable";

type Row = { id: string; name: string; price: number; updatedAt: string };

const columns: Array<DataTableColumnDef<Row>> = [
  {
    id: "name",
    accessorKey: "name",
    header: "Name",
    filterType: "text",
  },
  {
    id: "price",
    accessorKey: "price",
    header: "Price",
    filterType: "numberRange",
    cell: (ctx) => `$${Number(ctx.getValue()).toFixed(2)}`,
  },
  {
    id: "updatedAt",
    accessorKey: "updatedAt",
    header: "Updated",
    filterType: "dateRange",
  },
];

export function Example({ data, isLoading }: { data: Row[]; isLoading: boolean }) {
  return (
    <DataTable
      data={data}
      columns={columns}
      isLoading={isLoading}
      title="Assets"
      description="Sortable, filterable, selectable assets"
      pageSizeOptions={[10, 20, 50]}
      filenameBase="assets"
      rowActions={{
        items: [
          {
            id: "view",
            label: "View",
            onSelect: (row) => console.log("view", row.id),
          },
        ],
      }}
    />
  );
}
```
