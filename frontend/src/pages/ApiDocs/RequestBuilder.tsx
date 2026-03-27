import { useState } from "react";
import type { Endpoint } from "./data";
import ResponseViewer from "./ResponseViewer";

interface Props {
  endpoint: Endpoint;
}

interface TryResult {
  status: number;
  data: unknown;
  error?: string;
}

export default function RequestBuilder({ endpoint }: Props) {
  const [pathValues, setPathValues] = useState<Record<string, string>>(
    Object.fromEntries((endpoint.pathParams ?? []).map((p) => [p.name, p.example ?? ""]))
  );
  const [result, setResult] = useState<TryResult | null>(null);
  const [loading, setLoading] = useState(false);

  if (endpoint.method === "WS") {
    return (
      <p className="text-sm text-stellar-text-secondary italic">
        WebSocket endpoints cannot be tested in the browser explorer. Use wscat or a WebSocket client.
      </p>
    );
  }

  const resolvedPath = endpoint.path.replace(/:(\w+)/g, (_, p) => pathValues[p] || `:${p}`);

  async function tryIt() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(resolvedPath, { headers: { Accept: "application/json" } });
      const data = await res.json().catch(() => null);
      setResult({ status: res.status, data });
    } catch (e) {
      setResult({ status: 0, data: null, error: String(e) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Path param inputs */}
      {(endpoint.pathParams ?? []).length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-stellar-text-secondary uppercase tracking-wide">Path Parameters</p>
          {endpoint.pathParams!.map((p) => (
            <div key={p.name} className="flex items-center gap-3">
              <label className="w-24 text-sm font-mono text-white shrink-0">{p.name}</label>
              <input
                className="flex-1 bg-stellar-dark border border-stellar-border rounded px-3 py-1.5 text-sm text-white placeholder-stellar-text-secondary focus:outline-none focus:border-stellar-blue"
                placeholder={p.example ?? p.name}
                value={pathValues[p.name] ?? ""}
                onChange={(e) => setPathValues((v) => ({ ...v, [p.name]: e.target.value }))}
              />
            </div>
          ))}
        </div>
      )}

      {/* Resolved URL preview */}
      <div className="flex items-center gap-2 bg-stellar-dark border border-stellar-border rounded px-3 py-2">
        <span className="text-xs font-mono text-stellar-text-secondary shrink-0">URL</span>
        <span className="text-sm font-mono text-white truncate">{resolvedPath}</span>
      </div>

      <button
        onClick={tryIt}
        disabled={loading}
        className="px-4 py-2 bg-stellar-blue text-white text-sm font-medium rounded hover:bg-blue-600 disabled:opacity-50 transition-colors"
      >
        {loading ? "Sending…" : "Try it out"}
      </button>

      {result && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded ${
                result.status >= 200 && result.status < 300
                  ? "bg-green-900 text-green-300"
                  : "bg-red-900 text-red-300"
              }`}
            >
              {result.status || "ERR"}
            </span>
            {result.error && <span className="text-xs text-red-400">{result.error}</span>}
          </div>
          {result.data !== null && <ResponseViewer json={result.data} />}
        </div>
      )}
    </div>
  );
}
