import { useState } from "react";
import { useBridgeHealthTimeline, useBridges } from "../hooks/useBridgeHealthTimeline";
import type { HealthPeriod } from "../hooks/useBridgeHealthTimeline";
import { HealthTimelineChart, AnnotationList } from "../components/BridgeHealthTimeline";
import { Breadcrumb } from "../components/Breadcrumb/Breadcrumb";

const PERIODS: { id: HealthPeriod; label: string }[] = [
  { id: "24h", label: "24 Hours" },
  { id: "7d", label: "7 Days" },
  { id: "30d", label: "30 Days" },
];

function scoreColor(score: number) {
  if (score >= 80) return "text-green-400";
  if (score >= 50) return "text-yellow-400";
  return "text-red-400";
}

function scoreLabel(score: number) {
  if (score >= 80) return "Healthy";
  if (score >= 50) return "Warning";
  return "Critical";
}

function exportTimelinePdf(
  points: Array<{ timestamp: string; score: number; annotation?: string }>,
  bridgeName: string,
  period: string
) {
  const ts = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const avg = points.length
    ? Math.round(points.reduce((s, p) => s + p.score, 0) / points.length)
    : "N/A";
  const min = points.length ? Math.min(...points.map((p) => p.score)) : "N/A";
  const max = points.length ? Math.max(...points.map((p) => p.score)) : "N/A";
  const pointRows = points
    .map(
      (pt) =>
        `<tr><td>${new Date(pt.timestamp).toLocaleString()}</td><td style="text-align:center;font-weight:600;color:${pt.score >= 80 ? "#16a34a" : pt.score >= 50 ? "#ca8a04" : "#dc2626"}">${pt.score}</td><td>${pt.score >= 80 ? "Healthy" : pt.score >= 50 ? "Warning" : "Critical"}</td><td>${pt.annotation ?? ""}</td></tr>`
    )
    .join("");
  const annotated = points.filter((p) => p.annotation);
  const incidentRows = annotated.length
    ? annotated
        .map(
          (pt) =>
            `<tr><td>${new Date(pt.timestamp).toLocaleString()}</td><td>${pt.annotation}</td><td style="text-align:center;font-weight:600;color:${pt.score >= 80 ? "#16a34a" : pt.score >= 50 ? "#ca8a04" : "#dc2626"}">${pt.score}</td></tr>`
        )
        .join("")
    : `<tr><td colspan="3" style="text-align:center;color:#6b7280;">No incidents in this period</td></tr>`;

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Bridge Health Timeline - ${bridgeName} - ${period}</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; margin: 2rem; color: #111; }
  h1 { font-size: 1.6rem; margin-bottom: 0.25rem; color: #111; }
  .meta { color: #666; font-size: 0.875rem; margin-bottom: 1.5rem; }
  .stats { display: flex; gap: 1rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
  .stat { flex: 1; min-width: 120px; border: 1px solid #e5e7eb; border-radius: 8px; padding: 0.75rem; text-align: center; }
  .stat-label { font-size: 0.7rem; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; }
  .stat-value { font-size: 1.4rem; font-weight: 700; margin-top: 0.25rem; }
  h2 { font-size: 1.15rem; border-bottom: 2px solid #0057FF; padding-bottom: 0.25rem; margin-top: 2rem; }
  table { width: 100%; border-collapse: collapse; margin-top: 0.75rem; font-size: 0.85rem; }
  th { background: #f0f4ff; text-align: left; padding: 0.5rem 0.75rem; border: 1px solid #d0d7ef; }
  td { padding: 0.4rem 0.75rem; border: 1px solid #e5e7eb; }
  tr:nth-child(even) td { background: #f9fafb; }
  .footer { margin-top: 2rem; text-align: center; font-size: 0.75rem; color: #9ca3af; }
  @media print { button { display: none; } }
</style>
</head>
<body>
  <h1>Bridge Health Timeline - ${bridgeName}</h1>
  <p class="meta">Period: ${period} &nbsp;|&nbsp; Generated: ${ts} &nbsp;|&nbsp; Points: ${points.length}</p>
  <div class="stats">
    <div class="stat"><div class="stat-label">Average Score</div><div class="stat-value">${avg}</div></div>
    <div class="stat"><div class="stat-label">Lowest</div><div class="stat-value">${min}</div></div>
    <div class="stat"><div class="stat-label">Highest</div><div class="stat-value">${max}</div></div>
    <div class="stat"><div class="stat-label">Incidents</div><div class="stat-value">${annotated.length}</div></div>
  </div>
  <h2>Health Score Trend</h2>
  <table>
    <thead><tr><th>Timestamp</th><th style="text-align:center;">Score</th><th>Status</th><th>Annotation</th></tr></thead>
    <tbody>${pointRows}</tbody>
  </table>
  <h2>Incident Logs</h2>
  <table>
    <thead><tr><th>Time</th><th>Event</th><th style="text-align:center;">Score</th></tr></thead>
    <tbody>${incidentRows}</tbody>
  </table>
  <p class="footer">Bridge Watch - Executive PDF Summary - Generated ${ts}</p>
</body>
</html>`;
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}

export default function BridgeHealthTimeline() {
  const { data: bridgesData, isLoading: bridgesLoading } = useBridges();
  const bridges = bridgesData?.bridges ?? [];

  const [selectedBridge, setSelectedBridge] = useState<string>("");
  const [period, setPeriod] = useState<HealthPeriod>("7d");

  const effectiveBridge = selectedBridge || bridges[0]?.name || "";

  const { points, isLoading, isMockData } = useBridgeHealthTimeline(
    effectiveBridge,
    period
  );

  const latest = points[points.length - 1];
  const earliest = points[0];
  const avg = points.length
    ? Math.round(points.reduce((sum, p) => sum + p.score, 0) / points.length)
    : null;
  const minScore = points.length ? Math.min(...points.map((p) => p.score)) : null;
  const maxScore = points.length ? Math.max(...points.map((p) => p.score)) : null;

  return (
    <div className="space-y-6">
      <Breadcrumb />

      <header>
        <h1 className="text-3xl font-bold text-white">Bridge Health Timeline</h1>
        <p className="mt-2 text-stellar-text-secondary">
          Track health score progression for any bridge over a selected time period.
        </p>
      </header>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => exportTimelinePdf(points, effectiveBridge || "All Bridges", period)}
          disabled={isLoading || points.length === 0}
          className="inline-flex items-center gap-2 rounded-lg border border-stellar-blue bg-stellar-blue/10 px-4 py-2 text-sm font-medium text-stellar-blue transition-colors hover:bg-stellar-blue hover:text-white focus:outline-none focus:ring-2 focus:ring-stellar-blue focus:ring-offset-2 focus:ring-offset-stellar-dark disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Export PDF Timeline"
        >
          <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
          Export PDF Timeline
        </button>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[200px] max-w-xs">
          <label
            htmlFor="bridge-select"
            className="block text-sm font-medium text-stellar-text-secondary mb-1"
          >
            Bridge
          </label>
          <select
            id="bridge-select"
            value={selectedBridge || effectiveBridge}
            onChange={(e) => setSelectedBridge(e.target.value)}
            disabled={bridgesLoading}
            className="w-full rounded-lg border border-stellar-border bg-stellar-card px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-stellar-blue disabled:opacity-50"
          >
            {bridgesLoading && (
              <option value="">Loading bridges…</option>
            )}
            {bridges.map((b) => (
              <option key={b.name} value={b.name}>
                {b.name}
              </option>
            ))}
            {!bridgesLoading && bridges.length === 0 && (
              <option value="demo-bridge">Demo Bridge</option>
            )}
          </select>
        </div>

        <div>
          <p className="text-sm font-medium text-stellar-text-secondary mb-1">Time Period</p>
          <div className="flex gap-1" role="group" aria-label="Time period">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriod(p.id)}
                aria-pressed={period === p.id}
                className={`rounded px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-stellar-blue ${
                  period === p.id
                    ? "bg-stellar-blue text-white"
                    : "border border-stellar-border text-stellar-text-secondary hover:text-white"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary stats */}
      {points.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              label: "Current Score",
              value: latest?.score ?? "—",
              colorFn: (v: number) => scoreColor(v),
              sub: latest ? scoreLabel(latest.score) : "",
            },
            { label: "Average Score", value: avg ?? "—", colorFn: scoreColor, sub: "over period" },
            { label: "Lowest", value: minScore ?? "—", colorFn: scoreColor, sub: "minimum" },
            { label: "Highest", value: maxScore ?? "—", colorFn: scoreColor, sub: "maximum" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-stellar-card border border-stellar-border rounded-lg p-4"
            >
              <p className="text-xs text-stellar-text-secondary uppercase tracking-wide">{stat.label}</p>
              <p
                className={`mt-1 text-2xl font-bold ${
                  typeof stat.value === "number" ? stat.colorFn(stat.value) : "text-white"
                }`}
              >
                {stat.value}
              </p>
              {stat.sub && (
                <p className="text-xs text-stellar-text-secondary mt-0.5">{stat.sub}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Chart */}
      <div className="bg-stellar-card border border-stellar-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-white">
              {effectiveBridge || "Select a bridge"}
            </h2>
            <p className="text-xs text-stellar-text-secondary mt-0.5">
              Health score · {period} period
              {earliest && latest
                ? ` · ${new Date(earliest.timestamp).toLocaleDateString()} – ${new Date(
                    latest.timestamp
                  ).toLocaleDateString()}`
                : ""}
            </p>
          </div>

          {isMockData && (
            <span className="text-xs text-stellar-text-muted border border-stellar-border rounded px-2 py-1">
              Demo data
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="h-[300px] bg-stellar-border/20 rounded animate-pulse" />
        ) : (
          <HealthTimelineChart
            points={points}
            period={period}
            bridgeName={effectiveBridge}
            isMockData={isMockData}
          />
        )}

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 mt-4 pt-4 border-t border-stellar-border text-xs text-stellar-text-secondary">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-green-400 block rounded" />
            Healthy ≥ 80
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-yellow-400 block rounded" />
            Warning 50–79
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-red-400 block rounded" />
            Critical &lt; 50
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-yellow-500 block" />
            Annotation marker
          </span>
        </div>
      </div>

      {/* Annotations panel */}
      <div className="bg-stellar-card border border-stellar-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-white mb-3">Health Change Events</h2>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-10 bg-stellar-border/20 rounded animate-pulse" />
            ))}
          </div>
        ) : (
          <AnnotationList points={points} />
        )}
      </div>
    </div>
  );
}
