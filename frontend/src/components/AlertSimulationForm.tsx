import { useState, useEffect } from "react";
import {
  useAlertSimulation,
  type SimulationInput,
  type SimulationSeverity,
  SimulationInput as SimulationInputType,
} from "../hooks/useAlertSimulation";
import { SEVERITY_STYLES, CHANNEL_LABELS, PRESETS, DEFAULT_INPUT } from "../pages/AlertSimulationSandbox";

const inputCls =
  "bg-stellar-card border border-stellar-border rounded px-3 py-2 text-sm text-white placeholder-stellar-text-muted focus:outline-none focus:border-stellar-blue w-full";

export type AlertSimulationFormProps = {
  adminToken: string;
  setAdminToken: (token: string) => void;
  onRunSimulation: (input: SimulationInputType) => void;
  isRunning: boolean;
  adminTokenValid: boolean;
};

export function AlertSimulationForm({
  adminToken,
  setAdminToken,
  onRunSimulation,
  isRunning,
  adminTokenValid,
}: AlertSimulationFormProps) {
  const [input, setInput] = useState<SimulationInput>(() => {
    try {
      const saved = localStorage.getItem("sim_input");
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return {
      severity: "high",
      assetCode: "",
      sourceType: "",
      ownerAddress: "",
      label: "",
      triggeredValue: null,
      threshold: null,
      metric: "",
    };
  });

  const applyPreset = (preset: typeof PRESETS[number]) => {
    setInput({
      severity: preset.input.severity,
      assetCode: preset.input.assetCode,
      sourceType: preset.input.sourceType,
      metric: preset.input.metric,
      triggeredValue: preset.input.triggeredValue,
      threshold: preset.input.threshold,
    });
  }

  useEffect(() => {
    try {
      localStorage.setItem("sim_input", JSON.stringify(input));
    } catch {
      // ignore
    }
  }, [input]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onRunSimulation(input);
  }

  return (
    <div className="space-y-4">
      {/* Admin token */}
      <div className="bg-stellar-card border border-stellar-border rounded-lg p-4">
        <label
          htmlFor="sim-admin-token"
          className="block text-xs font-semibold uppercase tracking-wider text-stellar-text-muted mb-2"
        >
          Admin API Token
        </label>
        <input
          id="sim-admin-token"
          type="password"
          value={adminToken}
          onChange={(e) => setAdminToken(e.target.value)}
          placeholder="Enter admin API key"
          className="bg-stellar-card border border-stellar-border rounded px-3 py-2 text-sm text-white placeholder-stellar-text-muted focus:outline-none focus:border-stellar-blue w-full"
          autoComplete="current-password"
        />
      </div>

      {/* Scenario presets */}
      <div className="bg-stellar-card border border-stellar-border rounded-lg p-4">
        <h3 className="text-sm font-semibold text-white mb-3">Scenario Presets</h3>
        <div className="grid grid-cols-2 gap-2">
          {([
            {
              id: "critical_bridge",
              label: "Critical Bridge Failure",
              description: "Complete bridge outage, funds at risk",
              input: {
                severity: "critical" as SimulationSeverity,
                assetCode: "USDC",
                sourceType: "bridge",
                metric: "bridge_health",
                triggeredValue: 0,
                threshold: 100,
              },
            },
            {
              id: "token_exploit",
              label: "Token Exploit",
              description: "Security vulnerability detected",
              input: {
                severity: "critical" as SimulationSeverity,
                assetCode: "ETH",
                sourceType: "security",
                metric: "exploit_severity",
                triggeredValue: 1,
                threshold: 0,
              },
            },
            {
              id: "tvl_anomaly",
              label: "TVL Anomaly",
              description: "Significant total value locked drop",
              input: {
                severity: "high" as SimulationSeverity,
                assetCode: "WBTC",
                sourceType: "analytics",
                metric: "tvl_usd",
                triggeredValue: 8500000,
                threshold: 10000000,
              },
            },
            {
              id: "reserve_drift",
              label: "Reserve Backing Drift",
              description: "Collateral ratio below threshold",
              input: {
                severity: "high" as SimulationSeverity,
                assetCode: "USDT",
                sourceType: "reconciliation",
                metric: "backing_ratio",
                triggeredValue: 0.94,
                threshold: 0.98,
              },
            },
            {
              id: "gas_spike",
              label: "Gas Price Spike",
              description: "Network fees impacting operations",
              input: {
                severity: "medium" as SimulationSeverity,
                assetCode: "",
                sourceType: "network",
                metric: "gas_gwei",
                triggeredValue: 250,
                threshold: 100,
              },
            },
            {
              id: "maintenance",
              label: "Scheduled Maintenance",
              description: "Low-priority maintenance window",
              input: {
                severity: "low" as SimulationSeverity,
                assetCode: "",
                sourceType: "maintenance",
                metric: "maintenance_flag",
                triggeredValue: 1,
                threshold: 0,
              },
            },
          ].map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => {
                setInput({
                  severity: preset.input.severity,
                  assetCode: preset.input.assetCode,
                  sourceType: preset.input.sourceType,
                  metric: preset.input.metric,
                  triggeredValue: preset.input.triggeredValue,
                  threshold: preset.input.threshold,
                });
              }
              className="text-left p-2.5 rounded-md border border-stellar-border/70 bg-stellar-dark/30 hover:border-stellar-blue hover:bg-stellar-blue/5 transition-colors"
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                <span
                  className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    SEVERITY_STYLES[preset.input.severity as keyof typeof SEVERITY_STYLES]?.dot ??
                      "bg-gray-500"
                  }`}
                />
                <span className="text-xs font-medium text-white truncate">{preset.label}</span>
              </div>
              <p className="text-xs text-stellar-text-muted truncate">{preset.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Input form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onRunSimulation(input);
        }}
        className="bg-stellar-card border border-stellar-border rounded-lg p-4 space-y-4"
      >
        <h3 className="text-sm font-semibold text-white">Alert Parameters</h3>

        {/* Severity selector */}
        <fieldset>
          <legend className="block text-xs font-semibold text-stellar-text-muted uppercase tracking-wider mb-1.5">
            Severity <span className="text-red-400" aria-hidden="true">*</span>
          </legend>
          <div className="grid grid-cols-4 gap-1" role="group" aria-label="Select severity">
            {(["critical", "high", "medium", "low"] as const).map((sev) => (
              <button
                key={sev}
                type="button"
                onClick={() =>
                  setInput((p) => ({ ...p, severity: sev }))
                }
                aria-pressed={input.severity === sev}
                className={`py-1.5 rounded text-xs font-semibold uppercase transition-colors ${
                  input.severity === sev
                    ? `bg-red-900/50 text-red-400 border border-red-700`
                    : "bg-stellar-dark/30 text-stellar-text-muted border border-stellar-border/50 hover:text-stellar-text-secondary"
                }`}
              >
                {sev}
              </button>
            ))}
          </div>
        </fieldset>

        {/* Asset code */}
        <div>
          <label
            htmlFor="sim-asset"
            className="block text-xs font-semibold text-stellar-text-muted uppercase tracking-wider mb-1.5"
          >
            Asset Code
          </label>
          <input
            id="sim-asset"
            type="text"
            value={input.assetCode}
            onChange={(e) =>
              setInput((p) => ({ ...p, assetCode: e.target.value.toUpperCase() }))
            }
            placeholder="e.g. USDC, ETH, WBTC"
            className="bg-stellar-card border border-stellar-border rounded px-3 py-2 text-sm text-white placeholder-stellar-text-muted focus:outline-none focus:border-stellar-blue w-full"
          />
        </div>

        {/* Source type */}
        <div>
          <label
            htmlFor="sim-source"
            className="block text-xs font-semibold text-stellar-text-muted uppercase tracking-wider mb-1.5"
          >
            Source Type
          </label>
          <input
            id="sim-source"
            type="text"
            value={input.sourceType}
            onChange={(e) => setInput((p) => ({ ...p, sourceType: e.target.value }))}
            placeholder="e.g. bridge, security, analytics"
            className="bg-stellar-card border border-stellar-border rounded px-3 py-2 text-sm text-white placeholder-stellar-text-muted focus:outline-none focus:border-stellar-blue w-full"
          />
        </div>

        {/* Owner address */}
        <div>
          <label
            htmlFor="sim-owner"
            className="block text-xs font-semibold text-stellar-text-muted uppercase tracking-wider mb-1.5"
          >
            Owner Address
          </label>
          <input
            id="sim-owner"
            type="text"
            value={input.ownerAddress}
            onChange={(e) => setInput((p) => ({ ...p, ownerAddress: e.target.value }))}
            placeholder="e.g. GBXXXX..."
            className="bg-stellar-card border border-stellar-border rounded px-3 py-2 text-sm text-white placeholder-stellar-text-muted focus:outline-none focus:border-stellar-blue w-full"
          />
        </div>

        {/* Label */}
        <div>
          <label
            htmlFor="sim-label"
            className="block text-xs font-semibold text-stellar-text-muted uppercase tracking-wider mb-1.5"
          >
            Label (optional)
          </label>
          <input
            id="sim-label"
            type="text"
            value={input.label}
            onChange={(e) => setInput((p) => ({ ...p, label: e.target.value }))}
            placeholder="e.g. Pre-launch validation"
            maxLength={120}
            className="bg-stellar-card border border-stellar-border rounded px-3 py-2 text-sm text-white placeholder-stellar-text-muted focus:outline-none focus:border-stellar-blue w-full"
          />
        </div>

        {/* Triggered value / threshold */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="sim-triggered"
              className="block text-xs font-semibold text-stellar-text-muted uppercase tracking-wider mb-1.5"
            >
              Triggered Value
            </label>
            <input
              id="sim-triggered"
              type="number"
              value={input.triggeredValue ?? ""}
              onChange={(e) =>
                setInput((p) => ({
                  ...p,
                  triggeredValue: e.target.value === "" ? null : Number(e.target.value),
                }))
              }
              placeholder="0"
              className="bg-stellar-card border border-stellar-border rounded px-3 py-2 text-sm text-white placeholder-stellar-text-muted focus:outline-none focus:border-stellar-blue w-full"
            />
          </div>
          <div>
            <label
              htmlFor="sim-threshold"
              className="block text-xs font-semibold text-stellar-text-muted uppercase tracking-wider mb-1.5"
            >
              Threshold
            </label>
            <input
              id="sim-threshold"
              type="number"
              value={input.threshold ?? ""}
              onChange={(e) =>
                setInput((p) => ({
                  ...p,
                  threshold: e.target.value === "" ? null : Number(e.target.value),
                }))
              }
              placeholder="0"
              className="bg-stellar-card border border-stellar-border rounded px-3 py-2 text-sm text-white placeholder-stellar-text-muted focus:outline-none focus:border-stellar-blue w-full"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={!adminToken.trim()}
          className="w-full py-2.5 px-4 rounded-md bg-stellar-blue text-white text-sm font-semibold hover:bg-stellar-blue/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {isRunning ? (
            <>
              <svg
                className="w-4 h-4 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 3v3M12 18v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M3 12h3M18 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"
                />
              </svg>
              Running simulation…
            </>
          ) : (
            "Run Simulation"
          )}
        </button>

        {!adminToken.trim() && (
          <p className="text-xs text-amber-400 text-center" role="alert">
            Admin API token required to run simulations
          </p>
        )}
      </form>
    </div>
  );
}

const SEVERITY_STYLES: Record<
  "critical" | "high" | "medium" | "low",
  { badge: string; dot: string }
> = {
  critical: { badge: "bg-red-900/50 text-red-400 border border-red-700", dot: "bg-red-500" },
  high: { badge: "bg-orange-900/50 text-orange-400 border border-orange-700", dot: "bg-orange-500" },
  medium: { badge: "bg-yellow-900/50 text-yellow-400 border border-yellow-700", dot: "bg-yellow-500" },
  low: { badge: "bg-blue-900/50 text-blue-400 border border-blue-700", dot: "bg-blue-500" },
};

const CHANNEL_LABELS: Record<string, string> = {
  in_app: "In-App",
  webhook: "Webhook",
  email: "Email",
};