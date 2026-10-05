import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AssetWithHealth, Bridge, ExportFormat, ExportDataType, ExportRecord } from "../types";
import { requestExport, getExportStatus, generateExportDownloadLink } from "../services/api";
import { useLocalStorageState } from "../hooks/useLocalStorageState";

const STORAGE_KEY = "bridge-watch.export-picker.v1";

const formatOptions: Array<{ label: string; value: ExportFormat; description?: string }> = [
  { label: "CSV", value: "csv" },
  { label: "JSON", value: "json" },
  { label: "Spreadsheet", value: "csv", description: "Excel-friendly CSV" },
];

const dataTypeOptions: Array<{ label: string; value: ExportDataType; description: string }> = [
  { label: "Analytics", value: "analytics", description: "Summary and metrics for assets and bridges." },
  { label: "Transactions", value: "transactions", description: "Raw transaction history in the selected range." },
  { label: "Health metrics", value: "health_metrics", description: "Asset health and score details." },
];

function nowIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function thirtyDaysAgo(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

interface ExportPickerPreferences {
  format: ExportFormat;
  dataType: ExportDataType;
  startDate: string;
  endDate: string;
  assetCodes: string[];
  bridgeIds: string[];
}

const defaultPreferences: ExportPickerPreferences = {
  format: "csv",
  dataType: "analytics",
  startDate: thirtyDaysAgo(),
  endDate: nowIso(),
  assetCodes: [],
  bridgeIds: [],
};

interface ExportPickerDialogProps {
  open: boolean;
  onClose: () => void;
  availableAssets: AssetWithHealth[];
  availableBridges: Bridge[];
}

function formatExportStatus(status: ExportRecord["status"]) {
  switch (status) {
    case "pending":
      return "Pending";
    case "processing":
      return "In progress";
    case "completed":
      return "Ready to download";
    case "failed":
      return "Failed";
    default:
      return "Unknown";
  }
}

export default function ExportPickerDialog({
  open,
  onClose,
  availableAssets,
  availableBridges,
}: ExportPickerDialogProps) {
  const [preferences, setPreferences] = useLocalStorageState<ExportPickerPreferences>(
    STORAGE_KEY,
    defaultPreferences
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [recentExports, setRecentExports] = useState<ExportRecord[]>([]);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const [streamProgress, setStreamProgress] = useState<{
    bytesDownloaded: number;
    totalBytes: number | null;
    rowsCounted: number;
    isStreaming: boolean;
    error: string | null;
  }>({
    bytesDownloaded: 0,
    totalBytes: null,
    rowsCounted: 0,
    isStreaming: false,
    error: null,
  });
  const abortControllerRef = useRef<AbortController | null>(null);

  const selectedAssetLabels = useMemo(() => {
    const assets = new Set(preferences.assetCodes);
    return availableAssets.filter((asset) => assets.has(asset.symbol));
  }, [availableAssets, preferences.assetCodes]);

  const selectedBridgeLabels = useMemo(() => {
    const bridges = new Set(preferences.bridgeIds);
    return availableBridges.filter((bridge) => bridges.has(bridge.name));
  }, [availableBridges, preferences.bridgeIds]);

  const activeExport = recentExports[0] ?? null;

  const hasActiveExport = activeExport?.status === "pending" || activeExport?.status === "processing";

  const updatePreference = useCallback(
    <K extends keyof ExportPickerPreferences>(key: K, value: ExportPickerPreferences[K]) => {
      setPreferences((current) => ({ ...current, [key]: value }));
    },
    [setPreferences]
  );

  const fetchStatus = useCallback(async (exportId: string) => {
    try {
      const updated = await getExportStatus(exportId);
      setRecentExports((previous) => [updated, ...previous.filter((item) => item.id !== updated.id)]);
      return updated;
    } catch {
      return null;
    }
  }, []);

  const fetchDownload = useCallback(async (exportId: string) => {
    try {
      const url = await generateExportDownloadLink(exportId);
      setDownloadUrl(url);
      return url;
    } catch {
      return null;
    }
  }, []);

  const handleStreamDownload = useCallback(async (url: string, filename: string) => {
    if (streamProgress.isStreaming) return;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setStreamProgress({
      bytesDownloaded: 0,
      totalBytes: null,
      rowsCounted: 0,
      isStreaming: true,
      error: null,
    });

    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status} ${response.statusText}`);
      }

      const contentLengthHeader = response.headers.get("content-length");
      const totalBytes = contentLengthHeader ? parseInt(contentLengthHeader, 10) : null;

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Streaming not supported in this browser.");
      }

      const chunks: Uint8Array[] = [];
      let bytesDownloaded = 0;
      let rowsCounted = 0;
      const decoder = new TextDecoder("utf-8", { fatal: false });
      let leftover = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        if (value) {
          chunks.push(value);
          bytesDownloaded += value.length;

          const textChunk = decoder.decode(value, { stream: true });
          const combined = leftover + textChunk;
          const lines = combined.split("\n");
          leftover = lines.pop() ?? "";
          rowsCounted += lines.length;

          setStreamProgress((prev) => ({
            ...prev,
            bytesDownloaded,
            totalBytes,
            rowsCounted,
            isStreaming: true,
          }));
        }
      }

      if (leftover.trim().length > 0) {
        rowsCounted += 1;
      }

      setStreamProgress((prev) => ({
        ...prev,
        bytesDownloaded,
        totalBytes,
        rowsCounted,
        isStreaming: false,
      }));

      const blob = new Blob(chunks, {
        type: preferences.format === "json" ? "application/json" : "text/csv",
      });
      const blobUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setStreamProgress((prev) => ({
          ...prev,
          isStreaming: false,
          error: "Download cancelled.",
        }));
      } else {
        const msg = err instanceof Error ? err.message : "Streaming export failed.";
        setStreamProgress((prev) => ({
          ...prev,
          isStreaming: false,
          error: msg,
        }));
      }
    } finally {
      abortControllerRef.current = null;
    }
  }, [preferences.format, streamProgress.isStreaming]);

  const handleCancelDownload = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  useEffect(() => {
    if (!activeExport || activeExport.status !== "completed") {
      return;
    }

    if (activeExport.download_url) {
      setDownloadUrl(activeExport.download_url);
      return;
    }

    void fetchDownload(activeExport.id);
  }, [activeExport, fetchDownload]);

  useEffect(() => {
    if (!hasActiveExport || !activeExport) return;

    const interval = window.setInterval(async () => {
      await fetchStatus(activeExport.id);
    }, 3000);

    return () => window.clearInterval(interval);
  }, [activeExport, fetchStatus, hasActiveExport]);

  const handleSubmit = async () => {
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      const payload = {
        format: preferences.format,
        dataType: preferences.dataType,
        filters: {
          startDate: preferences.startDate,
          endDate: preferences.endDate,
          assetCodes: preferences.assetCodes.length ? preferences.assetCodes : undefined,
          bridgeIds: preferences.bridgeIds.length ? preferences.bridgeIds : undefined,
        },
      };

      const result = await requestExport(payload);
      setRecentExports((previous) => [result, ...previous.filter((item) => item.id !== result.id)].slice(0, 5));
      setDownloadUrl(null);
      void fetchStatus(result.id);
      setErrorMessage(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to start export.";
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 px-4 py-6">
      <div role="dialog" aria-modal="true" aria-labelledby="export-dialog-title" aria-describedby="export-dialog-desc" className="relative mx-auto w-full max-w-4xl rounded-3xl border border-stellar-border bg-stellar-card shadow-2xl">
        <div className="flex flex-col gap-6 p-6 lg:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="export-dialog-title" className="text-2xl font-semibold text-white">Export data</h2>
              <p id="export-dialog-desc" className="mt-2 text-sm text-stellar-text-secondary">
                Choose the format, scope, and date range for the export. The picker saves your last selection and shows live status while the export is processed.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-stellar-border bg-stellar-dark/90 p-2 text-stellar-text-secondary transition-colors hover:bg-stellar-border hover:text-white"
              aria-label="Close export dialog"
            >
              ×
            </button>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-white">File format</span>
                  <select
                    aria-label="File format"
                    value={preferences.format}
                    onChange={(event) => updatePreference("format", event.target.value as ExportFormat)}
                    className="w-full rounded-xl border border-stellar-border bg-stellar-dark/80 px-3 py-3 text-sm text-white outline-none focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue/30"
                  >
                    {formatOptions.map((option) => (
                      <option key={option.label} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-white">Export scope</span>
                  <select
                    aria-label="Export scope"
                    value={preferences.dataType}
                    onChange={(event) => updatePreference("dataType", event.target.value as ExportDataType)}
                    className="w-full rounded-xl border border-stellar-border bg-stellar-dark/80 px-3 py-3 text-sm text-white outline-none focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue/30"
                  >
                    {dataTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-white">Start date</span>
                  <input
                    type="date"
                    value={preferences.startDate}
                    max={preferences.endDate}
                    onChange={(event) => updatePreference("startDate", event.target.value)}
                    className="w-full rounded-xl border border-stellar-border bg-stellar-dark/80 px-3 py-3 text-sm text-white outline-none focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue/30"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium text-white">End date</span>
                  <input
                    type="date"
                    value={preferences.endDate}
                    min={preferences.startDate}
                    onChange={(event) => updatePreference("endDate", event.target.value)}
                    className="w-full rounded-xl border border-stellar-border bg-stellar-dark/80 px-3 py-3 text-sm text-white outline-none focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue/30"
                  />
                </label>
              </div>

              <div className="space-y-3 rounded-3xl border border-stellar-border bg-stellar-dark/70 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">Asset filters</p>
                    <p className="text-xs text-stellar-text-secondary">
                      Leave blank to include all assets in the export.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => updatePreference("assetCodes", [])}
                    className="rounded-full border border-stellar-border px-3 py-1 text-xs text-stellar-text-secondary hover:text-white"
                  >
                    Clear
                  </button>
                </div>
                <select
                  multiple
                  size={6}
                  value={preferences.assetCodes}
                  onChange={(event) =>
                    updatePreference(
                      "assetCodes",
                      Array.from(event.target.selectedOptions, (option) => option.value)
                    )
                  }
                  className="h-full min-h-[10rem] w-full rounded-2xl border border-stellar-border bg-stellar-dark/80 px-3 py-3 text-sm text-white outline-none focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue/30"
                >
                  {availableAssets.map((asset) => (
                    <option key={asset.symbol} value={asset.symbol}>
                      {asset.symbol} — {asset.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-3 rounded-3xl border border-stellar-border bg-stellar-dark/70 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">Bridge filters</p>
                    <p className="text-xs text-stellar-text-secondary">
                      Leave blank to include all bridges in the export.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => updatePreference("bridgeIds", [])}
                    className="rounded-full border border-stellar-border px-3 py-1 text-xs text-stellar-text-secondary hover:text-white"
                  >
                    Clear
                  </button>
                </div>
                <select
                  multiple
                  size={6}
                  value={preferences.bridgeIds}
                  onChange={(event) =>
                    updatePreference(
                      "bridgeIds",
                      Array.from(event.target.selectedOptions, (option) => option.value)
                    )
                  }
                  className="h-full min-h-[10rem] w-full rounded-2xl border border-stellar-border bg-stellar-dark/80 px-3 py-3 text-sm text-white outline-none focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue/30"
                >
                  {availableBridges.map((bridge) => (
                    <option key={bridge.name} value={bridge.name}>
                      {bridge.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-6 rounded-3xl border border-stellar-border bg-stellar-dark/80 p-5 text-sm">
              <div className="space-y-3">
                <h3 className="text-base font-semibold text-white">Export preview</h3>
                <div className="grid gap-3">
                  <div className="rounded-2xl bg-stellar-card/80 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-stellar-text-secondary">Format</p>
                    <p className="mt-2 font-medium text-white">{formatOptions.find((item) => item.value === preferences.format)?.label}</p>
                  </div>
                  <div className="rounded-2xl bg-stellar-card/80 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-stellar-text-secondary">Scope</p>
                    <p className="mt-2 font-medium text-white">{dataTypeOptions.find((item) => item.value === preferences.dataType)?.label}</p>
                  </div>
                  <div className="rounded-2xl bg-stellar-card/80 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-stellar-text-secondary">Date range</p>
                    <p className="mt-2 text-white">{preferences.startDate} – {preferences.endDate}</p>
                  </div>
                  <div className="rounded-2xl bg-stellar-card/80 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-stellar-text-secondary">Asset filters</p>
                    <p className="mt-2 text-white">
                      {selectedAssetLabels.length > 0 ? selectedAssetLabels.map((asset) => asset.symbol).join(", ") : "All assets"}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-stellar-card/80 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-stellar-text-secondary">Bridge filters</p>
                    <p className="mt-2 text-white">
                      {selectedBridgeLabels.length > 0 ? selectedBridgeLabels.map((bridge) => bridge.name).join(", ") : "All bridges"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3 rounded-3xl border border-stellar-border bg-stellar-card/80 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-white">Latest export</p>
                  {activeExport ? (
                    <span className="rounded-full bg-stellar-dark px-3 py-1 text-xs font-semibold text-stellar-text-secondary">
                      {formatExportStatus(activeExport.status)}
                    </span>
                  ) : null}
                </div>
                {activeExport ? (
                  <div className="space-y-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-stellar-text-secondary">Requested</p>
                    <p className="text-sm text-white">{new Date(activeExport.created_at).toLocaleString()}</p>
                    {activeExport.error_message ? (
                      <p className="rounded-2xl bg-rose-900/40 p-3 text-sm text-rose-200">{activeExport.error_message}</p>
                    ) : null}
                    {downloadUrl && activeExport.status === "completed" ? (
                      <div className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              handleStreamDownload(
                                downloadUrl,
                                `export-${activeExport.data_type}-${activeExport.id.slice(0, 8)}.${preferences.format}`
                              )
                            }
                            disabled={streamProgress.isStreaming}
                            className="inline-flex items-center justify-center rounded-xl bg-stellar-blue px-4 py-3 text-sm font-semibold text-white transition hover:bg-stellar-blue/90 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {streamProgress.isStreaming ? "Streaming…" : "Stream download"}
                          </button>
                          <a
                            href={downloadUrl}
                            download={`export-${activeExport.data_type}-${activeExport.id.slice(0, 8)}.${preferences.format}`}
                            className="inline-flex items-center justify-center rounded-xl border border-stellar-border bg-stellar-dark/80 px-4 py-3 text-sm font-semibold text-white transition hover:bg-stellar-border"
                          >
                            Direct download
                          </a>
                        </div>
                        {streamProgress.isStreaming || streamProgress.bytesDownloaded > 0 ? (
                          <div className="space-y-2 rounded-2xl border border-stellar-border bg-stellar-dark/80 p-3">
                            <div className="flex items-center justify-between text-xs text-stellar-text-secondary">
                              <span>
                                {streamProgress.totalBytes
                                  ? `${(streamProgress.bytesDownloaded / (1024 * 1024)).toFixed(2)} MB / ${(streamProgress.totalBytes / (1024 * 1024)).toFixed(2)} MB`
                                  : `${(streamProgress.bytesDownloaded / (1024 * 1024)).toFixed(2)} MB downloaded`}
                              </span>
                              <span>{streamProgress.rowsCounted.toLocaleString()} rows</span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-stellar-dark">
                              <div
                                role="progressbar"
                                aria-valuenow={
                                  streamProgress.totalBytes
                                    ? Math.round((streamProgress.bytesDownloaded / streamProgress.totalBytes) * 100)
                                    : undefined
                                }
                                aria-valuemin={0}
                                aria-valuemax={100}
                                className={`h-full bg-stellar-blue transition-all duration-300 ${
                                  streamProgress.isStreaming && !streamProgress.totalBytes ? "animate-pulse" : ""
                                }`}
                                style={{
                                  width: streamProgress.totalBytes
                                    ? `${Math.min(100, Math.round((streamProgress.bytesDownloaded / streamProgress.totalBytes) * 100))}%`
                                    : "100%",
                                }}
                              />
                            </div>
                            {streamProgress.isStreaming ? (
                              <button
                                type="button"
                                onClick={handleCancelDownload}
                                className="text-xs text-rose-400 hover:text-rose-300 hover:underline"
                              >
                                Cancel download
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                        {streamProgress.error ? (
                          <p className="rounded-xl bg-rose-900/40 p-2 text-xs text-rose-200">
                            {streamProgress.error}
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-sm text-stellar-text-secondary">
                        {activeExport.status === "completed"
                          ? "Preparing download link..."
                          : "Export status updates automatically until the job completes."}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-stellar-text-secondary">
                    Create an export to track job progress and download the result once complete.
                  </p>
                )}
              </div>

              <div className="space-y-2 rounded-3xl border border-stellar-border bg-stellar-dark/70 p-4">
                <p className="text-sm font-semibold text-white">Session history</p>
                <p className="text-xs text-stellar-text-secondary">
                  The last few exports from this session appear here so you can monitor completion without leaving the screen.
                </p>
                <div className="space-y-3">
                  {recentExports.length === 0 ? (
                    <p className="text-sm text-stellar-text-secondary">No exports requested yet.</p>
                  ) : (
                    recentExports.map((record) => (
                      <div key={record.id} className="rounded-2xl border border-stellar-border bg-stellar-card/70 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-white">{record.data_type.replace("_", " ")}</p>
                          <span className="rounded-full bg-stellar-dark px-2 py-1 text-xs text-stellar-text-secondary">
                            {formatExportStatus(record.status)}
                          </span>
                        </div>
                        <p className="text-xs text-stellar-text-secondary">{new Date(record.created_at).toLocaleString()}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          {errorMessage ? (
            <div role="alert" aria-live="assertive" className="rounded-3xl border border-rose-500/40 bg-rose-900/40 p-4 text-sm text-rose-100">
              {errorMessage}
            </div>
          ) : null}

          <div className="flex flex-col gap-3 border-t border-stellar-border pt-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border border-stellar-border bg-stellar-dark/90 px-4 py-3 text-sm text-white transition hover:bg-stellar-border"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="inline-flex justify-center rounded-2xl bg-stellar-blue px-4 py-3 text-sm font-semibold text-white transition hover:bg-stellar-blue/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? "Starting export…" : "Start export"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
