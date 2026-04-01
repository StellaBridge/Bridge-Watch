import { Link } from "react-router-dom";
import type { StatItem } from "./types";

interface StatCardProps {
  stat: StatItem;
}

const STATUS_COLORS: Record<string, string> = {
  healthy: "border-green-500/30 hover:border-green-500/60",
  warning: "border-yellow-500/30 hover:border-yellow-500/60",
  critical: "border-red-500/30 hover:border-red-500/60",
  neutral: "border-stellar-border hover:border-stellar-blue",
};

const STATUS_DOT_COLORS: Record<string, string> = {
  healthy: "bg-green-500",
  warning: "bg-yellow-500",
  critical: "bg-red-500",
  neutral: "bg-stellar-text-secondary",
};

const CHANGE_COLORS: Record<string, string> = {
  up: "text-green-400",
  down: "text-red-400",
  neutral: "text-stellar-text-secondary",
};

const CHANGE_ICONS: Record<string, string> = {
  up: "↑",
  down: "↓",
  neutral: "→",
};

export default function StatCard({ stat }: StatCardProps) {
  const borderClass = STATUS_COLORS[stat.status ?? "neutral"];
  const dotClass = STATUS_DOT_COLORS[stat.status ?? "neutral"];

  const content = (
    <div
      className={`bg-stellar-card border ${borderClass} rounded-lg p-4 transition-colors`}
      data-testid={`stat-card-${stat.id}`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg" role="img" aria-hidden="true">
            {stat.icon}
          </span>
          <span className="text-xs text-stellar-text-secondary font-medium uppercase tracking-wide">
            {stat.label}
          </span>
        </div>
        {stat.status && stat.status !== "neutral" && (
          <span
            className={`w-2 h-2 rounded-full ${dotClass}`}
            aria-label={`Status: ${stat.status}`}
          />
        )}
      </div>
      <div className="text-2xl font-bold text-stellar-text-primary">{stat.value}</div>
      {stat.change && (
        <div className={`flex items-center gap-1 mt-1 text-xs ${CHANGE_COLORS[stat.change.direction]}`}>
          <span>{CHANGE_ICONS[stat.change.direction]}</span>
          <span>{stat.change.value}</span>
        </div>
      )}
    </div>
  );

  if (stat.href) {
    return (
      <Link
        to={stat.href}
        className="block focus:outline-none focus:ring-2 focus:ring-stellar-blue rounded-lg"
        aria-label={`${stat.label}: ${stat.value}. Click to view details.`}
      >
        {content}
      </Link>
    );
  }

  return content;
}
