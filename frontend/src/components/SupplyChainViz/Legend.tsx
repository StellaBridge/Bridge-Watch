const STATUS_ITEMS = [
  { label: "Healthy", color: "#22c55e" },
  { label: "Degraded", color: "#f59e0b" },
  { label: "Offline", color: "#ef4444" },
] as const;

const HEALTH_ITEMS = [
  { label: "High (≥85)", color: "#22c55e" },
  { label: "Medium (60–84)", color: "#f59e0b" },
  { label: "Low (<60)", color: "#ef4444" },
] as const;

export default function Legend() {
  return (
    <div className="absolute top-4 left-4 bg-slate-900/90 border border-slate-700 rounded-lg p-3 text-xs text-slate-300 shadow-xl min-w-[140px]">
      <p className="text-slate-400 font-semibold mb-2 uppercase tracking-wide text-[10px]">
        Legend
      </p>

      <p className="text-slate-500 mb-1">Bridge Status</p>
      {STATUS_ITEMS.map(({ label, color }) => (
        <div key={label} className="flex items-center gap-2 mb-1">
          <span
            className="inline-block w-5 h-[2px] rounded"
            style={{ backgroundColor: color }}
          />
          <span>{label}</span>
        </div>
      ))}

      <p className="text-slate-500 mt-2 mb-1">Chain Health</p>
      {HEALTH_ITEMS.map(({ label, color }) => (
        <div key={label} className="flex items-center gap-2 mb-1">
          <span
            className="inline-block w-3 h-3 rounded-full border-2"
            style={{ borderColor: color, backgroundColor: "transparent" }}
          />
          <span>{label}</span>
        </div>
      ))}

      <p className="text-slate-500 mt-2 mb-1">Flow Speed</p>
      <div className="flex items-center gap-2">
        <span className="text-slate-400">Faster = higher volume</span>
      </div>
    </div>
  );
}
