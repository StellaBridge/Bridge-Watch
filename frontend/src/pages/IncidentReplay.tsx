import { Link, useParams, useSearchParams } from "react-router-dom";
import IncidentReplayPlayer from "../components/IncidentReplayPlayer";
import { useIncidentReplay } from "../hooks/useIncidentReplay";
import { ReplayComparison } from "../components/ReplayComparison";

export default function IncidentReplay() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const incidentId = id ?? searchParams.get("incidentId") ?? undefined;
  const { data, isLoading, error } = useIncidentReplay(incidentId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-stellar-text-primary">Incident Replay</h1>
          <p className="mt-2 text-stellar-text-secondary">
            Step through the event sequence that led to this incident.
          </p>
        </div>
        <Link
          to="/incidents"
          className="rounded-md border border-stellar-border px-4 py-2 text-sm text-stellar-text-secondary hover:text-white"
        >
          Back to incidents
        </Link>
      </div>

      {!incidentId && (
        <div className="rounded-xl border border-stellar-border bg-stellar-card p-8 text-center text-stellar-text-secondary">
          Provide an incident ID in the URL, e.g.{" "}
          <code className="text-stellar-blue">/incidents/replay/your-incident-id</code>
        </div>
      )}

      {incidentId && data && (
        <IncidentReplayPlayer
          timeline={data}
          isLoading={isLoading}
          error={error?.message ?? null}
        />
      )}

      {incidentId && isLoading && (
        <IncidentReplayPlayer
          timeline={{
            incidentId,
            incident: {
              id: incidentId,
              bridgeId: "",
              assetCode: null,
              severity: "medium",
              status: "open",
              title: "",
              description: "",
              occurredAt: new Date().toISOString(),
              resolvedAt: null,
            },
            events: [],
            durationMs: 0,
          }}
          isLoading
        />
      )}

      {incidentId && !isLoading && error && (
        <IncidentReplayPlayer
          timeline={{
            incidentId,
            incident: {
              id: incidentId,
              bridgeId: "",
              assetCode: null,
              severity: "medium",
              status: "open",
              title: "",
              description: "",
              occurredAt: new Date().toISOString(),
              resolvedAt: null,
            },
            events: [],
            durationMs: 0,
          }}
          error={error.message}
        />
      )}

      {/* #1241 — Mount orphaned ReplayComparison panel */}
      <ReplayComparison />
    </div>
  );
}
