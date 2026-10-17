import type { Meta, StoryObj } from "@storybook/react";
import { RiskScoreCard } from "./RiskScoreCard";

const meta: Meta<typeof RiskScoreCard> = {
  title: "Components/RiskScoreCard",
  component: RiskScoreCard,
  parameters: {
    layout: "centered",
  },
};

export default meta;
type Story = StoryObj<typeof RiskScoreCard>;

export const LowRisk: Story = {
  args: {
    score: 18,
    level: "LOW",
  },
};

export const ModerateRisk: Story = {
  args: {
    score: 45,
    level: "MODERATE",
  },
};

export const HighRisk: Story = {
  args: {
    score: 74,
    level: "HIGH",
  },
};

export const CriticalRisk: Story = {
  args: {
    score: 92,
    level: "CRITICAL",
  },
};

export const DarkTheme: Story = {
  args: {
    score: 22,
    level: "LOW",
  },
  globals: {
    theme: "dark",
  },
};

export const LightTheme: Story = {
  args: {
    score: 88,
    level: "CRITICAL",
  },
  globals: {
    theme: "light",
  },
};
