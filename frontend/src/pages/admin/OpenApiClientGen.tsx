import React, { useState, useEffect, useCallback } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

type GenerationStatus = "pending" | "running" | "succeeded" | "failed" | "cancelled";
type GenerationTrigger = "manual" | "ci" | "schedule" | "webhook";
type Language = "typescript" | "javascript" | "python" | "go" | "java" | "kotlin" | "ruby" | "rust" | "csharp" | "php" | "swift";
type Generator = "openapi-generator-cli" | "swagger-codegen" | "oapi-codegen" | "openapi-typescript";

interface OpenApiClientConfig {
  id: string;
  name: string;
  language: Language;
  generator: Generator;
  generatorVersion: string | null;
  generatorOptions: Record<string, unknown>;
  outputPath: string;
  openapiSource: string;
  enabled: boolean;
  autoCommit: boolean;
  autoPublish: boolean;
  publishRegistry: string | null;
  publishPackageName: string | null;
  createdAt: string;
  updatedAt: string;
}

interface GenerationJob {
  id: string;
  configId: string;
  status: GenerationStatus;
  trigger: GenerationTrigger;
  triggeredBy: string | null;
  gitRef: string | null;
  openapiSpecSha: string | null;
  generatorVersionResolved: string | null;
  errorMessage: string | null;
  artifactUrls: string[];
  diffSummary: Record<string, number>;
  committed: boolean;
  published: boolean;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

interface Stats {
  totalConfigs: number;
  enabledConfigs: number;
  totalJobs: number;
  byStatus: Record<GenerationStatus, number>;
  recentFailures: GenerationJob[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const API_BASE = "/api/v1/admin/openapi-client-gen";
const SUPPORTED_LANGUAGES: Language[] = [
  "typescript", "javascript", "python", "go", "java", "kotlin", "ruby", "rust", "csharp", "php", "swift",
];
const SUPPORTED_GENERATORS: Generator[] = [
  "openapi-generator-cli", "swagger-codegen", "oapi-codegen", "openapi-typescript",
];

const STATUS_COLORS: Record<GenerationStatus, string> = {
  pending:   "color: #f59e0b",
  running:   "color: #3b82f6",
  succeeded: "color: #10b981",
  failed:    "color: #ef4444",
  cancelled: "color: #6b7280",
};

const STATUS_ICONS: Record<GenerationStatus, string> = {
  pending:   "⏳",
  running:   "⚙️",
  succeeded: "✅",
  failed:    "❌",
  cancelled: "🚫",
};

const LANG_ICONS: Record<string, string> = {
  typescript: "🟦",
  javascript: "🟨",
  python:     "🐍",
  go:         "🐹",
  java:       "☕",
  kotlin:     "🎯",
  ruby:       "💎",
  rust:       "🦀",
  csharp:     "🎵",
  php:        "🐘",
  swift:      "🦅",
};

// ─── API helpers ──────────────────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  apiKey: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      ...((init?.headers as Record<string, string>) ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error((err as { message?: string }).message ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function OpenApiClientGenerationAdmin() {
  const [apiKey, setApiKey] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [configs, setConfigs] = useState<OpenApiClientConfig[]>([]);
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"configs" | "jobs" | "stats">("configs");
  const [showNewConfig, setShowNewConfig] = useState(false);
  const [enqueuingFor, setEnqueuingFor] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<GenerationJob | null>(null);

  // ─── New config form state ──────────────────────────────────────────────────
  const [form, setForm] = useState({
    name: "",
    language: "typescript" as Language,
    generator: "openapi-generator-cli" as Generator,
    generatorVersion: "",
    outputPath: "sdk/generated/typescript",
    openapiSource: "backend/docs/openapi.json",
    enabled: true,
    autoCommit: false,
    autoPublish: false,
  });

  const loadAll = useCallback(async () => {
    if (!apiKey.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const [cfgRes, jobRes, statRes] = await Promise.all([
        apiFetch<{ configs: OpenApiClientConfig[] }>("/?includeDisabled=true", apiKey),
        apiFetch<{ jobs: GenerationJob[]; total: number }>("/jobs?limit=50", apiKey),
        apiFetch<Stats>("/stats", apiKey),
      ]);
      setConfigs(cfgRes.configs);
      setJobs(jobRes.jobs);
      setStats(statRes);
      setAuthenticated(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  useEffect(() => {
    if (authenticated) {
      const interval = setInterval(loadAll, 15_000);
      return () => clearInterval(interval);
    }
  }, [authenticated, loadAll]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    await loadAll();
  };

  const handleCreateConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/configs", apiKey, {
        method: "POST",
        body: JSON.stringify({
          ...form,
          generatorVersion: form.generatorVersion.trim() || null,
        }),
      });
      setShowNewConfig(false);
      setForm({
        name: "", language: "typescript", generator: "openapi-generator-cli",
        generatorVersion: "", outputPath: "sdk/generated/typescript",
        openapiSource: "backend/docs/openapi.json", enabled: true,
        autoCommit: false, autoPublish: false,
      });
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create config");
    }
  };

  const handleEnqueue = async (configId: string) => {
    setEnqueuingFor(configId);
    setError(null);
    try {
      await apiFetch("/jobs", apiKey, {
        method: "POST",
        body: JSON.stringify({ configId, trigger: "manual" }),
      });
      setActiveTab("jobs");
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to enqueue job");
    } finally {
      setEnqueuingFor(null);
    }
  };

  const handleToggleConfig = async (config: OpenApiClientConfig) => {
    try {
      await apiFetch(`/configs/${config.id}`, apiKey, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !config.enabled }),
      });
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update config");
    }
  };

  const handleDeleteConfig = async (config: OpenApiClientConfig) => {
    if (!confirm(`Delete config "${config.name}"? This cannot be undone.`)) return;
    try {
      await apiFetch(`/configs/${config.id}`, apiKey, { method: "DELETE" });
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete config");
    }
  };

  const handleCancelJob = async (job: GenerationJob) => {
    try {
      await apiFetch(`/jobs/${job.id}/cancel`, apiKey, { method: "POST" });
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to cancel job");
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (!authenticated) {
    return (
      <div style={{ maxWidth: 480, margin: "80px auto", padding: "0 24px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
          🔌 OpenAPI Client Generation
        </h1>
        <p style={{ color: "#6b7280", marginBottom: 24 }}>
          Manage generated API client SDKs from the Bridge-Watch OpenAPI spec.
        </p>
        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ fontSize: 14, fontWeight: 500 }}>
            API Key
            <input
              id="openapi-gen-api-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="x-api-key"
              required
              style={{
                display: "block", width: "100%", marginTop: 4, padding: "8px 12px",
                border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14, boxSizing: "border-box",
              }}
            />
          </label>
          {error && <p style={{ color: "#ef4444", fontSize: 13 }}>{error}</p>}
          <button
            id="openapi-gen-login-btn"
            type="submit"
            disabled={loading}
            style={{
              padding: "10px 20px", background: "#2563eb", color: "#fff",
              border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer",
            }}
          >
            {loading ? "Connecting…" : "Connect"}
          </button>
        </form>
      </div>
    );
  }

  const configForJob = (job: GenerationJob) =>
    configs.find((c) => c.id === job.configId);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px" }}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
            🔌 OpenAPI Client Generation
          </h1>
          <p style={{ color: "#6b7280", fontSize: 13, marginTop: 4 }}>
            Generate typed API clients from the live OpenAPI spec (#1207)
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            id="openapi-gen-refresh-btn"
            onClick={loadAll}
            disabled={loading}
            style={{ padding: "8px 14px", border: "1px solid #d1d5db", borderRadius: 6, cursor: "pointer", fontSize: 13 }}
          >
            {loading ? "Refreshing…" : "↺ Refresh"}
          </button>
          {activeTab === "configs" && (
            <button
              id="openapi-gen-new-config-btn"
              onClick={() => setShowNewConfig(true)}
              style={{
                padding: "8px 14px", background: "#2563eb", color: "#fff",
                border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: 13,
              }}
            >
              + New Config
            </button>
          )}
        </div>
      </div>

      {error && (
        <div style={{
          background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6,
          padding: "10px 14px", color: "#b91c1c", marginBottom: 16, fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {/* ── Stats bar ──────────────────────────────────────────────────────── */}
      {stats && (
        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          {[
            { label: "Configs", value: `${stats.enabledConfigs} / ${stats.totalConfigs}`, sub: "enabled" },
            { label: "Total Jobs", value: stats.totalJobs },
            { label: "Succeeded", value: stats.byStatus.succeeded, color: "#10b981" },
            { label: "Failed", value: stats.byStatus.failed, color: "#ef4444" },
            { label: "Running", value: stats.byStatus.running, color: "#3b82f6" },
          ].map((s) => (
            <div key={s.label} style={{
              background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8,
              padding: "12px 16px", minWidth: 110,
            }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color ?? "#111" }}>{s.value}</div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>{s.label} {s.sub ? `(${s.sub})` : ""}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Tabs ───────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #e5e7eb", marginBottom: 20 }}>
        {(["configs", "jobs", "stats"] as const).map((tab) => (
          <button
            key={tab}
            id={`openapi-gen-tab-${tab}`}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "10px 20px", border: "none", borderBottom: activeTab === tab ? "2px solid #2563eb" : "2px solid transparent",
              background: "transparent", fontWeight: activeTab === tab ? 600 : 400,
              color: activeTab === tab ? "#2563eb" : "#6b7280",
              cursor: "pointer", fontSize: 14, textTransform: "capitalize",
            }}
          >
            {tab === "configs" ? `Configs (${configs.length})` : tab === "jobs" ? `Jobs (${jobs.length})` : "Stats"}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          Tab: Configs
        ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "configs" && (
        <div>
          {configs.length === 0 ? (
            <div style={{ textAlign: "center", padding: 48, color: "#9ca3af" }}>
              No configs yet — click <strong>+ New Config</strong> to get started.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {configs.map((cfg) => (
                <div
                  key={cfg.id}
                  style={{
                    background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8,
                    padding: "16px 20px", opacity: cfg.enabled ? 1 : 0.6,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 18 }}>{LANG_ICONS[cfg.language] ?? "📦"}</span>
                        <span style={{ fontWeight: 600, fontSize: 15 }}>{cfg.name}</span>
                        <span style={{
                          fontSize: 11, padding: "2px 8px",
                          background: cfg.enabled ? "#d1fae5" : "#f3f4f6",
                          color: cfg.enabled ? "#065f46" : "#6b7280",
                          borderRadius: 12, fontWeight: 500,
                        }}>
                          {cfg.enabled ? "enabled" : "disabled"}
                        </span>
                        {cfg.autoCommit && (
                          <span style={{ fontSize: 11, padding: "2px 8px", background: "#dbeafe", color: "#1e40af", borderRadius: 12 }}>
                            auto-commit
                          </span>
                        )}
                        {cfg.autoPublish && (
                          <span style={{ fontSize: 11, padding: "2px 8px", background: "#fef3c7", color: "#92400e", borderRadius: 12 }}>
                            auto-publish
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: "#6b7280", display: "flex", gap: 16, flexWrap: "wrap" }}>
                        <span>🔧 {cfg.generator} {cfg.generatorVersion ? `v${cfg.generatorVersion}` : "(latest)"}</span>
                        <span>📂 {cfg.outputPath}</span>
                        <span>📄 {cfg.openapiSource}</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                      <button
                        id={`openapi-gen-enqueue-${cfg.id}`}
                        onClick={() => handleEnqueue(cfg.id)}
                        disabled={!cfg.enabled || enqueuingFor === cfg.id}
                        style={{
                          padding: "6px 12px", background: "#2563eb", color: "#fff",
                          border: "none", borderRadius: 5, fontSize: 12, fontWeight: 500,
                          cursor: cfg.enabled ? "pointer" : "not-allowed",
                        }}
                      >
                        {enqueuingFor === cfg.id ? "…" : "▶ Generate"}
                      </button>
                      <button
                        id={`openapi-gen-toggle-${cfg.id}`}
                        onClick={() => handleToggleConfig(cfg)}
                        style={{
                          padding: "6px 12px", border: "1px solid #d1d5db",
                          borderRadius: 5, fontSize: 12, cursor: "pointer", background: "#fff",
                        }}
                      >
                        {cfg.enabled ? "Disable" : "Enable"}
                      </button>
                      <button
                        id={`openapi-gen-delete-${cfg.id}`}
                        onClick={() => handleDeleteConfig(cfg)}
                        style={{
                          padding: "6px 12px", border: "1px solid #fecaca",
                          borderRadius: 5, fontSize: 12, cursor: "pointer",
                          background: "#fff", color: "#b91c1c",
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── New Config Modal ────────────────────────────────────────────── */}
          {showNewConfig && (
            <div style={{
              position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
              display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
            }}>
              <div style={{
                background: "#fff", borderRadius: 10, padding: 28,
                width: "100%", maxWidth: 540, maxHeight: "90vh", overflowY: "auto",
              }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, marginTop: 0 }}>New Generation Config</h2>
                <form onSubmit={handleCreateConfig} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {[
                    { id: "name", label: "Name *", type: "text", placeholder: "TypeScript SDK", key: "name" },
                    { id: "outputPath", label: "Output Path *", type: "text", placeholder: "sdk/generated/typescript", key: "outputPath" },
                    { id: "openapiSource", label: "OpenAPI Source", type: "text", placeholder: "backend/docs/openapi.json", key: "openapiSource" },
                    { id: "generatorVersion", label: "Generator Version", type: "text", placeholder: "7.7.0 (blank = latest)", key: "generatorVersion" },
                  ].map((field) => (
                    <label key={field.key} style={{ fontSize: 13, fontWeight: 500 }}>
                      {field.label}
                      <input
                        id={`new-config-${field.id}`}
                        type={field.type}
                        placeholder={field.placeholder}
                        value={form[field.key as keyof typeof form] as string}
                        onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                        required={field.label.includes("*")}
                        style={{
                          display: "block", width: "100%", marginTop: 4, padding: "7px 10px",
                          border: "1px solid #d1d5db", borderRadius: 5, fontSize: 13, boxSizing: "border-box",
                        }}
                      />
                    </label>
                  ))}
                  <label style={{ fontSize: 13, fontWeight: 500 }}>
                    Language *
                    <select
                      id="new-config-language"
                      value={form.language}
                      onChange={(e) => setForm({ ...form, language: e.target.value as Language })}
                      style={{ display: "block", width: "100%", marginTop: 4, padding: "7px 10px", border: "1px solid #d1d5db", borderRadius: 5, fontSize: 13 }}
                    >
                      {SUPPORTED_LANGUAGES.map((l) => (
                        <option key={l} value={l}>{LANG_ICONS[l]} {l}</option>
                      ))}
                    </select>
                  </label>
                  <label style={{ fontSize: 13, fontWeight: 500 }}>
                    Generator
                    <select
                      id="new-config-generator"
                      value={form.generator}
                      onChange={(e) => setForm({ ...form, generator: e.target.value as Generator })}
                      style={{ display: "block", width: "100%", marginTop: 4, padding: "7px 10px", border: "1px solid #d1d5db", borderRadius: 5, fontSize: 13 }}
                    >
                      {SUPPORTED_GENERATORS.map((g) => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </label>
                  <div style={{ display: "flex", gap: 16 }}>
                    {(["enabled", "autoCommit", "autoPublish"] as const).map((flag) => (
                      <label key={flag} style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                        <input
                          id={`new-config-${flag}`}
                          type="checkbox"
                          checked={form[flag]}
                          onChange={(e) => setForm({ ...form, [flag]: e.target.checked })}
                        />
                        {flag === "enabled" ? "Enabled" : flag === "autoCommit" ? "Auto-commit" : "Auto-publish"}
                      </label>
                    ))}
                  </div>
                  {error && <p style={{ color: "#ef4444", fontSize: 12, margin: 0 }}>{error}</p>}
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      onClick={() => setShowNewConfig(false)}
                      style={{ padding: "8px 14px", border: "1px solid #d1d5db", borderRadius: 5, cursor: "pointer" }}
                    >
                      Cancel
                    </button>
                    <button
                      id="new-config-submit"
                      type="submit"
                      style={{ padding: "8px 16px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 5, fontWeight: 600, cursor: "pointer" }}
                    >
                      Create
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          Tab: Jobs
        ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "jobs" && (
        <div>
          {jobs.length === 0 ? (
            <div style={{ textAlign: "center", padding: 48, color: "#9ca3af" }}>
              No generation jobs yet. Go to Configs and click <strong>▶ Generate</strong>.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {jobs.map((job) => {
                const cfg = configForJob(job);
                return (
                  <div
                    key={job.id}
                    style={{
                      background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8,
                      padding: "14px 18px", cursor: "pointer",
                      borderLeft: `4px solid ${job.status === "succeeded" ? "#10b981" : job.status === "failed" ? "#ef4444" : job.status === "running" ? "#3b82f6" : "#d1d5db"}`,
                    }}
                    onClick={() => setSelectedJob(selectedJob?.id === job.id ? null : job)}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span>{STATUS_ICONS[job.status]}</span>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>
                            {cfg ? `${LANG_ICONS[cfg.language] ?? "📦"} ${cfg.name}` : job.configId}
                          </div>
                          <div style={{ fontSize: 11, color: "#6b7280" }}>
                            {job.trigger} · {job.triggeredBy ?? "system"} · {new Date(job.createdAt).toLocaleString()}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ fontSize: 12, fontWeight: 600, ...Object.fromEntries(Object.entries(STATUS_COLORS[job.status]).map(([k, v]) => [k, v])) }}>
                          {job.status.toUpperCase()}
                        </span>
                        {(job.status === "pending" || job.status === "running") && (
                          <button
                            id={`openapi-job-cancel-${job.id}`}
                            onClick={(e) => { e.stopPropagation(); handleCancelJob(job); }}
                            style={{
                              padding: "4px 10px", border: "1px solid #fecaca",
                              borderRadius: 4, fontSize: 11, cursor: "pointer", color: "#b91c1c", background: "#fff",
                            }}
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>

                    {selectedJob?.id === job.id && (
                      <div style={{ marginTop: 12, borderTop: "1px solid #f3f4f6", paddingTop: 12, fontSize: 12, color: "#4b5563" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                          {[
                            ["Job ID", job.id],
                            ["Spec SHA", job.openapiSpecSha ? job.openapiSpecSha.slice(0, 16) + "…" : "n/a"],
                            ["Generator version", job.generatorVersionResolved ?? "n/a"],
                            ["Git ref", job.gitRef ?? "n/a"],
                            ["Committed", job.committed ? "✅" : "—"],
                            ["Published", job.published ? "✅" : "—"],
                            ["Started at", job.startedAt ? new Date(job.startedAt).toLocaleString() : "—"],
                            ["Completed at", job.completedAt ? new Date(job.completedAt).toLocaleString() : "—"],
                          ].map(([k, v]) => (
                            <div key={k}>
                              <span style={{ color: "#9ca3af" }}>{k}: </span>
                              <span>{v}</span>
                            </div>
                          ))}
                        </div>
                        {job.errorMessage && (
                          <pre style={{ background: "#fef2f2", padding: 10, borderRadius: 5, color: "#b91c1c", overflowX: "auto", fontSize: 11 }}>
                            {job.errorMessage}
                          </pre>
                        )}
                        {job.artifactUrls.length > 0 && (
                          <div>
                            <strong>Artifacts:</strong>{" "}
                            {job.artifactUrls.map((url) => (
                              <a key={url} href={url} target="_blank" rel="noreferrer" style={{ color: "#2563eb", marginRight: 8 }}>
                                {url.split("/").pop()}
                              </a>
                            ))}
                          </div>
                        )}
                        {Object.keys(job.diffSummary).length > 0 && (
                          <div style={{ marginTop: 8 }}>
                            <strong>Diff:</strong>{" "}
                            {Object.entries(job.diffSummary).map(([k, v]) => `${v} ${k}`).join(", ")}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          Tab: Stats
        ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "stats" && stats && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16, marginBottom: 24 }}>
            {(Object.entries(stats.byStatus) as [GenerationStatus, number][]).map(([status, count]) => (
              <div key={status} style={{
                background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: "16px 20px",
              }}>
                <div style={{ fontSize: 28, fontWeight: 700 }}>{count}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                  <span>{STATUS_ICONS[status]}</span>
                  <span style={{ fontSize: 13, color: "#4b5563", fontWeight: 500 }}>{status}</span>
                </div>
              </div>
            ))}
          </div>

          {stats.recentFailures.length > 0 && (
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>Recent Failures</h3>
              {stats.recentFailures.map((job) => {
                const cfg = configForJob(job);
                return (
                  <div key={job.id} style={{
                    background: "#fff", border: "1px solid #fecaca", borderRadius: 8,
                    padding: "12px 16px", marginBottom: 8,
                  }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                      {cfg ? `${LANG_ICONS[cfg.language] ?? "📦"} ${cfg.name}` : job.configId}
                    </div>
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                      {new Date(job.createdAt).toLocaleString()} · {job.trigger}
                    </div>
                    {job.errorMessage && (
                      <pre style={{ marginTop: 8, background: "#fef2f2", padding: 8, borderRadius: 4, fontSize: 11, color: "#b91c1c", overflow: "auto" }}>
                        {job.errorMessage.slice(0, 300)}{job.errorMessage.length > 300 ? "…" : ""}
                      </pre>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
