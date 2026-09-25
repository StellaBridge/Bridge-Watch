import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DataCorrections } from "../components/DataCorrections";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  getReconciliationDriftSummaries,
  getReconciliationMismatchDetail,
  updateReconciliationTriage,
} from "../services/api";
import { formatUtcDate } from "../utils/formatUtcDate";
import type {
  CommitmentVerificationStatus,
  DriftSeverity,
  DriftTrendDirection,
  ReconciliationDriftSummary,
  ReconciliationRange,
  ReconciliationRun,
  ReconciliationSourceDatum,
  ReconciliationTriageStatus,
} from "../types";

interface DashboardFilters {
  assetCode: string;
  bridge: string;
  range: ReconciliationRange;
}

interface HistoryChartPoint {
  id: string;
  time: string;
  timestamp: string;
  mismatch: number | null;
  status: string;
}

const rangeOptions: Array<{ value: ReconciliationRange; label: string }> = [
  { value: "24h", label: "24H" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "90d", label: "90D" },
];

const triageOptions: Array<{ value: ReconciliationTriageStatus; label: string }> = [
  { value: "open", label: "Open" },
  { value: "investigating", label: "Investigating" },
  { value: "acknowledged", label: "Acknowledged" },
  { value: "resolved", label: "Resolved" },
  { value: "false_positive", label: "False positive" },
];

const severityClass: Record<DriftSeverity, string> = {
  aligned: "border-green-500/40 bg-green-500/10 text-green-300",
  low: "border-blue-500/40 bg-blue-500/10 text-blue-300",
  medium: "border-yellow-500/40 bg-yellow-500/10 text-yellow-300",
  high: "border-orange-500/40 bg-orange-500/10 text-orange-300",
  critical: "border-red-500/40 bg-red-500/10 text-red-300",
};

const triageClass: Record<ReconciliationTriageStatus, string> = {
  open: "text-red-300",
  investigating: "text-yellow-300",
  acknowledged: "text-blue-300",
  resolved: "text-green-300",
  false_positive: "text-stellar-text-secondary",
};

const verificationStatusConfig: Record<CommitmentVerificationStatus, { cls: string; label: string; dot: string }> = {
  verified: { cls: "border-green-500/40 bg-green-500/10 text-green-300", label: "Verified", dot: "bg-green-400" },
  challenged: { cls: "border-orange-500/40 bg-orange-500/10 text-orange-300", label: "Challenged", dot: "bg-orange-400 animate-pulse" },
  pending: { cls: "border-slate-500/40 bg-slate-500/10 text-slate-300", label: "Pending", dot: "bg-slate-400" },
  invalid: { cls: "border-red-500/40 bg-red-500/10 text-red-300", label: "Invalid", dot: "bg-red-400" },
  unknown: { cls: "border-gray-500/40 bg-gray-500/10 text-gray-400", label: "Unknown", dot: "bg-gray-500" },
};

const trendLabel: Record<DriftTrendDirection, string> = {
  new: "New",
  improving: "Improving",
  worsening: "Worsening",
  flat: "Flat",
};

const compactNumber = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 2,
});

const fullNumber = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 7,
});

function formatSupply(value: number | null): string {
  if (value === null) return "--";
  return compactNumber.format(value);
}

function formatFullSupply(value: number | null): string {
  if (value === null) return "--";
  return fullNumber.format(value);
}

function formatMismatch(value: number | null): string {
  if (value === null) return "--";
  return `${value.toFixed(value >= 1 ? 2 : 3)}%`;
}

function formatSignedMismatch(value: number | null): string {
  if (value === null) return "--";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatMismatch(value)}`;
}

function formatTime(value: string | null): string {
  if (!value) return "--";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(value: string): string {
  return formatUtcDate(value);
}

function titleCase(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function HistoryTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number | null; payload: HistoryChartPoint }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  return (
    <div className="rounded-lg border border-stellar-border bg-stellar-card p-3 text-xs shadow-xl">
      <p className="font-medium text-white">{label}</p>
      <p className="mt-1 text-stellar-text-secondary">
        Mismatch: <span className="text-white">{formatMismatch(point?.mismatch ?? null)}</span>
      </p>
      <p className="text-stellar-text-secondary">
        Status: <span className="text-white">{titleCase(point?.status ?? "unknown")}</span>
      </p>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: DriftSeverity }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${severityClass[severity]}`}>
      {titleCase(severity)}
    </span>
  );
}

