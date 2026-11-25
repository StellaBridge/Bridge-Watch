import React, { useState } from "react";

interface BridgeSLAMetric {
  bridge: string;
  sourceChain: string;
  targetChain: string;
  p50DurationSec: number;
  p90DurationSec: number;
  p99DurationSec: number;
  slaTargetSec: number;
  compliancePercentage: number;
  totalTransfers: number;
  breachedTransfers: number;
}

interface SLABreachIncident {
  id: string;
  bridge: string;
  txHash: string;
  sourceChain: string;
  targetChain: string;
  expectedDurationSec: number;
  actualDurationSec: number;
  status: "INVESTIGATING" | "RESOLVED" | "EXCUSED";
  timestamp: string;
}

export default function BridgeTransferSLATracking() {
  const [slaTarget, setSlaTarget] = useState(180);
  const [breachAlertPct, setBreachAlertPct] = useState(5.0);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const metrics: BridgeSLAMetric[] = [
    {
      bridge: "StellarX Bridge",
      sourceChain: "Stellar",
      targetChain: "Ethereum",
      p50DurationSec: 45,
      p90DurationSec: 110,
      p99DurationSec: 175,
      slaTargetSec: 180,
      compliancePercentage: 99.2,
      totalTransfers: 1420,
      breachedTransfers: 11,
    },
    {
      bridge: "Pendulum Spacewalk",
      sourceChain: "Stellar",
      targetChain: "Polkadot",
      p50DurationSec: 60,
      p90DurationSec: 140,
      p99DurationSec: 210,
      slaTargetSec: 180,
      compliancePercentage: 96.5,
      totalTransfers: 850,
      breachedTransfers: 30,
    },
    {
      bridge: "Allbridge Core",
      sourceChain: "Solana",
      targetChain: "Stellar",
      p50DurationSec: 90,
      p90DurationSec: 220,
      p99DurationSec: 340,
      slaTargetSec: 240,
      compliancePercentage: 92.1,
      totalTransfers: 620,
      breachedTransfers: 49,
    },
  ];

  const breaches: SLABreachIncident[] = [
    {
      id: "sla-breach-101",
      bridge: "Allbridge Core",
      txHash: "0x8f1e92d...4c1a",
      sourceChain: "Solana",
      targetChain: "Stellar",
      expectedDurationSec: 240,
      actualDurationSec: 485,
      status: "INVESTIGATING",
      timestamp: "1 hour ago",
    },
    {
      id: "sla-breach-102",
      bridge: "Pendulum Spacewalk",
      txHash: "0x3a4b7c...9e0f",
      sourceChain: "Stellar",
      targetChain: "Polkadot",
      expectedDurationSec: 180,
      actualDurationSec: 290,
      status: "RESOLVED",
      timestamp: "4 hours ago",
    },
  ];

  const handleConfigSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Bridge Transfer SLA Tracking</h1>
        <p className="mt-1 text-sm text-stellar-text-secondary">
          Track cross-chain transfer latency percentiles (p50, p90, p99), SLA compliance rates, and breach incidents.
        </p>
      </div>

      {/* SLA Metric Cards */}
      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
        {metrics.map((m) => (
          <div key={m.bridge} className="rounded-lg border border-stellar-border bg-stellar-card p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-white">{m.bridge}</h2>
              <span className="text-xs text-stellar-text-secondary">{m.sourceChain} ➔ {m.targetChain}</span>
            </div>

            <div className="mt-4 flex items-baseline justify-between">
              <span className="text-3xl font-extrabold text-emerald-400">{m.compliancePercentage}%</span>
              <span className="text-xs text-stellar-text-muted">Target: {m.slaTargetSec}s</span>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded bg-stellar-dark p-2">
                <span className="block text-stellar-text-muted">p50</span>
                <span className="font-bold text-white">{m.p50DurationSec}s</span>
              </div>
              <div className="rounded bg-stellar-dark p-2">
                <span className="block text-stellar-text-muted">p90</span>
                <span className="font-bold text-white">{m.p90DurationSec}s</span>
              </div>
              <div className="rounded bg-stellar-dark p-2">
                <span className="block text-stellar-text-muted">p99</span>
                <span className="font-bold text-amber-400">{m.p99DurationSec}s</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* SLA Breach Log & Config Form */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="rounded-lg border border-stellar-border bg-stellar-card p-6 lg:col-span-2">
          <h2 className="mb-4 text-lg font-semibold text-white">Recent SLA Breach Log</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-stellar-text-secondary">
              <thead className="border-b border-stellar-border bg-stellar-dark text-xs uppercase text-stellar-text-muted">
                <tr>
                  <th className="px-4 py-3">Bridge</th>
                  <th className="px-4 py-3">Route</th>
                  <th className="px-4 py-3">Expected vs Actual</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stellar-border">
                {breaches.map((b) => (
                  <tr key={b.id}>
                    <td className="px-4 py-3 font-medium text-white">{b.bridge}</td>
                    <td className="px-4 py-3">{b.sourceChain} ➔ {b.targetChain}</td>
                    <td className="px-4 py-3 text-amber-400">{b.expectedDurationSec}s / <span className="font-bold">{b.actualDurationSec}s</span></td>
                    <td className="px-4 py-3">
                      <span className={`rounded px-2 py-0.5 text-xs font-semibold ${
                        b.status === "INVESTIGATING" ? "bg-amber-500/20 text-amber-400" : "bg-emerald-500/20 text-emerald-400"
                      }`}>
                        {b.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">{b.timestamp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* SLA Threshold Config Form */}
        <div className="rounded-lg border border-stellar-border bg-stellar-card p-6">
          <h2 className="mb-4 text-lg font-semibold text-white">SLA Target Settings</h2>
          <form onSubmit={handleConfigSubmit} className="space-y-4">
            <div>
              <label htmlFor="sla-target" className="block text-xs font-medium text-stellar-text-secondary">Default Transfer SLA Target (seconds)</label>
              <input
                id="sla-target"
                type="number"
                value={slaTarget}
                onChange={(e) => setSlaTarget(Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-stellar-border bg-stellar-dark px-3 py-2 text-sm text-white focus:border-stellar-blue focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="breach-alert-threshold" className="block text-xs font-medium text-stellar-text-secondary">Breach Alert Threshold (%)</label>
              <input
                id="breach-alert-threshold"
                type="number"
                step="0.1"
                value={breachAlertPct}
                onChange={(e) => setBreachAlertPct(Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-stellar-border bg-stellar-dark px-3 py-2 text-sm text-white focus:border-stellar-blue focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-md bg-stellar-blue px-4 py-2 text-sm font-semibold text-white transition hover:bg-stellar-blue/80"
            >
              Update SLA Targets
            </button>
            {savedSuccess && (
              <p className="text-center text-xs font-medium text-emerald-400">SLA targets updated successfully!</p>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
