import type { Meta, StoryObj } from "@storybook/react";
import HealthBreakdown from "./HealthBreakdown";

const sampleHealthyFactors = {
  liquidityDepth: 94,
  priceStability: 88,
  bridgeUptime: 99,
  reserveBacking: 95,
  volumeTrend: 82,
};

const sampleWarningFactors = {
  liquidityDepth: 55,
  priceStability: 62,
  bridgeUptime: 78,
  reserveBacking: 60,
  volumeTrend: 48,
};

const sampleCriticalFactors = {
  liquidityDepth: 32,
  priceStability: 28,
  bridgeUptime: 40,
  reserveBacking: 35,
  volumeTrend: 19,
};

const sampleHistory = [
  { timestamp: "2026-10-10T00:00:00.000Z", score: 86 },
  { timestamp: "2026-10-11T00:00:00.000Z", score: 88 },
  { timestamp: "2026-10-12T00:00:00.000Z", score: 91 },
  { timestamp: "2026-10-13T00:00:00.000Z", score: 87 },
  { timestamp: "2026-10-14T00:00:00.000Z", score: 93 },
  { timestamp: "2026-10-15T00:00:00.000Z", score: 92 },
  { timestamp: "2026-10-16T00:00:00.000Z", score: 95 },
];

const meta: Meta<typeof HealthBreakdown> = {
  title: "Components/HealthBreakdown",
  component: HealthBreakdown,
  parameters: {
    layout: "padded",
  },
};

export default meta;
type Story = StoryObj<typeof HealthBreakdown>;

export const Healthy: Story = {
  args: {
    factors: sampleHealthyFactors,
    history: sampleHistory,
    isHistoryLoading: false,
  },
};

export const Warning: Story = {
  args: {
    factors: sampleWarningFactors,
    history: [
      { timestamp: "2026-10-10T00:00:00.000Z", score: 75 },
      { timestamp: "2026-10-12T00:00:00.000Z", score: 68 },
      { timestamp: "2026-10-14T00:00:00.000Z", score: 62 },
      { timestamp: "2026-10-16T00:00:00.000Z", score: 58 },
    ],
    isHistoryLoading: false,
  },
};

export const Critical: Story = {
  args: {
    factors: sampleCriticalFactors,
    history: [
      { timestamp: "2026-10-10T00:00:00.000Z", score: 60 },
      { timestamp: "2026-10-12T00:00:00.000Z", score: 45 },
      { timestamp: "2026-10-14T00:00:00.000Z", score: 32 },
      { timestamp: "2026-10-16T00:00:00.000Z", score: 26 },
    ],
    isHistoryLoading: false,
  },
};

export const LoadingHistory: Story = {
  args: {
    factors: sampleHealthyFactors,
    history: [],
    isHistoryLoading: true,
  },
};

export const DarkTheme: Story = {
  args: {
    factors: sampleHealthyFactors,
    history: sampleHistory,
    isHistoryLoading: false,
  },
  globals: {
    theme: "dark",
  },
};

export const LightTheme: Story = {
  args: {
    factors: sampleHealthyFactors,
    history: sampleHistory,
    isHistoryLoading: false,
  },
  globals: {
    theme: "light",
  },
};
