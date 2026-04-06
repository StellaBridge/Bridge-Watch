import { useState, useRef } from "react";
import type { BridgeAnalytics } from "../../hooks/useAnalytics";
import type { AssetWithHealth } from "../../types";

interface ExportButtonProps {
  bridgeData: BridgeAnalytics[];
  assetsData: AssetWithHealth[];
  period: string;
  isDisabled?: boolean;
}

function buildCsv(
  bridgeData: BridgeAnalytics[],
  assetsData: AssetWithHealth[],
  period: string
): string {
  const lines: string[] = [];
  const ts = new Date().toISOString();

  lines.push(`Bridge Watch Analytics Export`);
  lines.push(`Period,${period}`);
  lines.push(`Generated,${ts}`);
  lines.push("");

  // Bridge section
  lines.push(`Bridge Performance`);
  lines.push(
    "Name,Status,TVL ($),Volume 24h ($),Volume 7d ($),Volume 30d ($),Uptime 30d (%),Reserve Mismatch (%)"
  );
  for (const b of bridgeData) {
    lines.push(
      [
        `"${b.name}"`,
        b.status,
        b.tvl.toFixed(2),
        b.volume24h.toFixed(2),
        b.volume7d.toFixed(2),
        b.volume30d.toFixed(2),
        b.uptime30d.toFixed(2),
        b.mismatchPercentage.toFixed(4),
      ].join(",")
    );
  }
  lines.push("");

  // Asset health section
  lines.push(`Asset Health Scores`);
  lines.push(
    "Symbol,Name,Overall Score,Liquidity Depth,Price Stability,Bridge Uptime,Reserve Backing,Volume Trend"
  );
  for (const a of assetsData) {
    const h = a.health;
    lines.push(
      [
        a.symbol,
        `"${a.name}"`,
        h ? h.overallScore.toFixed(1) : "N/A",
        h ? h.factors.liquidityDepth.toFixed(1) : "N/A",
        h ? h.factors.priceStability.toFixed(1) : "N/A",
        h ? h.factors.bridgeUptime.toFixed(1) : "N/A",
        h ? h.factors.reserveBacking.toFixed(1) : "N/A",
        h ? h.factors.volumeTrend.toFixed(1) : "N/A",
      ].join(",")
    );
  }

  return lines.join("\n");
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function printAsPdf(
  bridgeData: BridgeAnalytics[],
  assetsData: AssetWithHealth[],
  period: string
) {
  const ts = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const bridgeRows = bridgeData
    .map(
      (b) =>
        `<tr>
          <td>${b.name}</td>
          <td>${b.status}</td>
          <td>$${(b.tvl / 1_000_000).toFixed(2)}M</td>
          <td>$${(b.volume24h / 1_000_000).toFixed(2)}M</td>
          <td>${b.uptime30d.toFixed(1)}%</td>
          <td>${b.mismatchPercentage.toFixed(2)}%</td>
        </tr>`
    )
    .join("");

  const assetRows = assetsData
    .map(
      (a) =>
        `<tr>
          <td>${a.symbol}</td>
          <td>${a.name}</td>
          <td>${a.health ? a.health.overallScore.toFixed(1) : "N/A"}</td>
        </tr>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Bridge Watch Analytics - ${period}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; color: #111; }
    h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
    .meta { color: #666; font-size: 0.875rem; margin-bottom: 2rem; }
    h2 { font-size: 1.1rem; border-bottom: 2px solid #0057FF; padding-bottom: 0.25rem; margin-top: 2rem; }
    table { width: 100%; border-collapse: collapse; margin-top: 0.75rem; font-size: 0.875rem; }
    th { background: #f0f4ff; text-align: left; padding: 0.5rem 0.75rem; border: 1px solid #d0d7ef; }
    td { padding: 0.4rem 0.75rem; border: 1px solid #e5e7eb; }
    tr:nth-child(even) td { background: #f9fafb; }
    @media print { button { display: none; } }
  </style>
</head>
<body>
  <h1>Bridge Watch Analytics Report</h1>
  <p class="meta">Period: ${period} &nbsp;|&nbsp; Generated: ${ts}</p>

  <h2>Bridge Performance</h2>
  <table>
    <thead>
      <tr>
        <th>Bridge</th><th>Status</th><th>TVL</th><th>Volume 24h</th>
        <th>Uptime 30d</th><th>Reserve Mismatch</th>
      </tr>
    </thead>
    <tbody>${bridgeRows}</tbody>
  </table>

  <h2>Asset Health Scores</h2>
  <table>
    <thead>
      <tr><th>Symbol</th><th>Name</th><th>Overall Score</th></tr>
    </thead>
    <tbody>${assetRows}</tbody>
  </table>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  // defer print so the document finishes rendering
  setTimeout(() => win.print(), 400);
}

export default function ExportButton({
  bridgeData,
  assetsData,
  period,
  isDisabled = false,
}: ExportButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const handleClickOutside = (e: MouseEvent) => {
    if (ref.current && !ref.current.contains(e.target as Node)) {
      setOpen(false);
      document.removeEventListener("mousedown", handleClickOutside);
    }
  };

  const toggle = () => {
    if (!open) document.addEventListener("mousedown", handleClickOutside);
    setOpen((v) => !v);
  };

  const onCsv = () => {
    const csv = buildCsv(bridgeData, assetsData, period);
    const date = new Date().toISOString().slice(0, 10);
    downloadFile(csv, `bridge-watch-analytics-${period.toLowerCase()}-${date}.csv`, "text/csv");
    setOpen(false);
  };

  const onPdf = () => {
    printAsPdf(bridgeData, assetsData, period);
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggle}
        disabled={isDisabled}
        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-stellar-border bg-stellar-card text-sm font-medium text-white hover:border-stellar-blue/60 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        Export
        <svg className="w-3.5 h-3.5 text-stellar-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-44 bg-stellar-card border border-stellar-border rounded-lg shadow-xl z-20 overflow-hidden">
          <button
            onClick={onCsv}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-white hover:bg-stellar-border/60 transition-colors"
          >
            <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export as CSV
          </button>
          <button
            onClick={onPdf}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-white hover:bg-stellar-border/60 transition-colors border-t border-stellar-border"
          >
            <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            Export as PDF
          </button>
        </div>
      )}
    </div>
  );
}
