import { useState } from "react";
import {
  useAlertSimulation,
  type SimulationInput,
  type SimulationResult,
  type SimulationSeverity,
} from "../hooks/useAlertSimulation";
import { AlertSimulationForm } from "../components/AlertSimulationForm";
import { SimulationResults } from "../components/AlertSimulationResults";
import { SimulationHistory } from "../components/AlertSimulationHistory";
import { SEVERITY_STYLES, CHANNEL_LABELS, PRESETS, DEFAULT_INPUT } from "./AlertSimulationSandbox";

const ADMIN_TOKEN_KEY = "bw_admin_token";

function loadToken(): string {
  try {
    return localStorage.getItem("bw_admin_token") ?? "";
  } catch {
    return "";
  }
}

const DEFAULT_INPUT: SimulationInput = {
  severity: "high",
  assetCode: "",
  sourceType: "",
  ownerAddress: "",
  label: "",
  triggeredValue: null,
  threshold: null,
  metric: "",
};

export default function AlertSimulationSandbox() {
  const [adminToken, setAdminToken] = useState(loadToken);
  const [input, setInput] = useState<SimulationInput>(DEFAULT_INPUT);
  const [activeTab, setActiveTab] = useState<"results" | "history">("results");

  const {
    isRunning,
    error,
    currentResult,
    history,
    runSimulation,
    restoreFromHistory,
    clearHistory,
  } = useAlertSimulation(adminToken);

  function applyPreset(preset: (typeof PRESETS)[number]) {
    setInput({
      ...DEFAULT_INPUT,
      severity: preset.input.severity,
      assetCode: preset.input.assetCode,
      sourceType: preset.input.sourceType,
      metric: preset.input.metric,
      triggeredValue: preset.input.triggeredValue,
      threshold: preset.input.threshold,
    });
  }

  function handleSubmit(input: SimulationInput) {
    runSimulation(input);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-stellar-text-primary">
            Alert Simulation Sandbox
          </h1>
          <p className="mt-2 text-stellar-text-secondary">
            Dry-run alert rules against synthetic data before enabling in production. No alerts are dispatched.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-900/30 border border-amber-600/40 text-amber-400 text-xs font-medium">
          <svg
            className="w-3.5 h-3.5 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          Simulation only — no real dispatches
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        {/* Left: configuration panel */}
        <div className="lg:col-span-2 space-y-4">
          <AlertSimulationForm
            adminToken={adminToken}
            setAdminToken={setAdminToken}
            onRunSimulation={runSimulation}
            isRunning={isRunning}
            adminTokenValid={adminTokenValid}
          />
        </div>

        {/* Right: results / history */}
        <div className="lg:col-span-3 space-y-4">
          {/* Tab bar */}
          <div className="flex gap-1 border-b border-stellar-border">
            {(["results", "history"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  activeTab === tab
                    ? "text-white border-stellar-blue"
                    : "text-stellar-text-muted border-transparent hover:text-stellar-text-secondary"
                }`}
                aria-selected={activeTab === tab}
                role="tab"
              >
                {tab === "results" ? "Results" : `History (${history.length})`}
              </button>
            ))}
          </div>

          {/* Results tab */}
          {activeTab === "results" && (
            <div>
              {error && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-700 bg-red-900/20 p-4 text-sm text-red-400"
                >
                  {error}
                </div>
              )}

              {!currentResult && !isRunning && !error && (
                <div className="rounded-lg border border-stellar-border bg-stellar-card/50 p-12 text-center">
                  <svg
                    className="w-12 h-12 mx-auto mb-4 text-stellar-text-muted"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1}
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
                    />
                  </svg>
                  <p className="text-stellar-text-secondary font-medium">No simulation run yet</p>
                  <p className="text-sm text-stellar-text-muted mt-1">
                    Choose a preset or configure parameters, then click Run Simulation.
                  </p>
                </div>
              )}

              {isRunning && (
                <div className="rounded-lg border border-stellar-border bg-stellar-card/50 p-12 text-center">
                  <svg
                    className="w-10 h-10 mx-auto mb-4 text-stellar-blue animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-label="Running simulation"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 3v3M12 18v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M3 12H6M18 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"
                    />
                  </svg>
                  <p className="text-stellar-text-secondary">Evaluating routing rules…</p>
                </div>
              )}

              {currentResult && !isRunning && (
                <SimulationResults result={currentResult} />
              )}
            </div>
          )}

          {/* History tab */}
          {activeTab === "history" && (
            <SimulationHistory
              history={history}
              onRestore={(r) => {
                restoreFromHistory(r);
                setActiveTab("results");
              }}
              onClear={clearHistory}
            />
          )}
        </div>
      </div>
    </div>
  );
}

const SEVERITY_STYLES: Record<SimulationSeverity, { badge: string; dot: string }> = {
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

const PRESETS = [
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
] as const;

const ADMIN_TOKEN_KEY = "bw_admin_token";

function loadToken(): string {
  try {
    return localStorage.getItem("bw_admin_token") ?? "";
  } catch {
    return "";
  }
}

const DEFAULT_INPUT: SimulationInput = {
  severity: "high",
  assetCode: "",
  sourceType: "",
  ownerAddress: "",
  label: "",
  triggeredValue: null,
  threshold: null,
  metric: "",
};

export { SEVERITY_STYLES, CHANNEL_LABELS, PRESETS, DEFAULT_INPUT };