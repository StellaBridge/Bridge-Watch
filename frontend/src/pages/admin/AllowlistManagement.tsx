import { useState, useEffect } from "react";
import { Breadcrumb } from "../../components/Breadcrumb/Breadcrumb";

interface AllowlistEntry {
  id: string;
  contractAddress: string;
  addedBy: string;
  addedAt: string;
  isActive: boolean;
}

interface ChangeRequest {
  id: string;
  contractAddress: string;
  action: "add" | "remove";
  reason: string;
  requestedBy: string;
  status: "pending" | "approved" | "rejected";
  reviewedBy: string | null;
  reviewComment: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export default function AllowlistManagement() {
  const [activeTab, setActiveTab] = useState<"allowlist" | "requests">("allowlist");
  const [allowlist, setAllowlist] = useState<AllowlistEntry[]>([]);
  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New request form
  const [newAddress, setNewAddress] = useState("");
  const [newAction, setNewAction] = useState<"add" | "remove">("add");
  const [newReason, setNewReason] = useState("");

  useEffect(() => {
    void loadAllowlist();
    void loadRequests();
  }, []);

  const loadAllowlist = async () => {
    try {
      const response = await fetch("/api/v1/admin/allowlist");
      if (!response.ok) throw new Error("Failed to load allowlist");
      const data = await response.json();
      setAllowlist(data.allowlist || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  };

  const loadRequests = async () => {
    try {
      const response = await fetch("/api/v1/admin/allowlist/change-requests");
      if (!response.ok) throw new Error("Failed to load requests");
      const data = await response.json();
      setRequests(data.changeRequests || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  };

  const handleSubmitRequest = async () => {
    if (!newAddress || !newReason) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/admin/allowlist/change-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractAddress: newAddress,
          action: newAction,
          reason: newReason,
        }),
      });
      if (!response.ok) throw new Error("Failed to submit request");
      setNewAddress("");
      setNewReason("");
      await loadRequests();
      setActiveTab("requests");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setLoading(false);
    }
  };

  const handleReview = async (id: string, decision: "approved" | "rejected", comment: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/admin/allowlist/change-requests/${id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, comment: comment || undefined }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Review failed");
      }
      await loadRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Review failed");
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/admin/allowlist/change-requests/${id}/apply`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Failed to apply change");
      await loadAllowlist();
      await loadRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Apply failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <Breadcrumb />

      <header>
        <p className="text-xs uppercase tracking-[0.3em] text-stellar-blue">Admin</p>
        <h1 className="mt-2 text-3xl font-bold text-white">Contract Allowlist Management</h1>
        <p className="mt-2 max-w-2xl text-stellar-text-secondary">
          Manage contract address allowlist with four-eyes review process.
        </p>
      </header>

      {error && (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-4 border-b border-stellar-border">
        <button
          onClick={() => setActiveTab("allowlist")}
          className={`px-4 py-2 text-sm font-medium transition ${
            activeTab === "allowlist"
              ? "border-b-2 border-stellar-blue text-white"
              : "text-stellar-text-secondary hover:text-white"
          }`}
        >
          Current Allowlist
        </button>
        <button
          onClick={() => setActiveTab("requests")}
          className={`px-4 py-2 text-sm font-medium transition ${
            activeTab === "requests"
              ? "border-b-2 border-stellar-blue text-white"
              : "text-stellar-text-secondary hover:text-white"
          }`}
        >
          Change Requests
        </button>
      </div>

      {activeTab === "allowlist" && (
        <div className="space-y-4">
          {/* Submit New Request */}
          <section className="rounded-3xl border border-stellar-border bg-stellar-card/80 p-6">
            <h2 className="text-xl font-semibold text-white">Submit Change Request</h2>
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-stellar-text-secondary">
                  Contract Address
                </label>
                <input
                  type="text"
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  placeholder="0x..."
                  className="mt-1 w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-stellar-text-secondary">
                  Action
                </label>
                <select
                  value={newAction}
                  onChange={(e) => setNewAction(e.target.value as "add" | "remove")}
                  className="mt-1 w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue"
                >
                  <option value="add">Add to allowlist</option>
                  <option value="remove">Remove from allowlist</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-stellar-text-secondary">
                  Reason
                </label>
                <textarea
                  value={newReason}
                  onChange={(e) => setNewReason(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue"
                />
              </div>
              <button
                onClick={() => void handleSubmitRequest()}
                disabled={!newAddress || !newReason || loading}
                className="rounded-2xl bg-stellar-blue px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Submit Request
              </button>
            </div>
          </section>

          {/* Allowlist Table */}
          <section className="rounded-3xl border border-stellar-border bg-stellar-card/80 p-6">
            <h2 className="text-xl font-semibold text-white">Active Contracts</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stellar-border">
                    <th className="pb-2 text-left font-medium text-stellar-text-secondary">Address</th>
                    <th className="pb-2 text-left font-medium text-stellar-text-secondary">Added By</th>
                    <th className="pb-2 text-left font-medium text-stellar-text-secondary">Added At</th>
                  </tr>
                </thead>
                <tbody>
                  {allowlist.map((entry) => (
                    <tr key={entry.id} className="border-b border-stellar-border/50">
                      <td className="py-2 font-mono text-xs text-white">{entry.contractAddress}</td>
                      <td className="py-2 text-stellar-text-secondary">{entry.addedBy}</td>
                      <td className="py-2 text-stellar-text-secondary">
                        {new Date(entry.addedAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {activeTab === "requests" && (
        <div className="space-y-4">
          {requests.map((req) => (
            <article
              key={req.id}
              className="rounded-3xl border border-stellar-border bg-stellar-card/80 p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        req.status === "pending"
                          ? "bg-yellow-500/15 text-yellow-300"
                          : req.status === "approved"
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "bg-red-500/15 text-red-300"
                      }`}
                    >
                      {req.status}
                    </span>
                    <span
                      className={`rounded-full px-3 py-1 text-xs ${
                        req.action === "add"
                          ? "bg-blue-500/15 text-blue-300"
                          : "bg-orange-500/15 text-orange-300"
                      }`}
                    >
                      {req.action}
                    </span>
                  </div>
                  <p className="mt-2 font-mono text-xs text-white">{req.contractAddress}</p>
                  <p className="mt-2 text-sm text-stellar-text-secondary">{req.reason}</p>
                  <p className="mt-2 text-xs text-stellar-text-secondary">
                    Requested by {req.requestedBy} on {new Date(req.createdAt).toLocaleString()}
                  </p>
                  {req.reviewedBy && (
                    <p className="mt-1 text-xs text-stellar-text-secondary">
                      Reviewed by {req.reviewedBy}
                      {req.reviewComment && `: ${req.reviewComment}`}
                    </p>
                  )}
                </div>
                {req.status === "pending" && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => void handleReview(req.id, "approved", "")}
                      disabled={loading}
                      className="rounded-full border border-emerald-500/40 px-4 py-2 text-sm text-emerald-300 transition hover:bg-emerald-500/10 disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => void handleReview(req.id, "rejected", "")}
                      disabled={loading}
                      className="rounded-full border border-red-500/40 px-4 py-2 text-sm text-red-300 transition hover:bg-red-500/10 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                )}
                {req.status === "approved" && (
                  <button
                    onClick={() => void handleApply(req.id)}
                    disabled={loading}
                    className="rounded-full bg-stellar-blue px-4 py-2 text-sm text-white transition hover:bg-blue-500 disabled:opacity-50"
                  >
                    Apply Change
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
