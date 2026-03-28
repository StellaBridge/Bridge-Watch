import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  createApiKey,
  extendApiKey,
  listApiKeys,
  revokeApiKey,
  rotateApiKey,
} from "../services/api";
import { useLocalStorageState } from "../hooks/useLocalStorageState";
import type { ApiKeyRecord } from "../types";

const AVAILABLE_SCOPES = [
  "admin:api-keys",
  "jobs:read",
  "jobs:trigger",
];

const DEFAULT_FORM = {
  name: "",
  scopes: ["jobs:read", "jobs:trigger"],
  rateLimitPerMinute: 120,
  expiresInDays: 30,
};

export default function ApiKeys() {
  const [adminToken, setAdminToken] = useLocalStorageState(
    "bridge-watch:admin-api-key:v1",
    ""
  );
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(DEFAULT_FORM);

  const activeCount = useMemo(
    () => keys.filter((key) => !key.revokedAt).length,
    [keys]
  );

  const loadKeys = async () => {
    if (!adminToken) {
      setKeys([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await listApiKeys(adminToken);
      setKeys(response.keys);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Failed to load API keys"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadKeys();
  }, [adminToken]);

  const toggleScope = (scope: string) => {
    setForm((current) => ({
      ...current,
      scopes: current.scopes.includes(scope)
        ? current.scopes.filter((entry) => entry !== scope)
        : [...current.scopes, scope],
    }));
  };

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!adminToken) {
      setError("Enter an admin or bootstrap API key first.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await createApiKey(adminToken, form);
      setGeneratedKey(response.apiKey);
      setForm(DEFAULT_FORM);
      await loadKeys();
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Failed to create API key"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRotate = async (id: string) => {
    if (!adminToken) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await rotateApiKey(adminToken, id);
      setGeneratedKey(response.apiKey);
      await loadKeys();
    } catch (rotateError) {
      setError(
        rotateError instanceof Error
          ? rotateError.message
          : "Failed to rotate API key"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!adminToken) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await revokeApiKey(adminToken, id);
      await loadKeys();
    } catch (revokeError) {
      setError(
        revokeError instanceof Error
          ? revokeError.message
          : "Failed to revoke API key"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleExtend = async (id: string) => {
    if (!adminToken) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await extendApiKey(adminToken, id, 30);
      await loadKeys();
    } catch (extendError) {
      setError(
        extendError instanceof Error
          ? extendError.message
          : "Failed to extend API key expiration"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-stellar-blue">
            Admin
          </p>
          <h1 className="mt-2 text-3xl font-bold text-white">API keys</h1>
          <p className="mt-2 max-w-2xl text-stellar-text-secondary">
            Manage external integrator credentials, revoke compromised keys,
            and track active usage without leaving the dashboard.
          </p>
        </div>

        <div className="rounded-2xl border border-stellar-border bg-stellar-card/80 px-5 py-4">
          <p className="text-xs uppercase tracking-[0.2em] text-stellar-text-secondary">
            Active credentials
          </p>
          <p className="mt-2 text-3xl font-semibold text-white">{activeCount}</p>
          <p className="mt-1 text-sm text-stellar-text-secondary">
            Total keys tracked: {keys.length}
          </p>
        </div>
      </header>

      <section className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
        <form
          onSubmit={handleCreate}
          className="rounded-3xl border border-stellar-border bg-stellar-card/80 p-6"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-white">
                Issue new integrator key
              </h2>
              <p className="mt-1 text-sm text-stellar-text-secondary">
                Generated keys are shown only once after creation or rotation.
              </p>
            </div>
            <span className="rounded-full border border-stellar-border px-3 py-1 text-xs uppercase tracking-[0.2em] text-stellar-text-secondary">
              Secure flow
            </span>
          </div>

          <div className="mt-6 space-y-5">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-white">
                Admin or bootstrap token
              </span>
              <input
                type="password"
                value={adminToken}
                onChange={(event) => setAdminToken(event.target.value)}
                placeholder="Paste your admin API key"
                className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-white">
                Key name
              </span>
              <input
                type="text"
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Partner monitor"
                className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
              />
            </label>

            <div>
              <p className="mb-3 text-sm font-medium text-white">Scopes</p>
              <div className="grid gap-3 sm:grid-cols-3">
                {AVAILABLE_SCOPES.map((scope) => {
                  const checked = form.scopes.includes(scope);
                  return (
                    <label
                      key={scope}
                      className={`rounded-2xl border px-4 py-3 transition ${
                        checked
                          ? "border-stellar-blue bg-stellar-blue/10 text-white"
                          : "border-stellar-border bg-stellar-dark text-stellar-text-secondary"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleScope(scope)}
                        className="sr-only"
                      />
                      <span className="text-sm font-medium">{scope}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-white">
                  Rate limit / minute
                </span>
                <input
                  type="number"
                  min={1}
                  value={form.rateLimitPerMinute}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      rateLimitPerMinute: Number(event.target.value),
                    }))
                  }
                  className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-white">
                  Expires in days
                </span>
                <input
                  type="number"
                  min={1}
                  value={form.expiresInDays}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      expiresInDays: Number(event.target.value),
                    }))
                  }
                  className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
                />
              </label>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-4">
            {generatedKey && (
              <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">
                  Generated key
                </p>
                <code className="mt-2 block overflow-x-auto text-sm text-white">
                  {generatedKey}
                </code>
              </div>
            )}

            {error && (
              <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="rounded-2xl bg-stellar-blue px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Processing..." : "Create API key"}
            </button>
          </div>
        </form>

        <section className="rounded-3xl border border-stellar-border bg-stellar-card/80 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-white">Existing keys</h2>
              <p className="mt-1 text-sm text-stellar-text-secondary">
                Rotate compromised credentials, revoke stale ones, or extend
                active partner access.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadKeys()}
              className="rounded-full border border-stellar-border px-4 py-2 text-sm text-stellar-text-secondary transition hover:border-stellar-blue hover:text-white"
            >
              Refresh
            </button>
          </div>

          <div className="mt-6 space-y-4">
            {keys.length === 0 && (
              <div className="rounded-2xl border border-dashed border-stellar-border px-4 py-8 text-center text-sm text-stellar-text-secondary">
                {adminToken
                  ? "No API keys yet. Create the first one from the form."
                  : "Add an admin token to load and manage keys."}
              </div>
            )}

            {keys.map((key) => (
              <article
                key={key.id}
                className="rounded-2xl border border-stellar-border bg-stellar-dark/70 p-4"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-lg font-medium text-white">{key.name}</h3>
                      <span
                        className={`rounded-full px-3 py-1 text-xs uppercase tracking-[0.2em] ${
                          key.revokedAt
                            ? "bg-red-500/15 text-red-300"
                            : "bg-emerald-500/15 text-emerald-300"
                        }`}
                      >
                        {key.revokedAt ? "Revoked" : "Active"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-stellar-text-secondary">
                      Prefix: <code>{key.prefix}</code>
                    </p>
                    <p className="mt-1 text-sm text-stellar-text-secondary">
                      Scopes: {key.scopes.join(", ")}
                    </p>
                    <p className="mt-1 text-sm text-stellar-text-secondary">
                      Rate limit: {key.rateLimitPerMinute}/min
                    </p>
                    <p className="mt-1 text-sm text-stellar-text-secondary">
                      Last used: {key.lastUsedAt ?? "Never"}
                    </p>
                    <p className="mt-1 text-sm text-stellar-text-secondary">
                      Expires: {key.expiresAt ?? "No expiry set"}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void handleRotate(key.id)}
                      className="rounded-full border border-stellar-border px-4 py-2 text-sm text-stellar-text-secondary transition hover:border-stellar-blue hover:text-white"
                    >
                      Rotate
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleExtend(key.id)}
                      className="rounded-full border border-stellar-border px-4 py-2 text-sm text-stellar-text-secondary transition hover:border-stellar-blue hover:text-white"
                    >
                      Extend +30d
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleRevoke(key.id)}
                      className="rounded-full border border-red-500/40 px-4 py-2 text-sm text-red-300 transition hover:bg-red-500/10"
                    >
                      Revoke
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>
    </div>
  );
}
