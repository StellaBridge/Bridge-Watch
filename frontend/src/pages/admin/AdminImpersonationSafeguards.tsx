import { useEffect, useState, type FormEvent } from "react";
import {
  getAdminImpersonationAuditLogs,
  listAdminImpersonationSessions,
  startAdminImpersonation,
  stopAdminImpersonation,
} from "../../services/api";
import { useLocalStorageState } from "../../hooks/useLocalStorageState";
import { Breadcrumb } from "../../components/Breadcrumb/Breadcrumb";
import type { AdminImpersonationSession, ImpersonationAuditLog } from "../../types";

export default function AdminImpersonationSafeguards() {
  const [adminToken, setAdminToken] = useLocalStorageState(
    "bridge-watch:admin-api-key:v1",
    ""
  );
  const [sessions, setSessions] = useState<AdminImpersonationSession[]>([]);
  const [activeSession, setActiveSession] = useState<AdminImpersonationSession | null>(null);
  const [activeToken, setActiveToken] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<ImpersonationAuditLog[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    adminId: "admin-security-chief",
    impersonatedUserId: "user-target-88",
    reason: "Investigating user issue ticket #SUP-4412",
    approvalTicketId: "SUP-4412",
    durationMinutes: 30,
  });

  const loadSessions = async () => {
    if (!adminToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await listAdminImpersonationSessions(adminToken);
      setSessions(res.sessions);
      const active = res.sessions.find((s) => s.status === "ACTIVE");
      if (active) {
        setActiveSession(active);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load impersonation sessions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminToken]);

  const handleStart = async (e: FormEvent) => {
    e.preventDefault();
    if (!adminToken) {
      setError("Please provide an Admin API Token.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await startAdminImpersonation(adminToken, {
        adminId: form.adminId,
        impersonatedUserId: form.impersonatedUserId,
        reason: form.reason,
        approvalTicketId: form.approvalTicketId,
        durationMinutes: form.durationMinutes,
      });
      setActiveSession(res.session);
      setActiveToken(res.token);
      await loadSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start impersonation");
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async (sessionId: string) => {
    if (!adminToken) return;
    setLoading(true);
    setError(null);
    try {
      await stopAdminImpersonation(adminToken, sessionId);
      if (activeSession?.id === sessionId) {
        setActiveSession(null);
        setActiveToken(null);
      }
      await loadSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to stop impersonation");
    } finally {
      setLoading(false);
    }
  };

  const loadAuditLogs = async (sessionId: string) => {
    if (!adminToken) return;
    setSelectedSessionId(sessionId);
    try {
      const res = await getAdminImpersonationAuditLogs(adminToken, sessionId);
      setAuditLogs(res.auditLogs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch audit logs");
    }
  };

  return (
    <div className="space-y-8">
      <Breadcrumb />

      {/* Impersonation Warning Banner */}
      {activeSession && (
        <div className="rounded-2xl border border-amber-500/50 bg-amber-500/15 p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-3 w-3 rounded-full bg-amber-400 animate-ping" />
            <div>
              <p className="font-bold text-amber-200 text-sm uppercase tracking-wider">
                ACTIVE IMPERSONATION SESSION
              </p>
              <p className="text-xs text-amber-100 mt-0.5">
                Admin <span className="font-mono font-bold">{activeSession.adminId}</span> is impersonating{" "}
                <span className="font-mono font-bold">{activeSession.impersonatedUserId}</span> (Reason: {activeSession.reason})
              </p>
            </div>
          </div>
          <button
            onClick={() => void handleStop(activeSession.id)}
            className="rounded-xl bg-amber-500 text-black font-bold text-xs px-4 py-2 hover:bg-amber-400 transition"
          >
            END SESSION NOW
          </button>
        </div>
      )}

      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-stellar-blue">Admin Control Panel</p>
          <h1 className="mt-2 text-3xl font-bold text-white">Admin Impersonation Safeguards</h1>
          <p className="mt-2 max-w-2xl text-stellar-text-secondary">
            Time-bound user impersonation with mandatory ticket justification, approval logs, auto-expiration, and full request auditing.
          </p>
        </div>
        <div className="rounded-2xl border border-stellar-border bg-stellar-card/80 px-5 py-4">
          <p className="text-xs uppercase tracking-[0.2em] text-stellar-text-secondary">Session Count</p>
          <p className="mt-2 text-3xl font-semibold text-white">{sessions.length}</p>
        </div>
      </header>

      {!adminToken && (
        <div className="rounded-2xl border border-stellar-border bg-stellar-card/80 p-6">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-white">Admin Authorization Key</span>
            <input
              type="password"
              value={adminToken}
              onChange={(e) => setAdminToken(e.target.value)}
              placeholder="Paste Admin Key"
              className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none focus:border-stellar-blue"
            />
          </label>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      <section className="grid gap-6 xl:grid-cols-[1fr,2fr]">
        <form onSubmit={handleStart} className="rounded-3xl border border-stellar-border bg-stellar-card/80 p-6 space-y-4">
          <h2 className="text-xl font-semibold text-white">Initiate Impersonation</h2>

          <label className="block">
            <span className="mb-1 block text-sm text-stellar-text-secondary">Admin ID</span>
            <input
              type="text"
              value={form.adminId}
              onChange={(e) => setForm({ ...form, adminId: e.target.value })}
              className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-2.5 text-white outline-none focus:border-stellar-blue"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-stellar-text-secondary">Impersonated User ID</span>
            <input
              type="text"
              value={form.impersonatedUserId}
              onChange={(e) => setForm({ ...form, impersonatedUserId: e.target.value })}
              className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-2.5 text-white outline-none focus:border-stellar-blue"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-stellar-text-secondary">Approval Ticket ID</span>
            <input
              type="text"
              value={form.approvalTicketId}
              onChange={(e) => setForm({ ...form, approvalTicketId: e.target.value })}
              className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-2.5 text-white outline-none focus:border-stellar-blue"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-stellar-text-secondary">Justification / Audit Reason</span>
            <textarea
              rows={2}
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-2.5 text-white outline-none focus:border-stellar-blue"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-stellar-text-secondary">Duration (Minutes, max 120)</span>
            <input
              type="number"
              min={5}
              max={120}
              value={form.durationMinutes}
              onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })}
              className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-2.5 text-white outline-none focus:border-stellar-blue"
            />
          </label>

          <button
            type="submit"
            disabled={loading || !adminToken}
            className="w-full rounded-2xl bg-amber-500 px-5 py-3 font-bold text-black transition hover:bg-amber-400 disabled:opacity-60"
          >
            {loading ? "Starting Session..." : "Start Impersonation Session"}
          </button>

          {activeToken && (
            <div className="rounded-2xl border border-stellar-border bg-stellar-dark p-3 text-xs">
              <p className="text-stellar-text-secondary mb-1">Session Token Hash / Access Key:</p>
              <p className="font-mono text-emerald-400 break-all">{activeToken}</p>
            </div>
          )}
        </form>

        <div className="rounded-3xl border border-stellar-border bg-stellar-card/80 p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white">Impersonation History & Audit</h2>
            <button
              onClick={() => void loadSessions()}
              className="rounded-full border border-stellar-border px-4 py-1.5 text-xs text-stellar-text-secondary hover:border-stellar-blue hover:text-white transition"
            >
              Refresh
            </button>
          </div>

          <div className="space-y-4">
            {sessions.length === 0 && (
              <p className="py-8 text-center text-sm text-stellar-text-secondary">
                No impersonation sessions recorded yet.
              </p>
            )}

            {sessions.map((s) => (
              <article
                key={s.id}
                className="rounded-2xl border border-stellar-border bg-stellar-dark/70 p-4 space-y-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-white text-sm">
                      Admin {s.adminId} → User {s.impersonatedUserId}
                    </span>
                    <span
                      className={`rounded-full px-3 py-0.5 text-xs font-semibold ${
                        s.status === "ACTIVE"
                          ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                          : "bg-gray-500/15 text-gray-400 border border-gray-500/30"
                      }`}
                    >
                      {s.status}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => void loadAuditLogs(s.id)}
                      className="rounded-full border border-stellar-border px-3 py-1 text-xs text-stellar-text-secondary hover:border-stellar-blue hover:text-white transition"
                    >
                      Audit Trail
                    </button>
                    {s.status === "ACTIVE" && (
                      <button
                        onClick={() => void handleStop(s.id)}
                        className="rounded-full bg-red-500/20 px-3 py-1 text-xs text-red-300 hover:bg-red-500 hover:text-white transition"
                      >
                        Terminate
                      </button>
                    )}
                  </div>
                </div>

                <p className="text-xs text-gray-300">
                  Ticket: <span className="text-white font-mono">{s.approvalTicketId ?? "N/A"}</span> | Reason: {s.reason}
                </p>

                <div className="flex flex-wrap items-center justify-between text-[11px] text-stellar-text-secondary">
                  <span>Expires: {new Date(s.expiresAt).toLocaleString()}</span>
                  <span>IP: {s.ipAddress}</span>
                </div>

                {selectedSessionId === s.id && (
                  <div className="mt-3 pt-3 border-t border-stellar-border/50 space-y-2">
                    <h4 className="text-xs font-bold text-stellar-blue uppercase tracking-wider">
                      Request Audit Logs ({auditLogs.length})
                    </h4>
                    {auditLogs.length === 0 ? (
                      <p className="text-xs text-stellar-text-secondary">No requests logged yet for this session.</p>
                    ) : (
                      <div className="max-h-40 overflow-y-auto space-y-1">
                        {auditLogs.map((log) => (
                          <div
                            key={log.id}
                            className="flex items-center justify-between text-xs bg-stellar-dark/90 px-3 py-1.5 rounded-lg"
                          >
                            <span className="font-mono text-emerald-400 font-bold">{log.requestMethod}</span>
                            <span className="font-mono text-gray-200">{log.requestPath}</span>
                            <span className="text-stellar-text-secondary text-[10px]">
                              {new Date(log.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
