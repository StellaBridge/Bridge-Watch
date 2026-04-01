import { describe, it, expect } from "vitest";
import { render, screen } from "../../test/utils";
import StatCard from "./StatCard";
import type { StatItem } from "./types";

const baseStat: StatItem = {
  id: "test",
  label: "Test Metric",
  value: "42",
  icon: "📊",
};

describe("StatCard", () => {
  it("renders label and value", () => {
    render(<StatCard stat={baseStat} />);
    expect(screen.getByText("Test Metric")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("renders icon", () => {
    render(<StatCard stat={baseStat} />);
    expect(screen.getByText("📊")).toBeInTheDocument();
  });

  it("renders as a link when href is provided", () => {
    const stat: StatItem = { ...baseStat, href: "/details" };
    render(<StatCard stat={stat} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/details");
  });

  it("does not render as a link when no href", () => {
    render(<StatCard stat={baseStat} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders change indicator when provided", () => {
    const stat: StatItem = {
      ...baseStat,
      change: { value: "+5%", direction: "up" },
    };
    render(<StatCard stat={stat} />);
    expect(screen.getByText("+5%")).toBeInTheDocument();
    expect(screen.getByText("↑")).toBeInTheDocument();
  });

  it("renders down change indicator", () => {
    const stat: StatItem = {
      ...baseStat,
      change: { value: "-3%", direction: "down" },
    };
    render(<StatCard stat={stat} />);
    expect(screen.getByText("-3%")).toBeInTheDocument();
    expect(screen.getByText("↓")).toBeInTheDocument();
  });

  it("renders status dot for non-neutral status", () => {
    const stat: StatItem = { ...baseStat, status: "healthy" };
    render(<StatCard stat={stat} />);
    expect(screen.getByLabelText("Status: healthy")).toBeInTheDocument();
  });

  it("does not render status dot for neutral", () => {
    const stat: StatItem = { ...baseStat, status: "neutral" };
    render(<StatCard stat={stat} />);
    expect(screen.queryByLabelText(/status/i)).not.toBeInTheDocument();
  });

  it("applies correct test id", () => {
    render(<StatCard stat={baseStat} />);
    expect(screen.getByTestId("stat-card-test")).toBeInTheDocument();
  });

  it("has aria-label on link with stat info", () => {
    const stat: StatItem = { ...baseStat, href: "/test" };
    render(<StatCard stat={stat} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("aria-label", expect.stringContaining("Test Metric"));
    expect(link).toHaveAttribute("aria-label", expect.stringContaining("42"));
  });

  it("applies warning border class for warning status", () => {
    const stat: StatItem = { ...baseStat, status: "warning" };
    render(<StatCard stat={stat} />);
    const card = screen.getByTestId("stat-card-test");
    expect(card.className).toContain("border-yellow-500");
  });

  it("applies critical border class for critical status", () => {
    const stat: StatItem = { ...baseStat, status: "critical" };
    render(<StatCard stat={stat} />);
    const card = screen.getByTestId("stat-card-test");
    expect(card.className).toContain("border-red-500");
  });
});
