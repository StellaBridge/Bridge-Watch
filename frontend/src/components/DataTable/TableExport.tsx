import { useMemo } from "react";
import type { Row, Table } from "@tanstack/react-table";

function toCsvValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.split('"').join('""')}"`;
  return s;
}

function downloadTextFile(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type TableExportProps<TData> = {
  table: Table<TData>;
  filenameBase?: string;
  onlySelected?: boolean;
};

export function TableExport<TData>({
  table,
  filenameBase = "data",
  onlySelected = false,
}: TableExportProps<TData>) {
  const rows: Array<Row<TData>> = useMemo(() => {
    if (onlySelected) return table.getSelectedRowModel().rows;
    return table.getFilteredRowModel().rows;
  }, [onlySelected, table]);

  const leafColumns = table
    .getAllLeafColumns()
    .filter((c) => c.getIsVisible());

  function exportJson() {
    const data = rows.map((r) => r.original);
    downloadTextFile(
      `${filenameBase}${onlySelected ? "-selected" : ""}.json`,
      JSON.stringify(data, null, 2),
      "application/json"
    );
  }

  function exportCsv() {
    const headers = leafColumns.map((c) => c.id);
    const lines: string[] = [];
    lines.push(headers.map(toCsvValue).join(","));

    for (const row of rows) {
      const line = leafColumns.map((c) => {
        const value = row.getValue(c.id);
        return toCsvValue(value);
      });
      lines.push(line.join(","));
    }

    downloadTextFile(
      `${filenameBase}${onlySelected ? "-selected" : ""}.csv`,
      lines.join("\n"),
      "text/csv"
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="px-3 py-1.5 rounded border border-stellar-border text-white disabled:opacity-40"
        onClick={exportCsv}
        disabled={rows.length === 0}
      >
        Export {onlySelected ? "Selected" : "All"} CSV
      </button>
      <button
        type="button"
        className="px-3 py-1.5 rounded border border-stellar-border text-white disabled:opacity-40"
        onClick={exportJson}
        disabled={rows.length === 0}
      >
        Export {onlySelected ? "Selected" : "All"} JSON
      </button>
    </div>
  );
}
