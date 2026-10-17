import type { Meta, StoryObj } from "@storybook/react";
import MetricCard from "./MetricCard";

const meta: Meta<typeof MetricCard> = {
  title: "Components/MetricCard",
  component: MetricCard,
  parameters: {
    layout: "centered",
  },
};

export default meta;
type Story = StoryObj<typeof MetricCard>;

export const PositiveTrend: Story = {
  args: {
    label: "Total Value Locked",
    value: "$142.8M",
    subtitle: "vs previous 30 days",
    change: 12.4,
    changeUnit: "%",
  },
};

export const NegativeTrend: Story = {
  args: {
    label: "24h Volume",
    value: "$18.2M",
    subtitle: "vs yesterday",
    change: -4.8,
    changeUnit: "%",
  },
};

export const NeutralTrend: Story = {
  args: {
    label: "Active Validators",
    value: "28",
    subtitle: "Consensus nodes",
    change: 0.0,
  },
};

export const Loading: Story = {
  args: {
    label: "Total Value Locked",
    value: "$0.00",
    isLoading: true,
  },
};

export const DarkTheme: Story = {
  args: {
    label: "System Health Score",
    value: "96.4%",
    subtitle: "All channels nominal",
    change: 2.1,
  },
  globals: {
    theme: "dark",
  },
};

export const LightTheme: Story = {
  args: {
    label: "System Health Score",
    value: "96.4%",
    subtitle: "All channels nominal",
    change: 2.1,
  },
  globals: {
    theme: "light",
  },
};
