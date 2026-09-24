import React, { useState, useEffect } from "react";
import {
  getQueueFairnessPolicies,
  updateQueueFairnessPolicy,
  getQueueFairnessStatus,
  getBullMQCounts,
  runFairnessGovernor,
} from "../services/api";
import type { LaneName, LanePolicy, FairnessStatusResponse, FairnessStatus } from "../types";

export default function QueueFairnessAdmin() {
  const [apiKey, setApiKey] = useState("");
  const [policies, setPolicies] = useState<Record<LaneName, LanePolicy> | null>(null);
  const [status, setStatus] = useState<FairnessStatusResponse | null>(null);
  const [bullmqCounts, setBullmqCounts] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  const loadAll = async () => {
    if (!apiKey.trim()) return;
    setLoading(true);
    try {
      const [polRes, statusRes, countsRes] = await Promise.all([
        getQueueFairnessPolicies(apiKey.trim()),
        getQueueFairnessStatus(apiKey.trim()),
        getBullMQCounts(apiKey.trim()),
      ]);
      setPolicies(polRes.policies);
      setStatus(statusRes);
      setBullmqCounts(countsRes.counts);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handlePolicyChange = async (lane: LaneName, field: keyof LanePolicy, value: number | boolean) => {
    if (!policies || !apiKey.trim()) return;
    setSaving(lane);
    try {
      const current = policies[lane];
      await updateQueueFairnessPolicy(apiKey.trim(), lane, {
        [field]: value,
      });
      setPolicies({ ...policies, [lane]: { ...current, [field]: value } });
      loadAll();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(null);
    }
  };

  const handleGovernorRun = async () => {
    if (!apiKey.trim()) return;
    try {
      await runFairnessGovernor(apiKey.trim());
      loadAll();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Governor run failed");
    }
  };

  useEffect(() => {
    loadAll();
  }, [apiKey]);

  const statusColor = (s: FairnessStatus) => {
    switch (s) {
      case "healthy": return "bg-green-100 text-green-800";
      case "degraded": return "bg-yellow-100 text-yellow-800";
      case "unfair": return "bg-orange-100 text-orange-800";
      case "starved": return "bg-red-100 text-red-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const laneOrder: LaneName[] = ["critical", "high", "medium", "low"];

  return (
    <div className="p-6 space-y-8">
      <h1 className="text-2xl font-bold">Queue Priority Fairness</h1>

      <section className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow space-y-4">
        <h2 className="text-lg font-semibold">API Key</h2>
        <input
          type="password"
          placeholder="bwk_live_... (admin:queue-fairness scope required)"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          className="w-full md:w-1/2 px-3 py-2 border rounded"
        />
      </section>

      <section className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Overall Fairness Status</h2>
          <button onClick={loadAll} disabled={loading} className="px-3 py-1 text-sm border rounded disabled:opacity-50">
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
        {status && (
          <div className="flex gap-4 flex-wrap">
            <span className={`px-4 py-2 rounded text-lg font-semibold ${statusColor(status.overall)}`}>
              {status.overall.toUpperCase()}
            </span>
            <button onClick={handleGovernorRun} disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50">
              Run Governor
            </button>
          </div>
        )}
      </section>

      <section className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow space-y-4">
        <h2 className="text-lg font-semibold">Lane Policies</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 dark:text-gray-400 border-b">
                <th className="pb-2">Lane</th>
                <th className="pb-2">Enabled</th>
                <th className="pb-2">Weight</th>
                <th className="pb-2">Min Share %</th>
                <th className="pb-2">Ideal Share %</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {policies && laneOrder.map((lane) => {
                const p = policies[lane];
                const totalWeight = laneOrder.reduce((sum, l) => sum + (policies[l]?.enabled ? policies[l].weight : 0), 0);
                const idealShare = p.enabled && totalWeight > 0 ? Math.round((p.weight / totalWeight) * 10000) / 100 : 0;
                return (
                  <tr key={lane} className="border-b">
                    <td className="py-2 font-medium capitalize">{lane}</td>
                    <td className="py-2">
                      <input
                        type="checkbox"
                        checked={p.enabled}
                        onChange={(e) => handlePolicyChange(lane, "enabled", e.target.checked)}
                        disabled={saving === lane}
                        className="w-5 h-5"
                      />
                    </td>
                    <td className="py-2">
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={p.weight}
                        onChange={(e) => handlePolicyChange(lane, "weight", Number(e.target.value) || 1)}
                        disabled={saving === lane}
                        className="w-20 px-2 py-1 border rounded"
                      />
                    </td>
                    <td className="py-2">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={p.minSharePct}
                        onChange={(e) => handlePolicyChange(lane, "minSharePct", Number(e.target.value) || 0)}
                        disabled={saving === lane}
                        className="w-20 px-2 py-1 border rounded"
                      />
                    </td>
                    <td className="py-2">{idealShare}%</td>
                    <td className="py-2">
                      {saving === lane && <span className="text-xs text-blue-600">Saving...</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow space-y-4">
        <h2 className="text-lg font-semibold">Fairness Assessment</h2>
        {status && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 dark:text-gray-400 border-b">
                  <th className="pb-2">Lane</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2">Reason</th>
                  <th className="pb-2">Actual Share %</th>
                  <th className="pb-2">Min Share %</th>
                  <th className="pb-2">Depth</th>
                  <th className="pb-2">Served</th>
                </tr>
              </thead>
              <tbody>
                {status.byLane.map((a) => (
                  <tr key={a.laneName} className="border-b">
                    <td className="py-2 font-medium capitalize">{a.laneName}</td>
                    <td className="py-2">
                      <span className={`px-2 py-0.5 rounded text-xs ${statusColor(a.status)}`}>
                        {a.status}
                      </span>
                    </td>
                    <td className="py-2 text-sm">{a.reason}</td>
                    <td className="py-2">{a.sharePct}%</td>
                    <td className="py-2">{a.minSharePct}%</td>
                    <td className="py-2">{a.depth}</td>
                    <td className="py-2">{a.servedCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow space-y-4">
        <h2 className="text-lg font-semibold">BullMQ Queue Counts</h2>
        {bullmqCounts && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 dark:text-gray-400 border-b">
                  <th className="pb-2">Queue</th>
                  <th className="pb-2">Waiting</th>
                  <th className="pb-2">Active</th>
                  <th className="pb-2">Completed</th>
                  <th className="pb-2">Failed</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(bullmqCounts).map(([queue, counts]) => (
                  <tr key={queue} className="border-b">
                    <td className="py-2 font-mono text-xs">{queue}</td>
                    <td className="py-2">{counts.waiting ?? 0}</td>
                    <td className="py-2">{counts.active ?? 0}</td>
                    <td className="py-2">{counts.completed ?? 0}</td>
                    <td className="py-2">{counts.failed ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}