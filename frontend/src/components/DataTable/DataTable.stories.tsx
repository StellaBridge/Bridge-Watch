import type { Meta, StoryObj } from "@storybook/react";
import DataTable from "./DataTable";
import type { DataTableColumnDef } from "./types";

interface SampleBridge {
  id: string;
  name: string;
  network: string;
  tvl: number;
  status: "healthy" | "warning" | "critical";
  lastAudit: string;
}

const sampleData: SampleBridge[] = [
  { id: "1", name: "Stellar-Ethereum Bridge", network: "Ethereum", tvl: 45000000, status: "healthy", lastAudit: "2026-09-01" },
  { id: "2", name: "Stellar-Polygon Bridge", network: "Polygon", tvl: 12500000, status: "healthy", lastAudit: "2026-08-15" },
  { id: "3", name: "Stellar-Solana Gateway", network: "Solana", tvl: 8900000, status: "warning", lastAudit: "2026-07-20" },
  { id: "4", name: "Stellar-BSC Channel", network: "BNB Chain", tvl: 23100000, status: "healthy", lastAudit: "2026-09-10" },
  { id: "5", name: "Stellar-Avalanche Link", network: "Avalanche", tvl: 5400000, status: "critical", lastAudit: "2026-06-30" },
];

const sampleColumns: DataTableColumnDef<SampleBridge>[] = [
  {
    accessorKey: "name",
    header: "Bridge Name",
    filterType: "text",
  },
  {
    accessorKey: "network",
    header: "Network",
    filterType: "select",
    filterOptions: [
      { label: "Ethereum", value: "Ethereum" },
      { label: "Polygon", value: "Polygon" },
      { label: "Solana", value: "Solana" },
      { label: "BNB Chain", value: "BNB Chain" },
      { label: "Avalanche", value: "Avalanche" },
    ],
  },
  {
    accessorKey: "tvl",
    header: "Total Value Locked ($)",
    filterType: "numberRange",
    cell: ({ getValue }) => `$${Number(getValue()).toLocaleString()}`,
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ getValue }) => {
      const status = String(getValue());
      const color =
        status === "healthy"
          ? "bg-green-500/10 text-green-400 border-green-500/20"
          : status === "warning"
          ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
          : "bg-red-500/10 text-red-400 border-red-500/20";
      return (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${color}`}>
          {status.toUpperCase()}
        </span>
      );
    },
  },
  {
    accessorKey: "lastAudit",
    header: "Last Audit",
    filterType: "dateRange",
  },
];

const meta: Meta<typeof DataTable<SampleBridge>> = {
  title: "Components/DataTable",
  component: DataTable,
  parameters: {
    layout: "padded",
  },
};

export default meta;
type Story = StoryObj<typeof DataTable<SampleBridge>>;

export const Default: Story = {
  args: {
    data: sampleData,
    columns: sampleColumns,
    title: "Bridge Registry",
    description: "Overview of cross-chain bridges and their operational status.",
  },
};

export const DarkTheme: Story = {
  args: {
    data: sampleData,
    columns: sampleColumns,
    title: "Bridge Registry (Dark)",
    description: "Displaying table with dark mode aesthetics.",
  },
  globals: {
    theme: "dark",
  },
};

export const LightTheme: Story = {
  args: {
    data: sampleData,
    columns: sampleColumns,
    title: "Bridge Registry (Light)",
    description: "Displaying table with light mode styling.",
  },
  globals: {
    theme: "light",
  },
};

export const LoadingState: Story = {
  args: {
    data: [],
    columns: sampleColumns,
    title: "Loading Bridges",
    isLoading: true,
  },
};

export const EmptyState: Story = {
  args: {
    data: [],
    columns: sampleColumns,
    title: "No Bridges Found",
    description: "Empty state representation when query returns 0 items.",
  },
};
