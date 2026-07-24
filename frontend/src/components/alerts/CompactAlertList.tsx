import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  useIncidentFeed,
  type BridgeIncident,
  type IncidentSeverity,
  type IncidentStatus,
} from "../../hooks/useIncidentFeed";

type SortField = "severity" | "time" | "status" | "title";
type SortDir = "asc" | "desc";
type DensityMode = "compact" | "comfortable";
type QuickFilterType = "all" | "critical" | "depeg" | "unacknowledged";

const SEVERITY_ORDER: Record<IncidentSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const SEVERITY_BADGE: Record<IncidentSeverity, string> = {
  critical: "bg-red-900/50 text-red-400 border border-red-700",
  high: "bg-orange-900/50 text-orange-400 border border-orange-700",
  medium: "bg-yellow-900/50 text-yellow-400 border border-yellow-700",
  low: "bg-blue-900/50 text-blue-400 border border-blue-700",
};

const SEVERITY_ICON_COLOR: Record<IncidentSeverity, string> = {
  critical: "text-red-500",
  high: "text-orange-500",
  medium: "text-yellow-500",
  low: "text-blue-400",
};

const STATUS_STYLE: Record<IncidentStatus, string> = {
  open: "text-red-400",
  investigating: "text-yellow-400",
  resolved: "text-green-400",
};

