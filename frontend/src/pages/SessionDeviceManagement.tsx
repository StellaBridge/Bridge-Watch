import { useEffect, useState, type FormEvent } from "react";
import {
  listSessionDevices,
  registerSessionDevice,
  revokeOtherSessionDevices,
  revokeSessionDevice,
  setSessionDeviceTrust,
} from "../services/api";
import type { DeviceType, SessionDeviceRecord } from "../types";

const CURRENT_DEVICE_FINGERPRINT = "fp-macbook-pro-m2";

export default function SessionDeviceManagement() {
  const [devices, setDevices] = useState<SessionDeviceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revokeOthersCandidate, setRevokeOthersCandidate] = useState<string | null>(null);

  const [form, setForm] = useState({
    deviceFingerprint: "fp-macbook-pro-m2",
    deviceName: "Chrome on macOS Sonoma",
    deviceType: "DESKTOP" as DeviceType,
    ipAddress: "192.168.1.50",
  });

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listSessionDevices("user-operator-42");
      setDevices(res.devices);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load session devices");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await registerSessionDevice({
        deviceFingerprint: form.deviceFingerprint,
        deviceName: form.deviceName,
        deviceType: form.deviceType,
        ipAddress: form.ipAddress,
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to register device");
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async (id: string) => {
    setLoading(true);
    try {
      await revokeSessionDevice(id, "user-operator-42");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke device session");
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeOthers = async (currentId: string) => {
    setLoading(true);
    try {
      await revokeOtherSessionDevices(currentId, "user-operator-42");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke other sessions");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleTrust = async (id: string, currentTrust: boolean) => {
    try {
      await setSessionDeviceTrust(id, !currentTrust);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update trust status");
    }
  };

  const activeCount = devices.filter((d) => d.isActive).length;

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-stellar-blue">User Account & Security</p>
          <h1 className="mt-2 text-3xl font-bold text-white">Session Device Management</h1>
          <p className="mt-2 max-w-2xl text-stellar-text-secondary">
            Inspect active session devices, fingerprints, locations, trusted device flags, and revoke compromised logins.
          </p>
        </div>
        <div className="rounded-2xl border border-stellar-border bg-stellar-card/80 px-5 py-4">
          <p className="text-xs uppercase tracking-[0.2em] text-stellar-text-secondary">Active Sessions</p>
          <p className="mt-2 text-3xl font-semibold text-emerald-400">{activeCount}</p>
        </div>
      </header>

      {error && (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      <section className="grid gap-6 xl:grid-cols-[1fr,2fr]">
        <form onSubmit={handleRegister} className="rounded-3xl border border-stellar-border bg-stellar-card/80 p-6 space-y-4">
          <h2 className="text-xl font-semibold text-white">Register Current Device</h2>

          <label className="block">
            <span className="mb-1 block text-sm text-stellar-text-secondary">Device Name</span>
            <input
              type="text"
              value={form.deviceName}
              onChange={(e) => setForm({ ...form, deviceName: e.target.value })}
              className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-2.5 text-white outline-none focus:border-stellar-blue"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-stellar-text-secondary">Device Fingerprint</span>
            <input
              type="text"
              value={form.deviceFingerprint}
              onChange={(e) => setForm({ ...form, deviceFingerprint: e.target.value })}
              className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-2.5 text-white outline-none focus:border-stellar-blue"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-stellar-text-secondary">Device Type</span>
            <select
              value={form.deviceType}
              onChange={(e) => setForm({ ...form, deviceType: e.target.value as DeviceType })}
              className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-2.5 text-white outline-none focus:border-stellar-blue"
            >
              <option value="DESKTOP">DESKTOP</option>
              <option value="MOBILE">MOBILE</option>
              <option value="TABLET">TABLET</option>
              <option value="OTHER">OTHER</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-stellar-text-secondary">IP Address</span>
            <input
              type="text"
              value={form.ipAddress}
              onChange={(e) => setForm({ ...form, ipAddress: e.target.value })}
              className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-2.5 text-white outline-none focus:border-stellar-blue"
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-stellar-blue px-5 py-3 font-semibold text-white transition hover:bg-blue-500 disabled:opacity-60"
          >
            {loading ? "Registering..." : "Register / Refresh Session"}
          </button>
        </form>

        <div className="rounded-3xl border border-stellar-border bg-stellar-card/80 p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white">Active Device Sessions</h2>
            <button
              onClick={() => void loadData()}
              className="rounded-full border border-stellar-border px-4 py-1.5 text-xs text-stellar-text-secondary hover:border-stellar-blue hover:text-white transition"
            >
              Refresh
            </button>
          </div>

          <div className="space-y-4">
            {devices.length === 0 && (
              <p className="py-8 text-center text-sm text-stellar-text-secondary">
                No active device sessions registered.
              </p>
            )}

            {devices.map((d) => (
              <article
                key={d.id}
                className={`rounded-2xl border p-4 space-y-3 transition ${
                  d.isActive
                    ? "border-stellar-border bg-stellar-dark/80"
                    : "border-gray-800 bg-stellar-dark/30 opacity-60"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <h3 className="font-bold text-white text-base">{d.deviceName}</h3>
                    {d.deviceFingerprint === CURRENT_DEVICE_FINGERPRINT && (
                      <span className="rounded-full border border-stellar-blue/40 bg-stellar-blue/15 px-3 py-0.5 text-xs font-semibold text-stellar-blue">
                        Current Device
                      </span>
                    )}
                    <span
                      className={`rounded-full px-3 py-0.5 text-xs font-semibold ${
                        d.isActive
                          ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                          : "bg-red-500/15 text-red-300 border border-red-500/30"
                      }`}
                    >
                      {d.isActive ? "Active Session" : "Revoked"}
                    </span>
                    {d.isTrusted && (
                      <span className="rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/30 px-3 py-0.5 text-xs font-semibold">
                        Trusted Device
                      </span>
                    )}
                  </div>

                  {d.isActive && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => void handleToggleTrust(d.id, d.isTrusted)}
                        className="rounded-full border border-stellar-border px-3 py-1 text-xs text-stellar-text-secondary hover:border-stellar-blue hover:text-white transition"
                      >
                        {d.isTrusted ? "Untrust" : "Trust"}
                      </button>
                      <button
                        aria-label="Terminate Session"
                        onClick={() => void handleRevoke(d.id)}
                        className="rounded-full bg-red-500/20 px-3 py-1 text-xs text-red-300 hover:bg-red-500 hover:text-white transition"
                      >
                        Revoke
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-stellar-text-secondary">
                  <div>IP: <span className="text-gray-200 font-mono">{d.ipAddress}</span></div>
                  <div>Type: <span className="text-gray-200">{d.deviceType}</span></div>
                  <div>Fingerprint: <span className="text-gray-200 font-mono">{d.deviceFingerprint.slice(0, 10)}...</span></div>
                  <div className="col-span-2">Last Active: <span className="text-gray-200">{new Date(d.lastActiveAt).toLocaleString()}</span></div>
                </div>

                {d.isActive && (
                  <div className="pt-2 border-t border-stellar-border/40 text-right">
                    <button
                      aria-label="Terminate All Other Sessions"
                      onClick={() => setRevokeOthersCandidate(d.id)}
                      className="text-xs text-amber-400 hover:underline"
                    >
                      Revoke all other device sessions
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>

      {revokeOthersCandidate && (
        <div role="dialog" aria-modal="true" aria-labelledby="terminate-others-heading"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-md space-y-4 rounded-2xl border border-stellar-border bg-stellar-card p-6 text-white">
            <h2 id="terminate-others-heading" className="text-xl font-semibold">Terminate all other sessions?</h2>
            <p>All other active device sessions will be signed out. This device stays signed in.</p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setRevokeOthersCandidate(null)}
                className="rounded-full border border-stellar-border px-4 py-2">Cancel</button>
              <button type="button"
                onClick={() => {
                  void handleRevokeOthers(revokeOthersCandidate);
                  setRevokeOthersCandidate(null);
                }}
                className="rounded-full bg-amber-600 px-4 py-2 disabled:opacity-60" disabled={loading}>
                Confirm terminate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