function SourceDatumCard({ datum }: { datum: ReconciliationSourceDatum }) {
  const detailEntries = Object.entries(datum.details).filter(([, value]) => value !== null && value !== "");

  return (
    <article className="rounded-lg border border-stellar-border bg-stellar-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-white">{datum.label}</h3>
          <p className="mt-1 text-sm text-stellar-text-secondary">{datum.source}</p>
        </div>
        <span className="rounded-full border border-stellar-border px-2 py-1 text-xs text-stellar-text-secondary">
          {titleCase(datum.status)}
        </span>
      </div>
      <p className="mt-4 text-2xl font-semibold text-white">
        {formatFullSupply(datum.value)} <span className="text-sm text-stellar-text-secondary">{datum.unit}</span>
      </p>
      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-stellar-text-secondary">Observed</dt>
          <dd className="text-right text-white">{formatTime(datum.observedAt)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-stellar-text-secondary">Reference</dt>
          <dd className="max-w-[14rem] truncate text-right text-white" title={datum.reference ?? undefined}>
            {datum.reference ?? "--"}
          </dd>
        </div>
        {detailEntries.slice(0, 4).map(([key, value]) => (
          <div key={key} className="flex justify-between gap-3">
            <dt className="text-stellar-text-secondary">{titleCase(key)}</dt>
            <dd className="max-w-[14rem] truncate text-right text-white" title={String(value)}>
              {String(value)}
            </dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

function VerificationStatusBadge({ status }: { status: CommitmentVerificationStatus }) {
  const config = verificationStatusConfig[status] ?? verificationStatusConfig.unknown;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${config.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}

function SummaryRow({
  summary,
  active,
  onSelect,
}: {
  summary: ReconciliationDriftSummary;
  active: boolean;
  onSelect: (id: string) => void;
}) {
  const latest = summary.latestRun;

  return (
    <tr className={active ? "bg-stellar-blue/10" : "hover:bg-stellar-dark/60"}>
      <td className="px-4 py-3">
        <button
          type="button"
          onClick={() => onSelect(latest.id)}
          className="text-left focus:outline-none focus:ring-2 focus:ring-stellar-blue"
        >
          <span className="block font-medium text-white">{summary.assetCode}</span>
          <span className="text-xs text-stellar-text-secondary">{summary.bridgeName}</span>
        </button>
      </td>
      <td className="px-4 py-3">
        <SeverityBadge severity={summary.severity} />
      </td>
      <td className="px-4 py-3 text-white">{formatMismatch(latest.mismatchPercentage)}</td>
      <td className="px-4 py-3 text-stellar-text-secondary">{trendLabel[summary.trendDirection]}</td>
      <td className={`px-4 py-3 ${triageClass[latest.triageStatus]}`}>
        {titleCase(latest.triageStatus)}
      </td>
      <td className="px-4 py-3 text-stellar-text-secondary">{formatTime(summary.lastSeenAt)}</td>
    </tr>
  );
}

export default function Reconciliation() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<DashboardFilters>({
    assetCode: "",
    bridge: "",
    range: "7d",
  });
  const [selectedMismatchId, setSelectedMismatchId] = useState<string | null>(null);
  const [triageStatus, setTriageStatus] = useState<ReconciliationTriageStatus>("open");
  const [triageOwner, setTriageOwner] = useState("");
  const [triageNote, setTriageNote] = useState("");

  const summaryQuery = useQuery({
    queryKey: ["reconciliation-drift", filters],
    queryFn: () =>
      getReconciliationDriftSummaries({
        assetCode: filters.assetCode || undefined,
        bridge: filters.bridge || undefined,
        range: filters.range,
      }),
  });

  const summaries = summaryQuery.data?.summaries ?? [];
  const selectedSummary = summaries.find((summary) => summary.latestRun.id === selectedMismatchId) ?? summaries[0] ?? null;

  useEffect(() => {
    if (summaries.length === 0) {
      if (selectedMismatchId !== null) setSelectedMismatchId(null);
      return;
    }

    if (!summaries.some((summary) => summary.latestRun.id === selectedMismatchId)) {
      setSelectedMismatchId(summaries[0].latestRun.id);
    }
  }, [selectedMismatchId, summaries]);

  const detailQuery = useQuery({
    queryKey: ["reconciliation-mismatch", selectedMismatchId, filters.range],
    queryFn: () => getReconciliationMismatchDetail(selectedMismatchId ?? "", filters.range),
    enabled: !!selectedMismatchId,
  });

  const selectedRun = detailQuery.data?.mismatch ?? selectedSummary?.latestRun ?? null;

  useEffect(() => {
    if (!selectedRun) return;
    setTriageStatus(selectedRun.triageStatus);
    setTriageOwner(selectedRun.triageOwner ?? "");
    setTriageNote(selectedRun.triageNote ?? "");
  }, [selectedRun?.id, selectedRun?.triageNote, selectedRun?.triageOwner, selectedRun?.triageStatus]);

  const triageMutation = useMutation({
    mutationFn: (payload: {
      id: string;
      status: ReconciliationTriageStatus;
      owner: string | null;
      note: string | null;
    }) =>
      updateReconciliationTriage(payload.id, {
        status: payload.status,
        owner: payload.owner,
        note: payload.note,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["reconciliation-drift"] });
      void queryClient.invalidateQueries({ queryKey: ["reconciliation-mismatch"] });
    },
  });

  const stats = useMemo(() => {
    const highestMismatch = summaries.reduce(
      (max, summary) => Math.max(max, summary.latestRun.mismatchPercentage ?? 0),
      0
    );
    const totalDiscrepancy = summaries.reduce(
      (sum, summary) => sum + (summary.latestRun.discrepancyAbs ?? 0),
      0
    );

    return {
      highestMismatch,
      totalDiscrepancy,
      unresolved: summaryQuery.data?.totals.unresolved ?? 0,
      critical: summaryQuery.data?.totals.critical ?? 0,
    };
  }, [summaries, summaryQuery.data?.totals.critical, summaryQuery.data?.totals.unresolved]);

  const historySource = detailQuery.data?.history.length
    ? detailQuery.data.history
    : selectedSummary?.history ?? [];

  const chartData = useMemo<HistoryChartPoint[]>(
    () =>
      historySource.map((run) => ({
        id: run.id,
        timestamp: run.startedAt,
        time: formatDate(run.startedAt),
        mismatch: run.mismatchPercentage,
        status: run.status,
      })),
    [historySource]
  );

  const sourceData = detailQuery.data?.sourceData ?? selectedRun?.sourceData ?? [];

  const updateFilter = <K extends keyof DashboardFilters>(
    key: K,
    value: DashboardFilters[K]
  ) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const handleTriageSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedRun) return;

    triageMutation.mutate({
      id: selectedRun.id,
      status: triageStatus,
      owner: triageOwner.trim() || null,
      note: triageNote.trim() || null,
    });
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Reconciliation</h1>
          <p className="mt-2 max-w-3xl text-stellar-text-secondary">
            Compare on-chain supply, reserve attestations, and reported backing across monitored bridges.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void summaryQuery.refetch()}
          className="self-start rounded-md border border-stellar-border px-4 py-2 text-sm font-medium text-white transition hover:border-stellar-blue"
        >
          Refresh
        </button>
      </div>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="Reconciliation summary">
        {[
          { label: "Unresolved", value: stats.unresolved.toString(), tone: stats.unresolved > 0 ? "text-yellow-300" : "text-green-300" },
          { label: "Critical drift", value: stats.critical.toString(), tone: stats.critical > 0 ? "text-red-300" : "text-green-300" },
          { label: "Highest mismatch", value: formatMismatch(stats.highestMismatch), tone: stats.highestMismatch > 1 ? "text-orange-300" : "text-green-300" },
          { label: "Absolute discrepancy", value: formatSupply(stats.totalDiscrepancy), tone: "text-white" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border border-stellar-border bg-stellar-card p-5">
            <p className="text-sm text-stellar-text-secondary">{stat.label}</p>
            <p className={`mt-2 text-2xl font-semibold ${stat.tone}`}>{stat.value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-lg border border-stellar-border bg-stellar-card p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-2">
            <label className="block text-sm">
              <span className="text-stellar-text-secondary">Asset</span>
              <select
                value={filters.assetCode}
                onChange={(event) => updateFilter("assetCode", event.target.value)}
                className="mt-1 w-full rounded-md border border-stellar-border bg-stellar-dark px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-stellar-blue"
              >
                <option value="">All assets</option>
                {(summaryQuery.data?.availableFilters.assets ?? []).map((asset) => (
                  <option key={asset} value={asset}>{asset}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-stellar-text-secondary">Bridge</span>
              <select
                value={filters.bridge}
                onChange={(event) => updateFilter("bridge", event.target.value)}
                className="mt-1 w-full rounded-md border border-stellar-border bg-stellar-dark px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-stellar-blue"
              >
                <option value="">All bridges</option>
                {(summaryQuery.data?.availableFilters.bridges ?? []).map((bridge) => (
                  <option key={bridge} value={bridge}>{bridge}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="inline-flex rounded-md border border-stellar-border p-1" aria-label="Time range">
            {rangeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => updateFilter("range", option.value)}
                aria-pressed={filters.range === option.value}
                className={`min-w-14 rounded px-3 py-2 text-sm font-medium transition ${
                  filters.range === option.value
                    ? "bg-stellar-blue text-white"
                    : "text-stellar-text-secondary hover:text-white"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(22rem,0.75fr)]">
        <section className="rounded-lg border border-stellar-border bg-stellar-card">
          <div className="flex items-center justify-between border-b border-stellar-border px-4 py-3">
            <h2 className="text-lg font-semibold text-white">Drift Queue</h2>
            <span className="text-sm text-stellar-text-secondary">
              {summaryQuery.isFetching ? "Updating" : `${summaries.length} rows`}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-stellar-border text-left text-stellar-text-secondary">
                  <th scope="col" className="px-4 py-3 font-medium">Pair</th>
                  <th scope="col" className="px-4 py-3 font-medium">Severity</th>
                  <th scope="col" className="px-4 py-3 font-medium">Mismatch</th>
                  <th scope="col" className="px-4 py-3 font-medium">Trend</th>
                  <th scope="col" className="px-4 py-3 font-medium">Triage</th>
                  <th scope="col" className="px-4 py-3 font-medium">Last seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stellar-border">
                {summaryQuery.isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-stellar-text-secondary">
                      Loading reconciliation drift
                    </td>
                  </tr>
                ) : summaries.length > 0 ? (
                  summaries.map((summary) => (
                    <SummaryRow
                      key={summary.id}
                      summary={summary}
                      active={summary.latestRun.id === selectedRun?.id}
                      onSelect={setSelectedMismatchId}
                    />
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-stellar-text-secondary">
                      No reconciliation drift found for the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-lg border border-stellar-border bg-stellar-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Triage</h2>
              {selectedRun && (
                <p className="mt-1 text-sm text-stellar-text-secondary">
                  {selectedRun.assetCode} on {selectedRun.bridgeName}
                </p>
              )}
            </div>
            {selectedRun && <SeverityBadge severity={selectedRun.severity} />}
          </div>

          {selectedRun ? (
            <form onSubmit={handleTriageSubmit} className="mt-5 space-y-4">
              <label className="block text-sm">
                <span className="text-stellar-text-secondary">Status</span>
                <select
                  value={triageStatus}
                  onChange={(event) => setTriageStatus(event.target.value as ReconciliationTriageStatus)}
                  className="mt-1 w-full rounded-md border border-stellar-border bg-stellar-dark px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-stellar-blue"
                >
                  {triageOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-stellar-text-secondary">Owner</span>
                <input
                  value={triageOwner}
                  onChange={(event) => setTriageOwner(event.target.value)}
                  className="mt-1 w-full rounded-md border border-stellar-border bg-stellar-dark px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-stellar-blue"
                  placeholder="ops-oncall"
                />
              </label>
              <label className="block text-sm">
                <span className="text-stellar-text-secondary">Note</span>
                <textarea
                  value={triageNote}
                  onChange={(event) => setTriageNote(event.target.value)}
                  rows={5}
                  className="mt-1 w-full resize-none rounded-md border border-stellar-border bg-stellar-dark px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-stellar-blue"
                />
              </label>
              <button
                type="submit"
                disabled={triageMutation.isPending}
                className="w-full rounded-md bg-stellar-blue px-4 py-2 text-sm font-semibold text-white transition hover:bg-stellar-blue/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {triageMutation.isPending ? "Saving" : "Save triage"}
              </button>
              {triageMutation.isError && (
                <p className="text-sm text-red-300" role="alert">Triage update failed.</p>
              )}
              {triageMutation.isSuccess && (
                <p className="text-sm text-green-300" role="status">Triage saved.</p>
              )}
            </form>
          ) : (
            <p className="mt-5 text-sm text-stellar-text-secondary">No mismatch selected.</p>
          )}
        </section>
      </div>

      {selectedRun && (
        <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
          <div className="rounded-lg border border-stellar-border bg-stellar-card p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Mismatch History</h2>
                <p className="mt-1 text-sm text-stellar-text-secondary">
                  {selectedRun.assetCode} discrepancy over {filters.range}
                </p>
              </div>
              <div className="text-right text-sm">
                <p className="text-stellar-text-secondary">Delta</p>
                <p className={selectedSummary?.mismatchDelta && selectedSummary.mismatchDelta > 0 ? "text-red-300" : "text-green-300"}>
                  {formatSignedMismatch(selectedSummary?.mismatchDelta ?? null)}
                </p>
              </div>
            </div>
            <div className="mt-5 h-72">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="#1E2340" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="time" tick={{ fill: "#8A8FA8", fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis
                      tickFormatter={(value) => `${Number(value).toFixed(1)}%`}
                      tick={{ fill: "#8A8FA8", fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                      width={48}
                    />
                    <Tooltip content={<HistoryTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="mismatch"
                      stroke="#00D4AA"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-stellar-text-secondary">
                  No history points available.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-stellar-border bg-stellar-card p-5">
            <h2 className="text-lg font-semibold text-white">Current Values</h2>
            <dl className="mt-5 space-y-3 text-sm">
              {[
                { label: "On-chain supply", value: `${formatFullSupply(selectedRun.stellarSupply)} ${selectedRun.assetCode}` },
                { label: "Reported backing", value: `${formatFullSupply(selectedRun.reportedSupply)} ${selectedRun.assetCode}` },
                { label: "Discrepancy", value: `${formatFullSupply(selectedRun.discrepancy)} ${selectedRun.assetCode}` },
                { label: "Mismatch", value: formatMismatch(selectedRun.mismatchPercentage) },
                { label: "Last finished", value: formatTime(selectedRun.finishedAt) },
              ].map((item) => (
                <div key={item.label} className="flex justify-between gap-4 border-b border-stellar-border/60 pb-3 last:border-0 last:pb-0">
                  <dt className="text-stellar-text-secondary">{item.label}</dt>
                  <dd className="text-right font-medium text-white">{item.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      )}

      {sourceData.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-white">Source Data</h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {sourceData.map((datum) => (
              <SourceDatumCard key={datum.id} datum={datum} />
            ))}
          </div>
        </section>
      )}

      {detailQuery.data?.reserveCommitment && (
        <section className="rounded-lg border border-stellar-border bg-stellar-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Reserve Commitment</h2>
              <p className="mt-1 text-sm text-stellar-text-secondary">
                On-chain Merkle commitment for {detailQuery.data.reserveCommitment.bridgeId}
              </p>
            </div>
            <VerificationStatusBadge status={detailQuery.data.reserveCommitment.verificationStatus} />
          </div>
          <dl className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <dt className="text-stellar-text-secondary text-xs">Sequence</dt>
              <dd className="mt-1 text-white font-mono">
                {detailQuery.data.reserveCommitment.sequence ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-stellar-text-secondary text-xs">Merkle Root</dt>
              <dd className="mt-1 text-white font-mono text-xs break-all">
                {detailQuery.data.reserveCommitment.merkleRoot || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-stellar-text-secondary text-xs">Total Reserves</dt>
              <dd className="mt-1 text-white font-mono">
                {formatFullSupply(detailQuery.data.reserveCommitment.totalReserves)}
              </dd>
            </div>
            <div>
              <dt className="text-stellar-text-secondary text-xs">Status</dt>
              <dd className="mt-1 text-white">
                {titleCase(detailQuery.data.reserveCommitment.status)}
              </dd>
            </div>
            <div>
              <dt className="text-stellar-text-secondary text-xs">Transaction</dt>
              <dd className="mt-1 text-white font-mono text-xs break-all max-w-[200px]">
                {detailQuery.data.reserveCommitment.txHash || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-stellar-text-secondary text-xs">Committed</dt>
              <dd className="mt-1 text-white">
                {detailQuery.data.reserveCommitment.committedAt
                  ? formatTime(String(detailQuery.data.reserveCommitment.committedAt))
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-stellar-text-secondary text-xs">Ledger</dt>
              <dd className="mt-1 text-white font-mono">
                {detailQuery.data.reserveCommitment.committedLedger > 0
                  ? detailQuery.data.reserveCommitment.committedLedger.toLocaleString()
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-stellar-text-secondary text-xs">Verification</dt>
              <dd className="mt-1">
                <VerificationStatusBadge status={detailQuery.data.reserveCommitment.verificationStatus} />
              </dd>
            </div>
          </dl>
        </section>
      )}

      {selectedRun && (
        <section className="rounded-lg border border-stellar-border bg-stellar-card">
          <div className="border-b border-stellar-border px-4 py-3">
            <h2 className="text-lg font-semibold text-white">Run History</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-stellar-border text-left text-stellar-text-secondary">
                  <th scope="col" className="px-4 py-3 font-medium">Started</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 font-medium">Mismatch</th>
                  <th scope="col" className="px-4 py-3 font-medium">Stellar supply</th>
                  <th scope="col" className="px-4 py-3 font-medium">Reported backing</th>
                  <th scope="col" className="px-4 py-3 font-medium">Triage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stellar-border">
                {(detailQuery.data?.history ?? []).map((run: ReconciliationRun) => (
                  <tr key={run.id}>
                    <td className="px-4 py-3 text-stellar-text-secondary">{formatTime(run.startedAt)}</td>
                    <td className="px-4 py-3 text-white">{titleCase(run.status)}</td>
                    <td className="px-4 py-3 text-white">{formatMismatch(run.mismatchPercentage)}</td>
                    <td className="px-4 py-3 text-stellar-text-secondary">{formatSupply(run.stellarSupply)}</td>
                    <td className="px-4 py-3 text-stellar-text-secondary">{formatSupply(run.reportedSupply)}</td>
                    <td className={`px-4 py-3 ${triageClass[run.triageStatus]}`}>{titleCase(run.triageStatus)}</td>
                  </tr>
                ))}
                {!detailQuery.data?.history.length && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-stellar-text-secondary">
                      Select a queue item to load run history.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* #1241 — Mount orphaned DataCorrections panel */}
      <DataCorrections />
    </div>
  );
}