function SeverityIcon({ severity }: { severity: IncidentSeverity }) {
  const cls = `w-4 h-4 flex-shrink-0 ${SEVERITY_ICON_COLOR[severity]}`;
  if (severity === "critical") {
    return (
      <svg className={cls} viewBox="0 0 16 16" fill="currentColor" role="img" aria-label="Critical severity">
        <path fillRule="evenodd" d="M8 1a7 7 0 100 14A7 7 0 008 1zm-.75 4a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0V5zM8 11a1 1 0 110-2 1 1 0 010 2z" clipRule="evenodd" />
      </svg>
    );
  }
  if (severity === "high") {
    return (
      <svg className={cls} viewBox="0 0 16 16" fill="currentColor" role="img" aria-label="High severity">
        <path fillRule="evenodd" d="M6.953 2.322a1.2 1.2 0 012.094 0l5.25 9.1A1.2 1.2 0 0113.25 13.5H2.75a1.2 1.2 0 01-1.047-1.078l5.25-9.1zM8 5.5a.5.5 0 01.5.5v2.5a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm0 5.5a.75.75 0 110-1.5.75.75 0 010 1.5z" clipRule="evenodd" />
      </svg>
    );
  }
  if (severity === "medium") {
    return (
      <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" role="img" aria-label="Medium severity">
        <circle cx="8" cy="8" r="6.25" />
        <line x1="8" y1="5" x2="8" y2="8.5" strokeLinecap="round" />
        <circle cx="8" cy="10.75" r="0.75" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  return (
    <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" role="img" aria-label="Low severity">
      <circle cx="8" cy="8" r="6.25" />
      <circle cx="8" cy="5.25" r="0.75" fill="currentColor" stroke="none" />
      <line x1="8" y1="7.5" x2="8" y2="11" strokeLinecap="round" />
    </svg>
  );
}

function SortHeader({
  label,
  field,
  current,
  dir,
  onSort,
}: {
  label: string;
  field: SortField;
  current: SortField;
  dir: SortDir;
  onSort: (f: SortField) => void;
}) {
  const active = current === field;
  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      className={`inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold uppercase tracking-wider transition-colors ${
        active
          ? "text-stellar-blue"
          : "text-stellar-text-muted hover:text-stellar-text-secondary"
      }`}
    >
      {label}
      {active ? (
        dir === "asc" ? (
          <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9.5V2.5M3 5.5L6 2.5 9 5.5" />
          </svg>
        ) : (
          <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 2.5V9.5M3 6.5L6 9.5 9 6.5" />
          </svg>
        )
      ) : (
        <svg className="w-3 h-3 opacity-30" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 4.5L6 1.5 9 4.5M3 7.5L6 10.5 9 7.5" />
        </svg>
      )}
    </button>
  );
}

function relativeTime(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function AlertRow({
  incident,
  selected,
  isUnread,
  density,
  onSelect,
  onMarkRead,
}: {
  incident: BridgeIncident;
  selected: boolean;
  isUnread: boolean;
  density: DensityMode;
  onSelect: (id: string) => void;
  onMarkRead: (id: string) => void;
}) {
  const py = density === "compact" ? "py-1.5" : "py-3";

  return (
    <div
      role="row"
      className={`flex items-center gap-2 px-3 ${py} cursor-pointer transition-colors hover:bg-stellar-card-hover border-b border-stellar-border/50 last:border-b-0 ${
        selected
          ? "bg-stellar-blue/10"
          : isUnread
          ? "bg-stellar-card"
          : "bg-stellar-card/40"
      }`}
      onClick={() => {
        if (isUnread) onMarkRead(incident.id);
      }}
      aria-selected={selected}
    >
      {/* Checkbox */}
      <div className="w-5 flex-shrink-0">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onSelect(incident.id)}
          onClick={(e) => e.stopPropagation()}
          className="accent-stellar-blue"
          aria-label={`Select alert: ${incident.title}`}
        />
      </div>

      {/* Severity icon */}
      <div className="w-4 flex-shrink-0 flex items-center justify-center">
        <SeverityIcon severity={incident.severity} />
      </div>

      {/* Title + mobile meta */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          {isUnread && (
            <span
              className="w-1.5 h-1.5 rounded-full bg-stellar-blue flex-shrink-0"
              aria-hidden="true"
            />
          )}
          <span
            className={`text-sm truncate ${
              isUnread
                ? "text-white font-medium"
                : "text-stellar-text-secondary"
            }`}
          >
            {incident.title}
          </span>
        </div>
        {/* Mobile-only secondary line */}
        <div className="flex items-center gap-2 mt-0.5 sm:hidden">
          <span
            className={`text-xs font-semibold uppercase px-1.5 py-0.5 rounded ${
              SEVERITY_BADGE[incident.severity]
            }`}
          >
            {incident.severity}
          </span>
          <span className={`text-xs capitalize ${STATUS_STYLE[incident.status]}`}>
            {incident.status}
          </span>
          <span className="text-xs text-stellar-text-muted">{incident.bridgeId}</span>
        </div>
      </div>

      {/* Bridge — desktop only */}
      <div className="hidden sm:block w-28 flex-shrink-0 min-w-0">
        <span className="text-xs text-stellar-text-muted truncate block">
          {incident.bridgeId}
          {incident.assetCode && (
            <span className="ml-1 text-stellar-text-muted/60">/{incident.assetCode}</span>
          )}
        </span>
      </div>

      {/* Severity badge — desktop only */}
      <div className="hidden sm:block w-[5.5rem] flex-shrink-0">
        <span
          className={`text-xs font-semibold uppercase px-1.5 py-0.5 rounded ${
            SEVERITY_BADGE[incident.severity]
          }`}
        >
          {incident.severity}
        </span>
      </div>

      {/* Status — desktop only */}
      <div className="hidden sm:block w-20 flex-shrink-0">
        <span className={`text-xs font-medium capitalize ${STATUS_STYLE[incident.status]}`}>
          {incident.status}
        </span>
      </div>

      {/* Time — always */}
      <div className="flex-shrink-0 w-16 text-right">
        <span className="text-xs text-stellar-text-muted whitespace-nowrap">
          {relativeTime(incident.occurredAt)}
        </span>
      </div>
    </div>
  );
}

interface CompactAlertListProps {
  className?: string;
  defaultDensity?: DensityMode;
  defaultBridgeFilter?: string;
  defaultAssetFilter?: string;
}

export default function CompactAlertList({
  className = "",
  defaultDensity = "compact",
  defaultBridgeFilter,
  defaultAssetFilter,
}: CompactAlertListProps) {
  const [density, setDensity] = useState<DensityMode>(defaultDensity);
  const [sortField, setSortField] = useState<SortField>("severity");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [severityFilter, setSeverityFilter] = useState<IncidentSeverity | "">("");
  const [statusFilter, setStatusFilter] = useState<IncidentStatus | "">("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeQuickFilter, setActiveQuickFilter] = useState<QuickFilterType>("all");

  const selectAllRef = useRef<HTMLInputElement>(null);

  const { incidents, unreadCount, isLoading, error, readIds, markRead } =
    useIncidentFeed({
      bridgeId: defaultBridgeFilter,
      assetCode: defaultAssetFilter,
      severity: severityFilter || undefined,
      status: statusFilter || undefined,
    });

  const handleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortField(field);
        setSortDir("asc");
      }
    },
    [sortField]
  );

  const handleQuickFilterClick = useCallback((filter: QuickFilterType) => {
    setActiveQuickFilter((prev) => {
      const next = prev === filter ? "all" : filter;
      setSeverityFilter("");
      setStatusFilter("");
      return next;
    });
  }, []);

  const counts = useMemo(() => {
    const allCount = incidents.filter((i) => !dismissedIds.has(i.id)).length;
    const criticalCount = incidents.filter(
      (i) => !dismissedIds.has(i.id) && i.severity === "critical"
    ).length;
    const depegCount = incidents.filter(
      (i) =>
        !dismissedIds.has(i.id) &&
        (i.title.toLowerCase().includes("depeg") ||
          i.description.toLowerCase().includes("depeg") ||
          i.title.toLowerCase().includes("deviation") ||
          i.description.toLowerCase().includes("deviation") ||
          i.title.toLowerCase().includes("peg") ||
          i.description.toLowerCase().includes("peg"))
    ).length;
    const unacknowledgedCount = incidents.filter(
      (i) => !dismissedIds.has(i.id) && !readIds.has(i.id)
    ).length;

    return {
      all: allCount,
      critical: criticalCount,
      depeg: depegCount,
      unacknowledged: unacknowledgedCount,
    };
  }, [incidents, dismissedIds, readIds]);

  const processedIncidents = useMemo(() => {
    let items = incidents.filter((i) => !dismissedIds.has(i.id));

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.bridgeId.toLowerCase().includes(q) ||
          (i.assetCode?.toLowerCase().includes(q) ?? false)
      );
    }

    if (activeQuickFilter === "critical") {
      items = items.filter((i) => i.severity === "critical");
    } else if (activeQuickFilter === "depeg") {
      items = items.filter(
        (i) =>
          i.title.toLowerCase().includes("depeg") ||
          i.description.toLowerCase().includes("depeg") ||
          i.title.toLowerCase().includes("deviation") ||
          i.description.toLowerCase().includes("deviation") ||
          i.title.toLowerCase().includes("peg") ||
          i.description.toLowerCase().includes("peg")
      );
    } else if (activeQuickFilter === "unacknowledged") {
      items = items.filter((i) => !readIds.has(i.id));
    }

    return [...items].sort((a, b) => {
      let cmp = 0;
      if (sortField === "severity") {
        cmp = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
      } else if (sortField === "time") {
        cmp =
          new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime();
      } else if (sortField === "status") {
        cmp = a.status.localeCompare(b.status);
      } else if (sortField === "title") {
        cmp = a.title.localeCompare(b.title);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [incidents, dismissedIds, searchQuery, activeQuickFilter, readIds, sortField, sortDir]);

  const allSelected =
    processedIncidents.length > 0 &&
    selectedIds.size === processedIncidents.length;
  const someSelected =
    selectedIds.size > 0 &&
    selectedIds.size < processedIncidents.length;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  const handleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === processedIncidents.length && processedIncidents.length > 0) {
        return new Set();
      }
      return new Set(processedIncidents.map((i) => i.id));
    });
  }, [processedIncidents]);

  const handleSelectRow = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleBulkMarkRead = useCallback(() => {
    selectedIds.forEach((id) => {
      if (!readIds.has(id)) markRead(id);
    });
    setSelectedIds(new Set());
  }, [selectedIds, readIds, markRead]);

  const handleBulkDismiss = useCallback(() => {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      selectedIds.forEach((id) => next.add(id));
      return next;
    });
    setSelectedIds(new Set());
  }, [selectedIds]);

  const sortProps = { current: sortField, dir: sortDir, onSort: handleSort };

  return (
    <section className={`space-y-3 ${className}`} aria-label="Compact Alert List">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-white">Alerts</h2>
          {unreadCount > 0 && (
            <span className="bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {unreadCount} new
            </span>
          )}
        </div>

        {/* Density toggle */}
        <div
          role="group"
          aria-label="Row density"
          className="flex items-center gap-0.5 rounded-md border border-stellar-border p-0.5 bg-stellar-dark/40"
        >
          <button
            type="button"
            onClick={() => setDensity("compact")}
            aria-pressed={density === "compact"}
            title="Compact rows"
            className={`flex items-center justify-center w-8 h-7 rounded transition-colors ${
              density === "compact"
                ? "bg-stellar-card text-white shadow-sm"
                : "text-stellar-text-muted hover:text-stellar-text-secondary"
            }`}
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <rect x="0" y="2.5" width="16" height="1.5" rx="0.75" />
              <rect x="0" y="7" width="16" height="1.5" rx="0.75" />
              <rect x="0" y="11.5" width="16" height="1.5" rx="0.75" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setDensity("comfortable")}
            aria-pressed={density === "comfortable"}
            title="Comfortable rows"
            className={`flex items-center justify-center w-8 h-7 rounded transition-colors ${
              density === "comfortable"
                ? "bg-stellar-card text-white shadow-sm"
                : "text-stellar-text-muted hover:text-stellar-text-secondary"
            }`}
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <rect x="0" y="1" width="16" height="2.5" rx="1.25" />
              <rect x="0" y="6.75" width="16" height="2.5" rx="1.25" />
              <rect x="0" y="12.5" width="16" height="2.5" rx="1.25" />
            </svg>
          </button>
        </div>
      </div>

      {/* Quick Filters */}
      <div className="flex flex-wrap gap-2 pb-1" role="group" aria-label="Quick filters">
        <button
          type="button"
          onClick={() => handleQuickFilterClick("all")}
          className={`px-3 py-1.5 text-xs rounded-full border transition-all font-medium flex items-center gap-1.5 ${
            activeQuickFilter === "all"
              ? "border-stellar-blue bg-stellar-blue/15 text-white shadow-sm"
              : "border-stellar-border bg-stellar-card/50 text-stellar-text-muted hover:text-white hover:border-stellar-text-secondary"
          }`}
        >
          All
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
            activeQuickFilter === "all"
              ? "bg-stellar-blue/30 text-white"
              : "bg-stellar-dark/50 text-stellar-text-muted"
          }`}>
            {counts.all}
          </span>
        </button>
        <button
          type="button"
          onClick={() => handleQuickFilterClick("critical")}
          className={`px-3 py-1.5 text-xs rounded-full border transition-all font-medium flex items-center gap-1.5 ${
            activeQuickFilter === "critical"
              ? "border-stellar-blue bg-stellar-blue/15 text-white shadow-sm"
              : "border-stellar-border bg-stellar-card/50 text-stellar-text-muted hover:text-white hover:border-stellar-text-secondary"
          }`}
        >
          Critical Only
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
            activeQuickFilter === "critical"
              ? "bg-stellar-blue/30 text-white"
              : "bg-stellar-dark/50 text-stellar-text-muted"
          }`}>
            {counts.critical}
          </span>
        </button>
        <button
          type="button"
          onClick={() => handleQuickFilterClick("depeg")}
          className={`px-3 py-1.5 text-xs rounded-full border transition-all font-medium flex items-center gap-1.5 ${
            activeQuickFilter === "depeg"
              ? "border-stellar-blue bg-stellar-blue/15 text-white shadow-sm"
              : "border-stellar-border bg-stellar-card/50 text-stellar-text-muted hover:text-white hover:border-stellar-text-secondary"
          }`}
        >
          Depeg Alerts
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
            activeQuickFilter === "depeg"
              ? "bg-stellar-blue/30 text-white"
              : "bg-stellar-dark/50 text-stellar-text-muted"
          }`}>
            {counts.depeg}
          </span>
        </button>
        <button
          type="button"
          onClick={() => handleQuickFilterClick("unacknowledged")}
          className={`px-3 py-1.5 text-xs rounded-full border transition-all font-medium flex items-center gap-1.5 ${
            activeQuickFilter === "unacknowledged"
              ? "border-stellar-blue bg-stellar-blue/15 text-white shadow-sm"
              : "border-stellar-border bg-stellar-card/50 text-stellar-text-muted hover:text-white hover:border-stellar-text-secondary"
          }`}
        >
          Unacknowledged
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
            activeQuickFilter === "unacknowledged"
              ? "bg-stellar-blue/30 text-white"
              : "bg-stellar-dark/50 text-stellar-text-muted"
          }`}>
            {counts.unacknowledged}
          </span>
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <input
          type="search"
          placeholder="Search alerts…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-stellar-card border border-stellar-border rounded px-3 py-1.5 text-sm text-white placeholder-stellar-text-muted focus:outline-none focus:border-stellar-blue w-full sm:w-56"
          aria-label="Search alerts"
        />
        <select
          value={severityFilter}
          onChange={(e) => {
            setSeverityFilter(e.target.value as IncidentSeverity | "");
            setActiveQuickFilter("all");
          }}
          className="bg-stellar-card border border-stellar-border rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-stellar-blue"
          aria-label="Filter by severity"
        >
          <option value="">All severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as IncidentStatus | "");
            setActiveQuickFilter("all");
          }}
          className="bg-stellar-card border border-stellar-border rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-stellar-blue"
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="investigating">Investigating</option>
          <option value="resolved">Resolved</option>
        </select>
      </div>

      {/* Bulk action toolbar */}
      {selectedIds.size > 0 && (
        <div
          role="toolbar"
          aria-label="Bulk actions"
          className="flex items-center gap-3 px-3 py-2 bg-stellar-blue/10 border border-stellar-blue/30 rounded-lg"
        >
          <span className="text-sm text-stellar-text-primary font-medium">
            {selectedIds.size} selected
          </span>
          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={handleBulkMarkRead}
              className="px-3 py-1.5 text-xs rounded-md border border-stellar-border text-stellar-text-secondary hover:text-white hover:border-stellar-blue transition-colors"
            >
              Mark read
            </button>
            <button
              type="button"
              onClick={handleBulkDismiss}
              className="px-3 py-1.5 text-xs rounded-md border border-red-700/50 text-red-400 hover:bg-red-900/20 transition-colors"
            >
              Dismiss
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="px-3 py-1.5 text-xs rounded-md text-stellar-text-muted hover:text-stellar-text-secondary transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* List */}
      <div
        role="table"
        aria-label="Alert rows"
        className="rounded-lg border border-stellar-border overflow-hidden"
      >
        {/* Column header row */}
        <div
          role="rowgroup"
          className="bg-stellar-dark/50 border-b border-stellar-border"
        >
          {/* Desktop header */}
          <div
            role="row"
            className="hidden sm:flex items-center gap-2 px-3 py-2"
          >
            <div className="w-5 flex-shrink-0">
              <input
                ref={selectAllRef}
                type="checkbox"
                checked={allSelected}
                onChange={handleSelectAll}
                className="accent-stellar-blue"
                aria-label="Select all alerts"
              />
            </div>
            <div className="w-4 flex-shrink-0" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <SortHeader label="Title" field="title" {...sortProps} />
            </div>
            <div className="w-28 flex-shrink-0">
              <span className="text-xs font-semibold uppercase tracking-wider text-stellar-text-muted">
                Bridge
              </span>
            </div>
            <div className="w-[5.5rem] flex-shrink-0">
              <SortHeader label="Severity" field="severity" {...sortProps} />
            </div>
            <div className="w-20 flex-shrink-0">
              <SortHeader label="Status" field="status" {...sortProps} />
            </div>
            <div className="w-16 flex-shrink-0 text-right">
              <SortHeader label="Time" field="time" {...sortProps} />
            </div>
          </div>

          {/* Mobile sort bar */}
          <div
            role="row"
            className="sm:hidden flex items-center gap-3 px-3 py-2"
          >
            <div className="w-5 flex-shrink-0">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={handleSelectAll}
                className="accent-stellar-blue"
                aria-label="Select all alerts"
              />
            </div>
            <span className="text-xs text-stellar-text-muted uppercase tracking-wide">
              Sort:
            </span>
            <SortHeader label="Sev." field="severity" {...sortProps} />
            <SortHeader label="Time" field="time" {...sortProps} />
            <SortHeader label="Status" field="status" {...sortProps} />
            <SortHeader label="Title" field="title" {...sortProps} />
          </div>
        </div>

        {/* Loading skeleton */}
        {isLoading && (
          <div role="rowgroup" className="divide-y divide-stellar-border/50">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-3 py-2 animate-pulse"
              >
                <div className="w-5 h-4 bg-stellar-border/50 rounded flex-shrink-0" />
                <div className="w-4 h-4 bg-stellar-border/50 rounded-full flex-shrink-0" />
                <div className="flex-1 h-3 bg-stellar-border/50 rounded" />
                <div className="hidden sm:block w-28 h-3 bg-stellar-border/50 rounded flex-shrink-0" />
                <div className="hidden sm:block w-16 h-3 bg-stellar-border/50 rounded flex-shrink-0" />
                <div className="hidden sm:block w-16 h-3 bg-stellar-border/50 rounded flex-shrink-0" />
                <div className="w-12 h-3 bg-stellar-border/50 rounded flex-shrink-0" />
              </div>
            ))}
          </div>
        )}

        {/* Error state */}
        {error && !isLoading && (
          <div className="p-6 text-center">
            <p className="text-sm text-red-400">
              Failed to load alerts. Please try again.
            </p>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && processedIncidents.length === 0 && (
          <div className="p-8 text-center">
            <svg
              className="w-10 h-10 mx-auto mb-3 text-stellar-text-muted"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="font-medium text-white text-sm">No alerts found</p>
            <p className="text-xs text-stellar-text-muted mt-1">
              {dismissedIds.size > 0
                ? `${dismissedIds.size} alert${dismissedIds.size !== 1 ? "s" : ""} dismissed. Adjust filters to see more.`
                : "All bridges are operating normally."}
            </p>
          </div>
        )}

        {/* Alert rows */}
        {!isLoading && !error && processedIncidents.length > 0 && (
          <div role="rowgroup">
            {processedIncidents.map((incident) => (
              <AlertRow
                key={incident.id}
                incident={incident}
                selected={selectedIds.has(incident.id)}
                isUnread={!readIds.has(incident.id)}
                density={density}
                onSelect={handleSelectRow}
                onMarkRead={markRead}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {!isLoading && !error && (
        <p className="text-xs text-stellar-text-muted text-right">
          {processedIncidents.length} alert
          {processedIncidents.length !== 1 ? "s" : ""}
          {dismissedIds.size > 0 && ` · ${dismissedIds.size} dismissed`}
        </p>
      )}
    </section>
  );
}
