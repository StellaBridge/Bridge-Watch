import type { Column } from "@tanstack/react-table";
import type { DataTableFilterType } from "./types";

type ColumnFilterProps<TData> = {
  column: Column<TData, unknown>;
  filterType?: DataTableFilterType;
  filterOptions?: Array<{ label: string; value: string }>;
};

export function ColumnFilter<TData>({
  column,
  filterType = "text",
  filterOptions,
}: ColumnFilterProps<TData>) {
  const value = column.getFilterValue();

  if (!column.getCanFilter()) return null;

  if (filterType === "boolean") {
    const v = typeof value === "boolean" ? value : "";

    return (
      <select
        className="mt-2 w-full bg-stellar-dark border border-stellar-border rounded px-2 py-1 text-xs text-white"
        value={v === "" ? "" : v ? "true" : "false"}
        onChange={(e) => {
          const next = e.target.value;
          if (next === "") column.setFilterValue(undefined);
          else column.setFilterValue(next === "true");
        }}
      >
        <option value="">All</option>
        <option value="true">True</option>
        <option value="false">False</option>
      </select>
    );
  }

  if (filterType === "select") {
    const v = typeof value === "string" ? value : "";

    return (
      <select
        className="mt-2 w-full bg-stellar-dark border border-stellar-border rounded px-2 py-1 text-xs text-white"
        value={v}
        onChange={(e) => {
          const next = e.target.value;
          column.setFilterValue(next ? next : undefined);
        }}
      >
        <option value="">All</option>
        {(filterOptions ?? []).map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }

  if (filterType === "numberRange") {
    const v = Array.isArray(value) ? value : ["", ""];
    const [min, max] = v as [unknown, unknown];

    return (
      <div className="mt-2 flex items-center gap-2">
        <input
          className="w-full bg-stellar-dark border border-stellar-border rounded px-2 py-1 text-xs text-white"
          placeholder="Min"
          inputMode="decimal"
          value={typeof min === "number" ? String(min) : ""}
          onChange={(e) => {
            const nextMin = e.target.value === "" ? undefined : Number(e.target.value);
            const next: [number | undefined, number | undefined] = [
              Number.isFinite(nextMin as number) ? (nextMin as number) : undefined,
              typeof max === "number" ? max : undefined,
            ];
            column.setFilterValue(next);
          }}
        />
        <input
          className="w-full bg-stellar-dark border border-stellar-border rounded px-2 py-1 text-xs text-white"
          placeholder="Max"
          inputMode="decimal"
          value={typeof max === "number" ? String(max) : ""}
          onChange={(e) => {
            const nextMax = e.target.value === "" ? undefined : Number(e.target.value);
            const next: [number | undefined, number | undefined] = [
              typeof min === "number" ? min : undefined,
              Number.isFinite(nextMax as number) ? (nextMax as number) : undefined,
            ];
            column.setFilterValue(next);
          }}
        />
      </div>
    );
  }

  if (filterType === "dateRange") {
    const v = Array.isArray(value) ? value : ["", ""];
    const [from, to] = v as [unknown, unknown];

    return (
      <div className="mt-2 flex items-center gap-2">
        <input
          type="date"
          className="w-full bg-stellar-dark border border-stellar-border rounded px-2 py-1 text-xs text-white"
          value={typeof from === "string" ? from : ""}
          onChange={(e) => {
            const next: [string | undefined, string | undefined] = [
              e.target.value ? e.target.value : undefined,
              typeof to === "string" ? to : undefined,
            ];
            column.setFilterValue(next);
          }}
        />
        <input
          type="date"
          className="w-full bg-stellar-dark border border-stellar-border rounded px-2 py-1 text-xs text-white"
          value={typeof to === "string" ? to : ""}
          onChange={(e) => {
            const next: [string | undefined, string | undefined] = [
              typeof from === "string" ? from : undefined,
              e.target.value ? e.target.value : undefined,
            ];
            column.setFilterValue(next);
          }}
        />
      </div>
    );
  }

  const text = typeof value === "string" ? value : "";

  return (
    <input
      className="mt-2 w-full bg-stellar-dark border border-stellar-border rounded px-2 py-1 text-xs text-white"
      placeholder="Filter…"
      value={text}
      onChange={(e) => column.setFilterValue(e.target.value)}
    />
  );
}
