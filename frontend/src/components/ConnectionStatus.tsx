import { useWebSocketContext } from "../contexts/WebSocketContext";
import type { ConnectionState } from "../types";

interface StateConfig {
  label: string;
  dotColor: string;
  pulse: boolean;
}

const STATE_CONFIG: Record<ConnectionState, StateConfig> = {
  connected: { label: "Live", dotColor: "bg-green-500", pulse: true },
  connecting: { label: "Connecting…", dotColor: "bg-yellow-500", pulse: true },
  disconnected: { label: "Offline", dotColor: "bg-gray-500", pulse: false },
  error: { label: "Error", dotColor: "bg-red-500", pulse: false },
};

/**
 * Small indicator that shows the current WebSocket connection state.
 * Must be rendered inside <WebSocketProvider>.
 */
export default function ConnectionStatus() {
  const { connectionState, isPollingFallback } = useWebSocketContext();
  const { label, dotColor, pulse } = STATE_CONFIG[connectionState];
  const displayLabel = isPollingFallback ? "Polling" : label;

  return (
    <div
      className="flex items-center gap-2"
      role="status"
      aria-live="polite"
      aria-label={`Connection: ${displayLabel}`}
    >
      {/* Animated dot */}
      <span className="relative flex h-2 w-2" aria-hidden="true">
        {pulse && (
          <span
            className={`animate-ping absolute inline-flex h-full w-full rounded-full ${dotColor} opacity-75`}
          />
        )}
        <span
          className={`relative inline-flex h-2 w-2 rounded-full ${dotColor}`}
        />
      </span>
      <span className="text-sm text-stellar-text-secondary">{displayLabel}</span>
    </div>
  );
}
